import sys
import os
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

# Add backend and workspace to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Set test environment variables
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/testdb"
os.environ["CLERK_JWKS_URL"] = "https://test.clerk.accounts.dev/.well-known/jwks.json"
os.environ["GROQ_API_KEY"] = "gsk_test_key"
os.environ["SUPABASE_BUCKET_NAME"] = "test-bucket"
os.environ["LOG_LEVEL"] = "DEBUG"

from fastapi.testclient import TestClient
from main import app, get_current_user

@pytest.fixture
def mock_db_cursor():
    cursor = MagicMock()
    cursor.fetchall.return_value = []
    cursor.fetchone.return_value = None
    return cursor

@pytest.fixture
def mock_db_connection(mock_db_cursor):
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value = mock_db_cursor
    return conn

@pytest.fixture
def client():
    """Returns a test client with standard dependency overrides."""
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def auth_client():
    """Returns a test client with authenticated user dependency override."""
    app.dependency_overrides[get_current_user] = lambda: "user_test_12345"
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
