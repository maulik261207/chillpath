# ChillPath SQLite hackathon setup

This mode uses `chillpath.db` in the project root. It keeps PostgreSQL support
and does not modify or remove the PostgreSQL Alembic migrations.

## First run on Windows

From the repository folder:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e .
```

Double-click `start_chillpath.bat`. The script checks for the virtual
environment, selects `sqlite+aiosqlite:///./chillpath.db`, and starts FastAPI.
The existing startup schema creation is additive and does not delete data.

Open `http://127.0.0.1:8000/docs` for the API and
`http://127.0.0.1:8000/v1/local/database/summary` for a read-only table count
summary. SQLite is for local development and demonstrations; PostgreSQL remains
the deployment option for commercial use.

## Historical import

Put `Preprocessed.zip` and `experiment_actions.csv` in `datasets/`, then run
`import_dataset.bat`. The same bounded, idempotent importer works with SQLite.
It preserves NULL values and source timestamps. The importer does not send SMS
or start replay. Keep the original files separately as the source of record.

For a full import, expect 1,411,515 measurements and 127 actions. SQLite can
take a while and needs free disk space. Do not interrupt the process unless
necessary; a failed transaction is rolled back. PostgreSQL migrations are not
run automatically in this mode.

## PostgreSQL mode

Remove the launcher’s SQLite environment overrides and set `DATABASE_URL` in
`.env` to a PostgreSQL `postgresql+asyncpg://...` URL. Existing Alembic
migrations and PostgreSQL deployments remain supported.
