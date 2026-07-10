import os
import uuid
import io
import boto3
import psycopg2
from psycopg2.extras import execute_values # NEW: For bulk database inserts
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks # NEW: BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from pydantic import BaseModel
from typing import Optional

# --- NEW: Data model for our search request ---
class SearchQuery(BaseModel):
    query: str
    document_id: Optional[str] = None # Optional: If we only want to search one specific PDF
    top_k: int = 3 # How many paragraphs to return 

# 1. Setup & Config
load_dotenv()
app = FastAPI(title="Pagewise API - Phase 2 (Optimized)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading embedding model...")
model = SentenceTransformer('all-MiniLM-L6-v2')
print("Model loaded successfully!")

s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("SUPABASE_ENDPOINT_URL"),
    aws_access_key_id=os.getenv("SUPABASE_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("SUPABASE_SECRET_ACCESS_KEY"),
    region_name="us-east-1", 
)
BUCKET_NAME = os.getenv("SUPABASE_BUCKET_NAME")

def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))

# --- NEW: The Background AI Worker ---
def process_pdf_background(file_bytes: bytes, doc_id: str):
    try:
        print(f"[{doc_id}] Starting background AI processing...")
        
        # 1. Extract Text
        reader = PdfReader(io.BytesIO(file_bytes))
        full_text = "".join(page.extract_text() + "\n" for page in reader.pages)
        full_text = full_text.replace('\x00', '')

        # 2. Split into Chunks
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(full_text)
        
        if not chunks:
            print(f"[{doc_id}] No text found in PDF.")
            return

        print(f"[{doc_id}] Creating vectors for {len(chunks)} chunks simultaneously...")
        
        # 3. FAST BATCH EMBEDDING: Hand the whole list to the model at once
        embeddings = model.encode(chunks).tolist()

        # 4. FAST BATCH INSERT: Prepare data for a single database call
        records = [
            (str(uuid.uuid4()), doc_id, i, chunk, embedding) 
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]

        conn = get_db_connection()
        cur = conn.cursor()
        
        # Write all chunks to Neon in one single network request
        execute_values(
            cur,
            "INSERT INTO document_chunks (id, document_id, chunk_index, chunk_text, embedding) VALUES %s",
            records
        )
        
        conn.commit()
        cur.close()
        conn.close()
        print(f"[{doc_id}] Processing complete! Saved {len(chunks)} vectors.")

    except Exception as e:
        print(f"[{doc_id}] Background processing failed: {e}")


# --- UPDATED: The Upload Endpoint --
@app.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    user_id: str = Form(...)
):
    print("\n--- NEW UPLOAD REQUEST ---")
    print(f"1. Backend received file: {file.filename}")
    
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    doc_id = str(uuid.uuid4())
    s3_key = f"{user_id}/{doc_id}_{file.filename}"

    try:
        print("2. Reading file into memory...")
        file_bytes = await file.read()

        print("3. Attempting to upload to Supabase Storage...")
        s3.upload_fileobj(
            io.BytesIO(file_bytes), 
            BUCKET_NAME, 
            s3_key,
            ExtraArgs={"ContentType": "application/pdf"}
        )
        print(" -> Supabase upload SUCCESS!")

        print("4. Attempting to connect to Neon Database...")
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO documents (id, user_id, filename, s3_key) VALUES (%s, %s, %s, %s)",
            (doc_id, user_id, file.filename, s3_key)
        )
        conn.commit()
        cur.close()
        conn.close()
        print(" -> Neon database insert SUCCESS!")

        print("5. Triggering AI background task...")
        background_tasks.add_task(process_pdf_background, file_bytes, doc_id)

        print("6. Sending success response back to frontend!")
        return {
            "message": "File uploaded! AI is processing your document in the background.", 
            "document_id": doc_id
        }

    except Exception as e:
        print(f"!!! BACKEND ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

        # --- PHASE 3: THE SEMANTIC SEARCH ENDPOINT ---
@app.post("/search")
async def search_documents(search: SearchQuery):
    try:
        print(f"🔎 Searching for: '{search.query}'")
        
        # 1. Turn the user's question into a math vector using our local model
        query_vector = model.encode(search.query).tolist()
        
        # Format the vector strictly for Neon/pgvector (e.g., '[0.1, 0.2, ...]')
        query_vector_str = "[" + ",".join(map(str, query_vector)) + "]"

        conn = get_db_connection()
        cur = conn.cursor()

        # 2. Run the Vector Similarity Search
        if search.document_id:
            # Search inside one specific document
            cur.execute("""
                SELECT chunk_text, 1 - (embedding <=> %s::vector) AS similarity 
                FROM document_chunks 
                WHERE document_id = %s
                ORDER BY embedding <=> %s::vector 
                LIMIT %s
            """, (query_vector_str, search.document_id, query_vector_str, search.top_k))
        else:
            # Search across your entire library of documents
            cur.execute("""
                SELECT chunk_text, 1 - (embedding <=> %s::vector) AS similarity 
                FROM document_chunks 
                ORDER BY embedding <=> %s::vector 
                LIMIT %s
            """, (query_vector_str, query_vector_str, search.top_k))

        results = cur.fetchall()
        cur.close()
        conn.close()

        # 3. Clean up the results to send back to the frontend
        chunks = [{"text": row[0], "score": round(row[1], 4)} for row in results]

        print(f"✅ Found {len(chunks)} relevant chunks!")
        return {"query": search.query, "results": chunks}

    except Exception as e:
        print(f"!!! SEARCH ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)