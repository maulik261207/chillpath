from app.api.local_database import database_summary

def test_local_summary_is_read_only_callable():
    assert callable(database_summary)
