# Pagewise

> Full-stack Retrieval-Augmented Generation (RAG) platform with Hybrid Search (Vector + Full-Text Search), local CPU embeddings, and real-time, cited conversational AI.

---

## ⚡ Features

- **Multi-Format Ingestion:** Seamlessly upload and parse `.pdf`, `.docx`, and `.csv` files with instant SHA-256 deduplication.
- **Local CPU Embeddings:** Uses `FastEmbed` (`all-MiniLM-L6-v2` via ONNX) for 384-dimensional embeddings with **$0 API cost** and **zero network latency**.
- **PostgreSQL Hybrid Search:** Combines dense semantic search (`pgvector` cosine distance) and sparse keyword search (`tsvector` Full-Text Search) using **Reciprocal Rank Fusion (RRF)**.
- **Ultra-Fast LLM Streaming:** Streams answers token-by-token at 200+ tokens/sec powered by **Groq** LPU inference with automatic model fallback.
- **Grounded Source Citations:** Delivers verified page-level citations extracted directly from database chunks, eliminating hallucinated references.
- **Stateless Asymmetric Auth:** Verified in-memory via **Clerk JWKS** (`RS256`), ensuring complete multi-tenant data isolation.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TailwindCSS v4, Lucide Icons |
| **Backend** | FastAPI (Python 3.11), Uvicorn, SlowAPI rate limiting, Loguru |
| **Database & Search** | PostgreSQL (Neon Serverless) with `pgvector` & Full-Text Search (FTS) |
| **Embeddings** | FastEmbed (`sentence-transformers/all-MiniLM-L6-v2` via ONNX) |
| **LLM Inference** | Groq Cloud (`llama-3.3-70b-versatile` / `openai/gpt-oss-120b`) |
| **Object Storage** | Supabase Storage (S3-compatible API via boto3) |
| **Authentication** | Clerk (JWT with RS256 JWKS validation) |

---

## 🚀 Running Locally

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & `npm`
- Accounts for: [Clerk](https://clerk.com), [Neon PostgreSQL](https://neon.tech), [Groq Cloud](https://console.groq.com), and [Supabase](https://supabase.com).

---

### 1. Clone the Repository
```bash
git clone https://github.com/ShreeyaaGupta/Pagewise.git
cd Pagewise
```

---

### 2. Backend Setup

1. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   
   # Windows (PowerShell):
   .venv\Scripts\Activate.ps1

   # macOS / Linux:
   source .venv/bin/activate
   ```

2. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Create `backend/.env` with your credentials:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
   CLERK_JWKS_URL="https://<your-clerk-instance>.clerk.accounts.dev/.well-known/jwks.json"
   SUPABASE_ENDPOINT_URL="https://<project-ref>.storage.supabase.co/storage/v1/s3"
   SUPABASE_ACCESS_KEY_ID="<your-supabase-s3-access-key>"
   SUPABASE_SECRET_ACCESS_KEY="<your-supabase-s3-secret-key>"
   SUPABASE_BUCKET_NAME="documents"
   GROQ_API_KEY="<your-groq-api-key>"
   ```

4. Start the FastAPI backend server:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```
   *The backend will be available at `http://localhost:8000` (API docs at `/docs`).*

---

### 3. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="<your-clerk-publishable-key>"
   CLERK_SECRET_KEY="<your-clerk-secret-key>"
   NEXT_PUBLIC_API_URL="http://localhost:8000"
   ```

4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   *The frontend application will be live at `http://localhost:3000`.*

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
