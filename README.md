# Pagewise

Pagewise is a RAG-based document Q&A platform built for exploring and querying personal documents (PDFs, PPTX, DOCX, images) with source-grounded, cited answers.

## Features

- **Authentication** — User accounts and session management via Clerk.
- **Full RAG Pipeline** — Document ingestion, chunking, embedding, and retrieval powered by Supabase, Neon (Postgres), and Tavily.
- **Citation Sourcing** — Answers are grounded in retrieved chunks with inline citations back to the source document.
- **Document Management** — Seamless upload, save, and deletion of documents directly from the sidebar.
- **Scoped Document Context** — When multiple documents exist in a user's profile, a specific document can be brought into active context for focused Q&A, rather than searching across the entire library.

## Tech Stack

| Layer | Technology |
|---|---|
| Auth | Clerk |
| Database | Neon (Postgres) |
| Backend-as-a-Service | Supabase |
| Search / Retrieval | Tavily |
| Frontend | Next.js |

## How It Works

1. **Upload** — User uploads a document (PDF/PPTX/DOCX/image), which is stored and processed.
2. **Chunk & Embed** — Document content is split into chunks and embedded for semantic retrieval.
3. **Query** — User asks a question; relevant chunks are retrieved via the RAG pipeline.
4. **Answer with Citations** — The model generates a response grounded in retrieved chunks, with citations pointing back to the source.
5. **Context Scoping** — Users can select a specific document from their sidebar to scope the conversation, or query across all documents.



## License

TBD
