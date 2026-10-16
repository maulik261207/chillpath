# Import the historical dataset on Windows

1. Create a folder named `datasets` in the ChillPath project root.
2. Put `SENSOR01_preprocessed.csv` through `SENSOR09_preprocessed.csv` directly inside it.
   `experiment_actions.csv` is optional; when present, it is imported and shown as historical action markers.
3. SQLite mode is automatic and uses the project-root `chillpath.db`. A stale PostgreSQL URL in `.env` cannot override the batch scripts.
4. The importer initializes SQLite tables additively; PostgreSQL does not need to be running.
5. Run the streaming importer:
   ```bash
   .venv/bin/python scripts/import_historical_dataset.py \
     --archive datasets --organization-slug demo-123
   ```
   A ZIP containing the nine sensor files is still accepted through `--archive`.
6. Select an existing organization, or type `y` when prompted to create `ChillPath Demo`.
7. Read the final counts and open `import_verification_report.txt`.

The tool uses the existing streaming importer, preserves NULL measurements and source timestamps, and is safe to run again. It creates missing local tables additively, never deletes operational data, sends SMS, or starts replay.

Common errors:

- **PostgreSQL connection errors**: use `import_dataset.bat` or `start_chillpath.bat`; both force SQLite for the hackathon.
- **Missing historical tables**: run `alembic upgrade head` after reviewing the migration output.
- **Dataset files not found**: check spelling and place both files directly under `datasets`.
- **No organization**: answer `y` to create the dedicated demo tenant.

## Verify a real replay

After the import completes, double-click `verify_replay.bat`. It uses the same
project-root `chillpath.db`, verifies 1,411,515 measurements and 127 actions,
selects a real 30-minute interval, runs the existing bounded replay worker, and
writes `replay_verification_report.txt`. Running it again reuses a completed
session instead of creating another analysis run.
