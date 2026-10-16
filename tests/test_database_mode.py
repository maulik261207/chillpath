from pathlib import Path
from app.core.config import Settings

def test_sqlite_mode_resolves_repository_database():
    settings = Settings(database_mode="sqlite", database_url="postgresql+asyncpg://stale/value")
    assert settings.resolved_database_url.startswith("sqlite+aiosqlite:///")
    assert settings.resolved_database_url.endswith("/chillpath.db")

def test_postgres_mode_preserves_url():
    url = "postgresql+asyncpg://user:pass@host/db"
    assert Settings(database_mode="postgres", database_url=url).resolved_database_url == url
