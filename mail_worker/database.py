from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Dict, Iterable, List, Optional, Tuple


class MailStatusDB:
    """以執行緒區域連線管理的 SQLite 狀態資料庫。

    固定資料表結構：
      - mail_id TEXT, user_id TEXT, domain TEXT
      - is_completed INTEGER (0 或 1)
      - is_success INTEGER (0 或 1)
      - received_time TEXT (時間戳字串)
      - error_message TEXT (可為空，用於紀錄錯誤原因)

    已建立索引：
      - idx_domain_stats(domain, is_completed, is_success)
      - idx_user_stats(user_id, is_completed, is_success)
      - idx_time_progress(received_time, is_completed)
    """

    def __init__(self, sqlite_path: str) -> None:
        self.sqlite_path = sqlite_path
        self._local = threading.local()
        # 確保資料庫目錄存在
        os.makedirs(os.path.dirname(os.path.abspath(sqlite_path)) or ".", exist_ok=True)
        # 使用主執行緒的連線建立資料表結構
        conn = self._get_connection()
        try:
            self._ensure_schema(conn)
        finally:
            # 關閉初始化連線，之後由各執行緒自行管理
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
        """批次標記成功結果，參數格式為 (mail_id, user_id, domain, received_time)。"""
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
        """批次標記失敗結果，附帶錯誤訊息。"""
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
        """批次寫入待處理狀態，is_completed 預設為 0。"""
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

    # --- 提供查詢介面的統計輔助方法 ---
    def domain_stats(self, domain: str) -> Dict[str, int]:
        """回傳指定網域的成功／失敗／待處理統計。"""
        conn = self._get_connection()
        cur = conn.execute(
            "SELECT is_completed, is_success, COUNT(*) FROM mail_status WHERE domain = ? GROUP BY is_completed, is_success",
            (domain,),
        )
        stats = {(row[0], row[1]): int(row[2]) for row in cur.fetchall()}
        completed_success = stats.get((1, 1), 0)
        completed_failure = stats.get((1, 0), 0)
        pending = stats.get((0, 0), 0) + stats.get((0, 1), 0)  # 實務上 (0,1) 鮮少出現，仍保留以防資料異常
        return {
            "completed_success": completed_success,
            "completed_failure": completed_failure,
            "pending": pending,
            "total": completed_success + completed_failure + pending,
        }

    def user_stats(self, user_id: str) -> Dict[str, int]:
        """回傳指定使用者的成功／失敗／待處理統計。"""
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
        """取得最後一封完成處理郵件的 received_time。"""
        conn = self._get_connection()
        cur = conn.execute(
            "SELECT MAX(received_time) FROM mail_status WHERE is_completed = 1"
        )
        row = cur.fetchone()
        return row[0] if row and row[0] is not None else None


class WeaviateMailDatabase:
    """以執行緒區域客戶端操作 Weaviate 的封裝類別。

    關於結構與篩選欄位的注意事項：
    - 預設會建立額外的可選篩選欄位：filter_mailbox、filter_folder。
    - 若需新增或調整篩選欄位（例如改為 filter_label）：
      1) 在 `ensure_collection()` 中更新 `filter_fields` 清單。
      2) 確保解析郵件時於 `Mail.extra_filters["filter_<name>"]` 填入對應資料。
      3) 若集合已存在且需破壞性修改，請刪除後重新建立（Weaviate 不易移除欄位）。
    - 向量化模組依設定檔選擇：`openai` 對應 `text2vec-openai`，`ollama` 對應
      `text2vec-ollama`，向量由伺服端產生，匯入時不需自行提供。
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
                # 舊版套件使用不同的認證類別名稱，這裡維持相容處理
                auth = weaviate.auth.AuthApiKey(self.api_key)  # type: ignore[attr-defined]

        client = weaviate.Client(url=self.host, auth_client_secret=auth)
        self._local.client = client
        return client

    def close_current_thread(self) -> None:
        client = getattr(self._local, "client", None)
        if client is not None:
            # 舊版客戶端可能沒有 close()，移除參考即可釋放連線
            self._local.client = None

    def ensure_collection(self) -> None:
        """確保多租戶集合存在並使用指定的向量化模組。"""

        # 如需調整篩選欄位：
        # - 修改下方 `filter_fields` 清單（例如新增 "filter_label"）。
        # - 確保 `Mail.to_weaviate_properties()` 提供對應的屬性。
        # - 若集合已存在且需破壞性變更，請先刪除後重新建立。
        client = self._get_client()
        schema = client.schema.get()
        classes = {c["class"] for c in schema.get("classes", [])}
        if self.collection_name in classes:
            return

        # 依提供者選擇對應的向量化模組
        if self.provider.lower() == "openai":
            vectorizer = "text2vec-openai"
            module_cfg = {
                "text2vec-openai": {
                    "model": self.model,
                    # 多數情況由模型推論維度，仍保留設定以符合伺服端需求
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

        # 必填與選填的屬性定義
        props = [
            {"name": "filter_user_id", "dataType": ["text"]},
            {"name": "filter_year", "dataType": ["text"]},
            {"name": "filter_month", "dataType": ["text"]},
            {"name": "filter_day", "dataType": ["text"]},
            {"name": "mail_id", "dataType": ["text"]},
            {"name": "search_mail_content", "dataType": ["text"]},
            {"name": "search_mail_header", "dataType": ["text"]},
        ]
        # 可調整的 filter_* 欄位清單
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
            # 多半表示租戶已存在，可忽略錯誤
            pass
        with self._tenants_lock:
            self._tenants_added.add(tenant_name)

    def import_batch(self, mails: List["Mail"]) -> Tuple[List[str], Dict[str, str]]:
        """透過 Weaviate 動態批次 API 匯入郵件資料。

        回傳值包含成功的郵件 ID 清單與失敗映射 (mail_id -> 錯誤訊息)。
        """
        if not mails:
            return [], {}

        client = self._get_client()
        # 逐一確保郵件所屬租戶已建立
        tenants = {m.domain for m in mails}
        for t in tenants:
            self.ensure_tenant(t)

        success_ids: List[str] = []
        failed: Dict[str, str] = {}

        # 使用動態批次環境，保留 Weaviate 客戶端彈性
        batch_failed_objects = []
        batch_failed_references = []
        with client.batch.dynamic() as batch:  # type: ignore[attr-defined]
            for m in mails:
                props = m.to_weaviate_properties()
                try:
                    # 不同版本可能提供 add_object 或 add_data_object，這裡同時兼容
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
                    # 若加入批次即發生錯誤，立即記錄失敗原因
                    failed[m.mail_id] = str(e)
            # 若批次執行後提供失敗詳情，則收集以便後續處理
            try:
                fo = getattr(batch, "failed_objects", None)
                if fo:
                    batch_failed_objects = list(fo)
                fr = getattr(batch, "failed_references", None)
                if fr:
                    batch_failed_references = list(fr)
            except Exception:
                pass

        # 將批次回傳的失敗紀錄整理為 mail_id -> 訊息
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
