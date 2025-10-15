Mail Worker – Batch Mail Ingestion Pipeline

Overview
- Multi-threaded worker that scans `wait/`, batches by domain (50 per batch), moves to `run/`, processes with four worker threads, writes to Weaviate (multi-tenancy per domain) and Mail Status DB (SQLite), and manages file lifecycle (success delete, failure move to `buggy/`).
- Collection is ensured on startup in the main thread. Each thread keeps its own DB connections via thread-local.
- Graceful shutdown via `threading.Event` and poison pills in the queue.

Quick Start
- Copy `config.example.yaml` to `config.yaml` and adjust paths and Weaviate settings.
- Run: `python -m mail_worker.main --config config.yaml`
- Query status:
  - Domain stats: `python -m mail_worker.query --config config.yaml domain-stats example.com`
  - User stats: `python -m mail_worker.query --config config.yaml user-stats user@example.com`
  - Progress: `python -m mail_worker.query --config config.yaml progress`

Sample data
- Generate mails into `wait/`: `python tools/generate_mails.py wait/ --count 300 --domains 6`

Config Highlights
- All directories (`wait/`, `run/`, `buggy/`, SQLite path) from config.
- Queue `maxsize`, worker `threads`, `poll_interval` configurable.
- Weaviate: host, API key (optional), vectorizer provider (`openai` or `ollama`), model, and `vector_dimensions`.

Notes
- Schema filter fields can be adjusted in `WeaviateMailDatabase.ensure_collection()` with clear comments on how to add/rename `filter_*` fields.
- File grouping uses domain parsed from filename; if unavailable, later steps will implement a fallback to read JSON safely to determine domain.

Details
- Orchestrator
  - On startup, ensures Weaviate collection (main thread) and moves any leftover `run/*.json` back to `wait/`.
  - Every `poll_interval` seconds, scans `wait/` for up to 1000 `.json` files, groups by domain (from filename; fallback to JSON), caps each domain to 50 files, and selects batches prioritizing full 50 → 49 → … until the queue’s remaining capacity is filled.
  - Moves selected files to `run/` immediately, inserts "pending" rows into SQLite for progress tracking, and enqueues `MailBatch(domain, file_paths)`.

- Worker Threads (4 by default)
  - Each thread maintains its own thread-local Weaviate client and SQLite connection.
  - For each batch: parse JSON; import to Weaviate using `client.batch.dynamic()`; update Mail Status DB (success/failure) transactionally; delete successful files; move failed files to `buggy/`.
  - Parse failures go directly to `buggy/`.

- Mail Status DB (SQLite)
  - Table: `mail_status(mail_id, user_id, domain, is_completed, is_success, received_time, error_message)`
  - Indexes: `idx_domain_stats(domain, is_completed, is_success)`, `idx_user_stats(user_id, is_completed, is_success)`, `idx_time_progress(received_time, is_completed)`
  - Pending rows are inserted when batches are enqueued; completed success/failure updates overwrite the same row.

- Weaviate Collection (multi-tenancy)
  - Default class name: `MailDoc`.
  - Required props: `filter_user_id`, `filter_year`, `filter_month`, `filter_day`, `mail_id`, `search_mail_content`, `search_mail_header`.
  - Optional props: any `filter_*` (e.g., `filter_mailbox`, `filter_folder`). Modify in `ensure_collection()` and ensure your parser provides them.
  - Batch import uses `client.batch.dynamic()`; failures collected via `batch.failed_objects` and recorded to the SQLite DB.

File Naming and Domain Extraction
- Preferred: include `domain=<domain>` in filenames (e.g., `mail123__domain=example.com__.json`).
- Fallback: detect `@domain` or read JSON for `domain` or `user_id` to extract domain.

Graceful Shutdown
- `CTRL+C` or SIGTERM sets a shutdown flag, sends poison pills to workers, waits for workers to exit, and closes connections.
