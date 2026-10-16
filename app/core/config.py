from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "ChillPath API"
    environment: str = "local"
    database_url: str = "sqlite+aiosqlite:///./chillpath.db"
    database_mode: str = "sqlite"
    auto_create_schema: bool = True
    api_prefix: str = "/v1"
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"
    geoapify_api_key: str | None = None
    tomtom_api_key: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def resolved_database_url(self) -> str:
        """Resolve local SQLite from the repository root unless PostgreSQL is explicit."""
        if self.database_mode.lower() != "postgres":
            db_path = (Path(__file__).resolve().parents[2] / "chillpath.db").as_posix()
            return f"sqlite+aiosqlite:///{db_path}"
        return self.database_url


def get_settings() -> Settings:
    return Settings()

