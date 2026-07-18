import os
import uuid
import io
import boto3
import psycopg2
import json 
from psycopg2.extras import execute_values 
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks 
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from pydantic import BaseModel
from typing import Optional
from groq import AsyncGroq
# NEW: Import TavilyClient instead of DDGS
from tavily import TavilyClient

class SearchQuery(BaseModel):
    query: str
    document_id: Optional[str] = None 
    top_k: int = 3 
    user_id: Optional[str] = None 

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

print("Initializing Groq Client...")
groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
print("Groq Client ready!")

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

def process_pdf_background(file_bytes: bytes, doc_id: str):
    try:
        print(f"[{doc_id}] Starting background AI processing...")
        
        reader = PdfReader(io.BytesIO(file_bytes))
        full_text = "".join(page.extract_text() + "\n" for page in reader.pages)
        full_text = full_text.replace('\x00', '')

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(full_text)
        
        if not chunks:
            print(f"[{doc_id}] No text found in PDF.")
            return

        print(f"[{doc_id}] Creating vectors for {len(chunks)} chunks simultaneously...")
        
        embeddings = model.encode(chunks).tolist()

        records = [
            (str(uuid.uuid4()), doc_id, i, chunk, embedding) 
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]

        conn = get_db_connection()
        cur = conn.cursor()
        
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

