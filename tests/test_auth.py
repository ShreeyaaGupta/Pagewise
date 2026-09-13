import pytest
from unittest.mock import patch, MagicMock
import jwt
from fastapi import HTTPException
from main import get_current_user

def test_health_check(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_unauthenticated_request_rejected(client):
    response = client.get("/documents")
    assert response.status_code == 401 or response.status_code == 403

def test_invalid_bearer_token(client):
    response = client.get("/documents", headers={"Authorization": "Bearer invalid_token"})
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_get_current_user_valid_claims():
    credentials = MagicMock()
    credentials.credentials = "valid.jwt.token"

    mock_signing_key = MagicMock()
    mock_signing_key.key = "fake_key"

    with patch("main.jwks_client") as mock_jwks, \
         patch("jwt.decode") as mock_decode:
        mock_jwks.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_decode.return_value = {"sub": "user_2test_abc"}

        user_id = await get_current_user(credentials)
        assert user_id == "user_2test_abc"

@pytest.mark.asyncio
async def test_get_current_user_missing_sub():
    credentials = MagicMock()
    credentials.credentials = "valid.jwt.token"

    mock_signing_key = MagicMock()
    mock_signing_key.key = "fake_key"

    with patch("main.jwks_client") as mock_jwks, \
         patch("jwt.decode") as mock_decode:
        mock_jwks.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_decode.return_value = {}  # Missing "sub" claim

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(credentials)
        assert exc_info.value.status_code == 401
