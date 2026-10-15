from app.core.config import get_settings


def test_get_settings_reads_current_environment(monkeypatch):
    monkeypatch.setenv("APP_NAME", "Test App")
    monkeypatch.setenv("API_PREFIX", "/custom")
    monkeypatch.setenv("CORS_ORIGINS", "https://alpha.local, https://beta.local")

    settings = get_settings()

    assert settings.app_name == "Test App"
    assert settings.api_prefix == "/custom"
    assert settings.cors_origin_list == ["https://alpha.local", "https://beta.local"]
