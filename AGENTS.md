# Repository Guidelines

## Project Structure & Modules
- Source lives in `mail_worker/`:
  - `main.py` – Orchestrator: scanning `wait/`, batching by domain, queueing, threads.
  - `worker.py` – Batch processing, Weaviate import, file lifecycle to `buggy/` or delete.
  - `database.py` – SQLite status DB and Weaviate client/schema helpers.
  - `models.py` – Dataclasses for `Mail`, `MailBatch`, conversions to Weaviate props.
  - `config.py` – YAML config loader to `AppConfig`.
  - `query.py` – CLI for `domain-stats`, `user-stats`, `progress`.
- Config: copy `config.example.yaml` → `config.yaml`. Runtime paths come from config: `wait/`, `run/`, `buggy/`, `mail_status.db`.

## Build, Run, Test
- Python 3.10+ recommended. Create venv:
  - `python -m venv .venv && source .venv/bin/activate`
- Install deps (local dev):
  - `pip install -U weaviate-client pyyaml`
- Run worker:
  - `python -m mail_worker.main --config config.yaml`
- Query status:
  - `python -m mail_worker.query --config config.yaml domain-stats example.com`
- Tests: no suite committed yet. Prefer `pytest`:
  - `pip install -U pytest`
  - `pytest -q`

## Coding Style & Naming
- Python, 4-space indentation, type hints required for new/changed code.
- Names: modules/functions `snake_case`; classes `PascalCase`; constants `UPPER_SNAKE`.
- Logging via `logging.getLogger(__name__)`; avoid prints.
- Prefer dataclasses and small, focused functions. Example: `def _parse_domain_from_filename(name: str) -> Optional[str]: ...`

## Testing Guidelines
- Place tests under `tests/`, name files `test_*.py`.
- Use temp dirs for `wait/`, `run/`, `buggy/`; assert DB updates and file lifecycle.
- Aim to cover: domain batching, enqueueing, success/failure paths, and query CLI output.

## Commit & PR Guidelines
- Use clear Conventional Commits (e.g., `feat:`, `fix:`, `docs:`).
- PRs include: summary, rationale, CLI examples (commands/output), risks/rollback, and linked issues.
- Keep diffs minimal; update `config.example.yaml` and README when config/schema changes.

## Security & Config
- Do not commit secrets. Keep `config.yaml` local; update `config.example.yaml` for defaults.
- Validate Weaviate `host` and API key via local config; never hardcode.

## Architecture Notes
- Single orchestrator batches by domain and enqueues; N worker threads import to Weaviate (multi-tenancy) and update SQLite for progress tracking.

