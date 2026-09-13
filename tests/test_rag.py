import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

def test_chat_hybrid_rag(auth_client):
    # Mock RRF candidate results: (chunk_text, page_number, filename, rrf_score)
    mock_candidates = [
        ("Chunk about deep learning fundamentals", 1, "intro_ml.pdf", 0.032),
        ("Chunk about optimizer algorithms and Adam", 3, "intro_ml.pdf", 0.028),
    ]

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    # Mock candidate search fetchall, chat history fetchall, and message insert
    mock_cursor.fetchall.side_effect = [
        mock_candidates,  # candidate chunks from RRF
        [],               # chat history
    ]
    mock_db.cursor.return_value.__enter__.return_value = mock_cursor

    # Mock sentence embedding
    mock_emb = MagicMock()
    mock_emb.tolist.return_value = [0.1] * 384

    # Mock Groq stream
    async def fake_stream():
        chunk = MagicMock()
        chunk.choices = [MagicMock(delta=MagicMock(content="Deep learning relies on gradient backpropagation."))]
        yield chunk

    with patch("main.get_db_connection") as mock_conn, \
         patch("main.model.embed", return_value=[mock_emb]), \
         patch("main.create_groq_stream_with_retry", new_callable=AsyncMock, return_value=fake_stream()):
        
        mock_conn.return_value.__enter__.return_value = mock_db
        
        response = auth_client.post(
            "/chat",
            json={
                "query": "How does deep learning optimization work?",
                "top_k": 2,
                "document_id": "doc_123"
            }
        )

        assert response.status_code == 200
        content = response.text
        assert "Deep learning relies on gradient backpropagation." in content
        assert "<<<SOURCES>>>" in content

        # Verify sources payload contains document citations with page numbers
        sources_json_str = content.split("<<<SOURCES>>>")[1]
        sources = json.loads(sources_json_str)
        assert "documents" in sources
        assert len(sources["documents"]) > 0
        assert sources["documents"][0]["filename"] == "intro_ml.pdf"
        assert "page_number" in sources["documents"][0]
