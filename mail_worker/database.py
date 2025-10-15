from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Dict, Iterable, List, Optional, Tuple


class MailStatusDB:
    """Thread-local SQLite for mail status tracking.

    Schema (static):
      - mail_id TEXT, user_id TEXT, domain TEXT
      - is_completed INTEGER (0/1)
      - is_success INTEGER (0/1)
      - received_time TEXT (timestamp string)
      - error_message TEXT (optional; for failure reason)

    Indexes:
      - idx_domain_stats(domain, is_completed, is_success)
      - idx_user_stats(user_id, is_completed, is_success)
      - idx_time_progress(received_time, is_completed)
    """

    def __init__(self, sqlite_path: str) -> None:
        self.sqlite_path = sqlite_path
        self._local = threading.local()
        # Ensure directory exists
        os.makedirs(os.path.dirname(os.path.abspath(sqlite_path)) or ".", exist_ok=True)
        # Create schema on the main thread connection
        conn = self._get_connection()
        try:
            self._ensure_schema(conn)
        finally:
            # Close the bootstrap connection; let each thread manage its own later
            self.close_current_thread()

    def _get_connection(self) -> sqlite3.Connection:
        conn: Optional[sqlite3.Connection] = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.sqlite_path, check_same_thread=False, isolation_level=None)
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA foreign_keys=ON;")
            self._local.conn = conn
        return conn

    def close_current_thread(self) -> None:
        conn: Optional[sqlite3.Connection] = getattr(self._local, "conn", None)
        if conn is not None:
            try:
                conn.close()
            finally:
                self._local.conn = None

    def _ensure_schema(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS mail_status (
                mail_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                domain TEXT NOT NULL,
                is_completed INTEGER NOT NULL,
                is_success INTEGER NOT NULL,
                received_time TEXT NOT NULL,
                error_message TEXT NULL
            );
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_domain_stats ON mail_status (domain, is_completed, is_success);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_stats ON mail_status (user_id, is_completed, is_success);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_time_progress ON mail_status (received_time, is_completed);"
        )

    @contextmanager
    def transaction(self):
        conn = self._get_connection()
        try:
            conn.execute("BEGIN")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            finally:
                raise

    def _upsert_row(
        self,
        conn: sqlite3.Connection,
        *,
        mail_id: str,
        user_id: str,
        domain: str,
        received_time: str,
        is_completed: bool,
        is_success: bool,
        error_message: Optional[str] = None,
    ) -> None:
        cur = conn.execute("SELECT 1 FROM mail_status WHERE mail_id = ?", (mail_id,))
        exists = cur.fetchone() is not None
        if exists:
            conn.execute(
                """
                UPDATE mail_status
                SET user_id = ?, domain = ?, received_time = ?, is_completed = ?, is_success = ?, error_message = ?
                WHERE mail_id = ?
                """,
                (user_id, domain, received_time, int(is_completed), int(is_success), error_message, mail_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO mail_status (mail_id, user_id, domain, is_completed, is_success, received_time, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (mail_id, user_id, domain, int(is_completed), int(is_success), received_time, error_message),
            )

    def mark_success_many(self, rows: Iterable[Tuple[str, str, str, str]]) -> None:
        """rows: (mail_id, user_id, domain, received_time)"""
        with self.transaction() as conn:
            for mail_id, user_id, domain, received_time in rows:
                self._upsert_row(
                    conn,
                    mail_id=mail_id,
                    user_id=user_id,
                    domain=domain,
                    received_time=received_time,
                    is_completed=True,
                    is_success=True,
                    error_message=None,
                )

    def mark_failure_many(self, rows: Iterable[Tuple[str, str, str, str, Optional[str]]]) -> None:
        """rows: (mail_id, user_id, domain, received_time, error_message)"""
        with self.transaction() as conn:
            for mail_id, user_id, domain, received_time, error_message in rows:
                self._upsert_row(
                    conn,
                    mail_id=mail_id,
                    user_id=user_id,
                    domain=domain,
                    received_time=received_time,
                    is_completed=True,
                    is_success=False,
                    error_message=error_message,
                )

    def mark_parsing_failure(self, mail_id: str, user_id: str, domain: str, received_time: str, error_message: str) -> None:
        self.mark_failure_many([(mail_id, user_id, domain, received_time, error_message)])

    def mark_pending_many(self, rows: Iterable[Tuple[str, str, str, str]]) -> None:
        """rows: (mail_id, user_id, domain, received_time) with is_completed=0."""
        with self.transaction() as conn:
            for mail_id, user_id, domain, received_time in rows:
                self._upsert_row(
                    conn,
                    mail_id=mail_id,
                    user_id=user_id,
                    domain=domain,
                    received_time=received_time,
                    is_completed=False,
                    is_success=False,
                    error_message=None,
                )

    # --- Simple stats helpers for external querying ---
    def domain_stats(self, domain: str) -> Dict[str, int]:
        conn = self._get_connection()
        cur = conn.execute(
            "SELECT is_completed, is_success, COUNT(*) FROM mail_status WHERE domain = ? GROUP BY is_completed, is_success",
            (domain,),
        )
        stats = {(row[0], row[1]): int(row[2]) for row in cur.fetchall()}
        completed_success = stats.get((1, 1), 0)
        completed_failure = stats.get((1, 0), 0)
        pending = stats.get((0, 0), 0) + stats.get((0, 1), 0)  # in practice (0,1) not used
        return {
            "completed_success": completed_success,
            "completed_failure": completed_failure,
            "pending": pending,
            "total": completed_success + completed_failure + pending,
        }

    def user_stats(self, user_id: str) -> Dict[str, int]:
        conn = self._get_connection()
        cur = conn.execute(
            "SELECT is_completed, is_success, COUNT(*) FROM mail_status WHERE user_id = ? GROUP BY is_completed, is_success",
            (user_id,),
        )
        stats = {(row[0], row[1]): int(row[2]) for row in cur.fetchall()}
        completed_success = stats.get((1, 1), 0)
        completed_failure = stats.get((1, 0), 0)
        pending = stats.get((0, 0), 0) + stats.get((0, 1), 0)
        return {
            "completed_success": completed_success,
            "completed_failure": completed_failure,
            "pending": pending,
            "total": completed_success + completed_failure + pending,
        }

    def last_completed_time(self) -> Optional[str]:
        conn = self._get_connection()
        cur = conn.execute(
            "SELECT MAX(received_time) FROM mail_status WHERE is_completed = 1"
        )
        row = cur.fetchone()
        return row[0] if row and row[0] is not None else None


class WeaviateMailDatabase:
    """Thread-local Weaviate client + collection/tenant helpers and batch import.

    Notes on schema and filter fields:
    - Default optional filter fields included: filter_mailbox, filter_folder.
    - To add/rename filter fields (e.g., change to filter_label or remove filter_folder):
      1) Update `filter_fields` in `ensure_collection()` accordingly.
      2) Ensure your parsing code populates `Mail.extra_filters["filter_<name>"]`.
      3) Recreate the collection if schema already exists (Weaviate does not allow removing props easily).
    - Vectorizer is selected from config: `openai` -> `text2vec-openai`, `ollama` -> `text2vec-ollama`.
      The vector is generated server-side; we do NOT provide vectors on insert.
    """

    def __init__(self, *, host: str, api_key: Optional[str], collection_name: str, provider: str, model: str, vector_dimensions: int) -> None:
        self.host = host
        self.api_key = api_key
        self.collection_name = collection_name
        self.provider = provider
        self.model = model
        self.vector_dimensions = vector_dimensions
        self._local = threading.local()
        self._tenants_lock = threading.Lock()
        self._tenants_added: set[str] = set()

    def _get_client(self):
        client = getattr(self._local, "client", None)
        if client is not None:
            return client
        try:
            import weaviate
        except Exception as e:
            raise RuntimeError("weaviate-client is required. Please install 'weaviate-client'.") from e

        auth = None
        if self.api_key:
            try:
                auth = weaviate.AuthApiKey(api_key=self.api_key)
            except Exception:
                # Older clients may use a different auth helper name
                auth = weaviate.auth.AuthApiKey(self.api_key)  # type: ignore[attr-defined]

        client = weaviate.Client(url=self.host, auth_client_secret=auth)
        self._local.client = client
        return client

    def close_current_thread(self) -> None:
        client = getattr(self._local, "client", None)
        if client is not None:
            # Older client does not expose close(); just drop reference
            self._local.client = None

    def ensure_collection(self) -> None:
        """Ensure the multi-tenant collection exists with requested vectorizer.

        How to modify filter fields:
        - Edit `filter_fields` list below (e.g., add "filter_label").
        - Make sure `Mail.to_weaviate_properties()` (models.py) provides corresponding values.
        - If the collection already exists and you need a breaking schema change, drop and recreate the class.
        """
        client = self._get_client()
        schema = client.schema.get()
        classes = {c["class"] for c in schema.get("classes", [])}
        if self.collection_name in classes:
            return

        # Select vectorizer module
        if self.provider.lower() == "openai":
            vectorizer = "text2vec-openai"
            module_cfg = {
                "text2vec-openai": {
                    "model": self.model,
                    # dimensions are often inferred by model; keep here if server supports it
                    "dimensions": self.vector_dimensions,
                }
            }
        elif self.provider.lower() == "ollama":
            vectorizer = "text2vec-ollama"
            module_cfg = {
                "text2vec-ollama": {
                    "model": self.model,
                    "dimensions": self.vector_dimensions,
                }
            }
        else:
            raise ValueError(f"Unsupported embedding provider: {self.provider}")

        # Required and optional properties
        props = [
            {"name": "filter_user_id", "dataType": ["text"]},
            {"name": "filter_year", "dataType": ["text"]},
            {"name": "filter_month", "dataType": ["text"]},
            {"name": "filter_day", "dataType": ["text"]},
            {"name": "mail_id", "dataType": ["text"]},
            {"name": "search_mail_content", "dataType": ["text"]},
            {"name": "search_mail_header", "dataType": ["text"]},
        ]
        # Optional filter_* fields (edit this list to adjust schema)
        filter_fields = [
            {"name": "filter_mailbox", "dataType": ["text"]},
            {"name": "filter_folder", "dataType": ["text"]},
        ]
        props.extend(filter_fields)

        cls = {
            "class": self.collection_name,
            "vectorizer": vectorizer,
            "moduleConfig": module_cfg,
            "multiTenancyConfig": {"enabled": True},
            "properties": props,
        }
        client.schema.create({"classes": [cls]})

    def ensure_tenant(self, tenant_name: str) -> None:
        if not tenant_name:
            return
        with self._tenants_lock:
            if tenant_name in self._tenants_added:
                return
        client = self._get_client()
        try:
            client.schema.add_tenants(self.collection_name, [{"name": tenant_name}])
        except Exception:
            # Likely already exists; ignore
            pass
        with self._tenants_lock:
            self._tenants_added.add(tenant_name)

    def import_batch(self, mails: List["Mail"]) -> Tuple[List[str], Dict[str, str]]:
        """Import a batch via Weaviate's dynamic batch API.

        Returns (success_ids, failed: mail_id -> error_message)
        """
        if not mails:
            return [], {}

        client = self._get_client()
        # Ensure all tenants used by mails exist
        tenants = {m.domain for m in mails}
        for t in tenants:
            self.ensure_tenant(t)

        success_ids: List[str] = []
        failed: Dict[str, str] = {}

        # Use batch dynamic context
        batch_failed_objects = []
        batch_failed_references = []
        with client.batch.dynamic() as batch:  # type: ignore[attr-defined]
            for m in mails:
                props = m.to_weaviate_properties()
                try:
                    # Some client versions expose add_object(collection=...), others add_data_object(class_name=...)
                    add_obj = getattr(batch, "add_object", None)
                    if callable(add_obj):
                        add_obj(collection=self.collection_name, properties=props, uuid=m.mail_id, tenant=m.domain)
                    else:
                        batch.add_data_object(  # type: ignore[attr-defined]
                            data_object=props,
                            class_name=self.collection_name,
                            uuid=m.mail_id,
                            tenant=m.domain,
                        )
                except Exception as e:
                    # Immediate error on add; capture failure
                    failed[m.mail_id] = str(e)
            # Collect failure details from batch context if available
            try:
                fo = getattr(batch, "failed_objects", None)
                if fo:
                    batch_failed_objects = list(fo)
                fr = getattr(batch, "failed_references", None)
                if fr:
                    batch_failed_references = list(fr)
            except Exception:
                pass

        # Process failed objects captured from batch
        for fo in batch_failed_objects:
            mid = fo.get("uuid") or fo.get("id") or ""
            msg = "batch failed"
            try:
                err = fo.get("result", {}).get("errors", {}).get("error", [])
                if err:
                    msg = err[0].get("message") or msg
            except Exception:
                pass
            if mid:
                failed[mid] = msg

        failed_ids = set(failed.keys())
        for m in mails:
            if m.mail_id not in failed_ids:
                success_ids.append(m.mail_id)

        return success_ids, failed
