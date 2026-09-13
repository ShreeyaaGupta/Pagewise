from unittest.mock import patch, MagicMock

def test_rate_limiting_exceeded(auth_client):
    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = []
    mock_db.cursor.return_value.__enter__.return_value = mock_cursor

    with patch("main.get_db_connection") as mock_conn:
        mock_conn.return_value.__enter__.return_value = mock_db
        
        # /documents has limit of 60/minute; sending requests in a tight loop to test limiter response
        responses = []
        for _ in range(70):
            res = auth_client.get("/documents")
            responses.append(res.status_code)

        # Ensure at least one request triggered 429 Too Many Requests
        assert 429 in responses