@app.get("/documents")
async def list_documents(user_id: str):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, filename, s3_key FROM documents WHERE user_id = %s ORDER BY filename ASC",
            (user_id,)
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        documents = [{"id": row[0], "filename": row[1], "s3_key": row[2]} for row in rows]
        return documents
    except Exception as e:
        print(f"!!! LIST DOCUMENTS ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT s3_key FROM documents WHERE id = %s", (document_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Document not found")
        
        s3_key = row[0]
        
        try:
            s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
            print(f"Deleted S3 object: {s3_key}")
        except Exception as s3_err:
            print(f"Warning: Failed to delete S3 object {s3_key}: {s3_err}")
        
        cur.execute("DELETE FROM chat_messages WHERE document_id = %s", (document_id,))
        cur.execute("DELETE FROM document_chunks WHERE document_id = %s", (document_id,))
        cur.execute("DELETE FROM documents WHERE id = %s", (document_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return {"message": "Document successfully deleted"}
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"!!! DELETE DOCUMENT ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
async def search_documents(search: SearchQuery):
    try:
        print(f"🔎 Searching for: '{search.query}'")
        
        query_vector = model.encode(search.query).tolist()
        query_vector_str = "[" + ",".join(map(str, query_vector)) + "]"

        conn = get_db_connection()
        cur = conn.cursor()

        if search.document_id:
            cur.execute("""
                SELECT chunk_text, 1 - (embedding <=> %s::vector) AS similarity 
                FROM document_chunks 
                WHERE document_id = %s
                ORDER BY embedding <=> %s::vector 
                LIMIT %s
            """, (query_vector_str, search.document_id, query_vector_str, search.top_k))
        else:
            cur.execute("""
                SELECT chunk_text, 1 - (embedding <=> %s::vector) AS similarity 
                FROM document_chunks 
                ORDER BY embedding <=> %s::vector 
                LIMIT %s
            """, (query_vector_str, query_vector_str, search.top_k))

        results = cur.fetchall()
        cur.close()
        conn.close()

        chunks = [{"text": row[0], "score": round(row[1], 4)} for row in results]

        print(f"Found {len(chunks)} relevant chunks!")
        return {"query": search.query, "results": chunks}

    except Exception as e:
        print(f"!!! SEARCH ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/chat/history")
async def get_chat_history(user_id: str, document_id: Optional[str] = None):
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        if document_id:
            cur.execute(
                "SELECT role, content FROM chat_messages WHERE user_id = %s AND document_id = %s ORDER BY created_at ASC",
                (user_id, document_id)
            )
        else:
            cur.execute(
                "SELECT role, content FROM chat_messages WHERE user_id = %s AND document_id IS NULL ORDER BY created_at ASC",
                (user_id,)
            )
            
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        history = [{"role": row[0], "content": row[1]} for row in rows]
        return history
    except Exception as e:
        print(f"!!! GET CHAT HISTORY ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_with_document(search: SearchQuery):
    try:
        query_vector = model.encode(search.query).tolist()
        query_vector_str = "[" + ",".join(map(str, query_vector)) + "]"

        conn = get_db_connection()
        cur = conn.cursor()

        if search.document_id:
            cur.execute("""
                WITH vector_search AS (
                    SELECT chunk_text, row_number() over (ORDER BY embedding <=> %s::vector) as rank
                    FROM document_chunks
                    WHERE document_id = %s
                    LIMIT 20
                ),
                keyword_search AS (
                    SELECT chunk_text, row_number() over (ORDER BY ts_rank(fts, websearch_to_tsquery('english', %s)) DESC) as rank
                    FROM document_chunks
                    WHERE document_id = %s AND fts @@ websearch_to_tsquery('english', %s)
                    LIMIT 20
                )
                SELECT chunk_text,
                       COALESCE(1.0 / (v.rank + 60), 0.0) + COALESCE(1.0 / (k.rank + 60), 0.0) AS rrf_score
                FROM vector_search v
                FULL OUTER JOIN keyword_search k USING (chunk_text)
                ORDER BY rrf_score DESC
                LIMIT %s;
            """, (query_vector_str, search.document_id, search.query, search.document_id, search.query, search.top_k))
        else:
            cur.execute("""
                WITH vector_search AS (
                    SELECT chunk_text, row_number() over (ORDER BY embedding <=> %s::vector) as rank
                    FROM document_chunks
                    LIMIT 20
                ),
                keyword_search AS (
                    SELECT chunk_text, row_number() over (ORDER BY ts_rank(fts, websearch_to_tsquery('english', %s)) DESC) as rank
                    FROM document_chunks
                    WHERE fts @@ websearch_to_tsquery('english', %s)
                    LIMIT 20
                )
                SELECT chunk_text,
                       COALESCE(1.0 / (v.rank + 60), 0.0) + COALESCE(1.0 / (k.rank + 60), 0.0) AS rrf_score
                FROM vector_search v
                FULL OUTER JOIN keyword_search k USING (chunk_text)
                ORDER BY rrf_score DESC
                LIMIT %s;
            """, (query_vector_str, search.query, search.query, search.top_k))

        results = cur.fetchall()
        cur.close()
        conn.close()

        retrieved_context = "\n\n---\n\n".join([row[0] for row in results])

        # --- UPDATED: TAVILY WEB SEARCH INTEGRATION ---
        web_context = ""
        sources_metadata = [] 
        
        try:
            print("🌍 Fetching web search results using Tavily...")
            tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
            
            # Request search results from Tavily
            tavily_response = tavily_client.search(search.query, max_results=3)
            web_results = tavily_response.get("results", [])
            
            if web_results:
                web_context = "Web Search Results:\n"
                for i, res in enumerate(web_results, 1):
                    # Tavily maps out data to 'title', 'url', and 'content' 
                    web_context += f"[{i}] {res['title']} (URL: {res['url']}): {res['content']}\n\n"
                    # Append strictly as "title" and "url" to match your frontend types
                    sources_metadata.append({"title": res['title'], "url": res['url']})
        except Exception as e:
            print(f"⚠️ Web search failed or timed out: {e}")

        final_context = f"Local Document Context:\n{retrieved_context}\n\n{web_context}"

        prompt = f"""
        You are a highly intelligent academic assistant. Answer the user's question directly and naturally.

        CRITICAL INSTRUCTIONS:
        - DO NOT start your response with phrases like "Based on the provided context" or "According to the Web Search Results". Just answer the question immediately.
        - DO NOT mention the terms "Local Document Context" or "Web Search Results" in your response.
        - DO NOT use any citation markers, brackets, or numbers (like [1], [2]) in your text response. Integrate the information seamlessly.
        - If the answer cannot be found, simply state: "I cannot answer this based on the available information."

        Context:
        {final_context}

        User Question:
        {search.query}
        """
        async def stream_groq_response():
            full_ai_response = ""
            
            conn = get_db_connection()
            cur = conn.cursor()
            
            if search.document_id:
                cur.execute("""
                    SELECT role, content FROM chat_messages 
                    WHERE document_id = %s AND user_id = %s
                    ORDER BY created_at DESC 
                    LIMIT 6
                """, (search.document_id, search.user_id))
            else:
                cur.execute("""
                    SELECT role, content FROM chat_messages 
                    WHERE document_id IS NULL AND user_id = %s
                    ORDER BY created_at DESC 
                    LIMIT 6
                """, (search.user_id,))
                
            history_rows = cur.fetchall()
            cur.close()
            conn.close()

            history_rows.reverse()

            groq_messages = [
                {"role": "system", "content": "You are a helpful academic assistant."}
            ]
            
            for row in history_rows:
                groq_messages.append({"role": row[0], "content": row[1]})
                
            groq_messages.append({"role": "user", "content": prompt})

            stream = await groq_client.chat.completions.create(
                messages=groq_messages, 
                model="llama-3.1-8b-instant",
                temperature=0.2,
                stream=True
            )
            
            async for chunk in stream:
                token = chunk.choices[0].delta.content
                if token:
                    full_ai_response += token
                    yield token

            if sources_metadata:
                yield f"\n\n<<<SOURCES>>>{json.dumps(sources_metadata)}"
                
            try:
                print("Stream finished. Saving conversation to database...")
                conn = get_db_connection()
                cur = conn.cursor()
                
                user_msg_id = str(uuid.uuid4())
                ai_msg_id = str(uuid.uuid4())
                
                cur.execute(
                    "INSERT INTO chat_messages (id, document_id, role, content, user_id) VALUES (%s, %s, %s, %s, %s)",
                    (user_msg_id, search.document_id, "user", search.query, search.user_id)
                )
                
                cur.execute(
                    "INSERT INTO chat_messages (id, document_id, role, content, user_id) VALUES (%s, %s, %s, %s, %s)",
                    (ai_msg_id, search.document_id, "assistant", full_ai_response, search.user_id)
                )
                
                conn.commit()
                cur.close()
                conn.close()
                print("Chat history successfully stored!")
                
            except Exception as db_error:
                print(f"Database error saving history: {str(db_error)}")

        return StreamingResponse(stream_groq_response(), media_type="text/plain")

    except Exception as e:
        print(f"!!! GENERATION ERROR: {str(e)} !!!")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)