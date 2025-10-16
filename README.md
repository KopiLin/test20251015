Mail Worker – 郵件批次匯入管線（繁體中文）

簡介
- 多執行緒郵件匯入器：定期掃描 `wait/`，依網域分批（每批最多 50 封），移至 `run/`，由背景工作執行緒處理，將資料寫入 Weaviate（每個網域對應一個租戶 tenant），並同步更新 SQLite 狀態資料庫。檔案生命週期：匯入成功即刪除，失敗移至 `buggy/`。
- 啟動時於主執行緒建立（或確保）Weaviate 集合；每個工作執行緒採 thread-local 連線（Weaviate/SQLite），避免資源競爭。
- 透過 `threading.Event` 與佇列 poison pill 支援優雅關閉（CTRL+C / SIGTERM）。

快速開始
- 複製設定檔：`cp config.example.yaml config.yaml`，依實際路徑與 Weaviate 認證調整。
- 啟動工作：`python -m mail_worker.main --config config.yaml`
- 查詢進度：
  - 網域統計：`python -m mail_worker.query --config config.yaml domain-stats example.com`
  - 使用者統計：`python -m mail_worker.query --config config.yaml user-stats user@example.com`
  - 進度時間：`python -m mail_worker.query --config config.yaml progress`

系統需求與安裝
- Python 3.10 以上（建議）。
- 建立虛擬環境：
  - `python -m venv .venv && source .venv/bin/activate`
- 安裝相依套件（本地開發）：
  - `pip install -U weaviate-client pyyaml`
-（可選）測試框架：
  - `pip install -U pytest`

目錄與模組
- 原始碼位於 `mail_worker/`：
  - `main.py`：協調器（orchestrator）。掃描 `wait/`、依網域分批、入列、啟動工作執行緒。
  - `worker.py`：批次處理。解析 JSON、匯入 Weaviate、更新 SQLite、處理檔案生命週期（刪除/移至 `buggy/`）。
  - `database.py`：SQLite 狀態庫與 Weaviate 客戶端/結構輔助工具（含建立集合、多租戶、批次匯入）。
  - `models.py`：`Mail`、`MailBatch`、`BatchImportResult` 資料類別與 Weaviate 屬性轉換。
  - `config.py`：讀取 YAML 設定，轉為 `AppConfig`。
  - `query.py`：查詢 CLI（`domain-stats`、`user-stats`、`progress`）。
- 設定：`config.example.yaml` → 複製為 `config.yaml`。執行時路徑皆由設定檔提供：`wait/`、`run/`、`buggy/`、`mail_status.db`。

運作流程
- 啟動時：
  - 主執行緒先呼叫 `ensure_collection()` 確保 Weaviate 集合存在；並將上次中斷殘留於 `run/` 的檔案搬回 `wait/`。
  - 建立工作佇列（容量 `queue.maxsize`）、啟動 N 個工作執行緒（`worker.threads`）。
- 主迴圈（每 `worker.poll_interval` 秒）：
  - 掃描 `wait/` 最多 1000 個 `.json` 檔，先嘗試從檔名推測 `domain`（支援 `domain=...` 或 `@domain`），若無則讀取 JSON。
  - 每網域最多挑選 50 封，根據佇列剩餘容量由大到小（50→49→…）選出要入列之批次。
  - 移動檔案至 `run/`，預先在 SQLite 寫入待處理（pending）狀態，最後將 `MailBatch(domain, file_paths)` 放入佇列。
- 工作執行緒：
  - 逐檔解析 JSON 為 `Mail`；解析失敗者直接移至 `buggy/`。
  - 以 `client.batch.dynamic()` 匯入 Weaviate（每封郵件：集合=`collection_name`、租戶=`domain`、UUID=`mail_id`）。
  - 依結果更新 SQLite：成功（completed+success）、失敗（completed+failure+message）。
  - 刪除成功匯入的檔案；失敗檔案移至 `buggy/`。

設定檔說明（config.yaml）
```yaml
paths:
  wait_dir: ./wait        # 等待匯入的郵件資料夾
  run_dir: ./run          # 目前處理中的暫存資料夾
  buggy_dir: ./buggy      # 解析/匯入失敗檔案放置位置
  sqlite_path: ./mail_status.db  # SQLite 狀態資料庫

weaviate:
  host: http://localhost:8080   # Weaviate 伺服器（含 http/https）
  api_key: null                 # 若啟用驗證則填入字串；否則 null
  collection_name: MailDoc      # 集合名稱（多租戶啟用）
  embedding:
    provider: openai            # openai | ollama（對應 text2vec-openai/ollama）
    model: text-embedding-3-small
    vector_dimensions: 1536     # 預期向量維度（依伺服端需求）

queue:
  maxsize: 100                  # 佇列最多可容納的批次數

worker:
  threads: 4                    # 背景工作執行緒數量
  poll_interval: 2.0            # 主迴圈掃描間隔（秒）

logging:
  level: INFO                   # 記錄層級（INFO/DEBUG/...）
```

郵件 JSON 格式
- 必填欄位：
  - `mail_id`: 郵件唯一 ID（同時做為 Weaviate 物件 UUID）
  - `user_id`: 使用者郵件位址（例如 `user@example.com`）
  - `received_time`: ISO 字串（例如 `2024-10-10T12:34:56`）
- 選填欄位：
  - `domain`: 若未提供，系統會由 `user_id` 推得（`@` 後段）
  - `subject` 或 `mail_header`: 郵件標題
  - `content` 或 `mail_content`: 郵件內文
  - `mailbox`: 例如 `inbox`（會映射至 Weaviate `filter_mailbox`）
  - `folder`: 自訂資料夾（會映射至 Weaviate `filter_folder`）

範例：
```json
{
  "mail_id": "mail00001",
  "user_id": "user1@example.com",
  "received_time": "2024-10-10T12:34:56",
  "subject": "Test Email",
  "content": "Hello world",
  "domain": "example.com",
  "mailbox": "inbox",
  "folder": "promo"
}
```

Weaviate 結構與查詢
- 集合（class）預設為 `MailDoc`，啟用 multi-tenancy；每個 `domain` 會建立一個 tenant。
- 主要屬性：
  - `filter_user_id`, `filter_year`, `filter_month`, `filter_day`
  - `mail_id`, `search_mail_content`, `search_mail_header`
  - 以及可選的 `filter_*` 欄位（預設：`filter_mailbox`, `filter_folder`）。
- 若需新增/調整 `filter_*` 欄位：
  1) 於 `WeaviateMailDatabase.ensure_collection()` 調整 `filter_fields` 清單。
  2) 確保 `Mail.to_weaviate_properties()` 能輸出對應屬性（由 `Mail.extra_filters` 提供）。
  3) 既有集合若需破壞性變更，請先刪除後重建。

SQLite 狀態資料庫
- 資料表：`mail_status(mail_id, user_id, domain, is_completed, is_success, received_time, error_message)`
- 索引：`idx_domain_stats(domain, is_completed, is_success)`, `idx_user_stats(user_id, is_completed, is_success)`, `idx_time_progress(received_time, is_completed)`
- 邏輯：入列時先寫入 pending；處理完成後以 success/failure 覆寫同一筆（以 `mail_id` 當主鍵語意）。

命令與使用方式
- 啟動工作：
  - `python -m mail_worker.main --config config.yaml`
- 查詢 CLI：
  - 依網域統計：`python -m mail_worker.query --config config.yaml domain-stats example.com`
  - 依使用者統計：`python -m mail_worker.query --config config.yaml user-stats user@example.com`
  - 進度（最後完成時間）：`python -m mail_worker.query --config config.yaml progress`

資料檔案放置與命名建議
- 建議檔名包含 `domain=<domain>`，例如：`mail123__domain=example.com__.json`。
- 若未包含，系統會嘗試從檔名找 `@domain`，或讀取 JSON 的 `domain`/`user_id` 推算。
- 目錄用途：
  - `wait/`：待處理；主迴圈掃描來源。
  - `run/`：已入列待處理之暫存檔案；成功會刪除，失敗移至 `buggy/`。
  - `buggy/`：解析或匯入失敗檔案，供排查。

範例資料產生
- 產生測試郵件至 `wait/`：
  - `python tools/generate_mails.py wait/ --count 300 --domains 6`
- 若產生器出現匯入錯誤（例：`timedelta` 匯入問題），可自行建立少量 JSON 測試檔案，或修正腳本後再執行。

測試（目前未提交正式測試套件）
- 建議使用 `pytest`：
  - `pip install -U pytest`
  - `pytest -q`
- 測試重點建議：
  - 網域分批、入列容量控制。
  - 成功/失敗/待處理狀態寫入與更新。
  - 解析失敗、匯入失敗之檔案生命週期（刪除/移轉）。
  - 查詢 CLI 的輸出格式與正確性。

故障排除（Troubleshooting）
- Weaviate 連線錯誤：
  - 確認 `weaviate.host`、`api_key` 是否正確；伺服端是否啟動且開放連線。
  - 向量設定與伺服端模組匹配（`provider` 與對應模組已啟用）。
- 佇列塞滿或處理停滯：
  - 檢查 `queue.maxsize` 與 `worker.threads` 是否合理；觀察記錄檔訊息。
- 檔案一直留在 `run/`：
  - 表示已入列但尚未完成；如長期未動，檢查工作執行緒例外或 Weaviate 匯入失敗。
- 解析錯誤：
  - 確認 JSON 欄位符合「郵件 JSON 格式」；錯誤檔案會被移至 `buggy/`。

安全性與設定管理
- 請勿將密鑰提交到版本庫；`config.yaml` 僅存在本機。
- 調整 Weaviate 主機與 API 金鑰時，務必透過設定檔，不要硬編於程式碼中。

開發規範（摘述）
- Python，4 空白縮排，新增或修改程式碼需包含型別註記（type hints）。
- 命名：模組/函式 `snake_case`；類別 `PascalCase`；常數 `UPPER_SNAKE`。
- 使用 `logging.getLogger(__name__)` 記錄日誌，避免使用 `print`。
- 優先使用 dataclass 與小而專注的函式。

優雅關閉
- 接收 CTRL+C 或 SIGTERM 後，主程式會設置關閉旗標、向佇列放入 poison pill、等待工作執行緒結束，並關閉所有連線資源。

授權與相容性
- 本專案未內建授權條款與測試環境；如需在生產環境使用，請先完成安全性檢查與壓力測試。

English Summary
- Multi-threaded batch mail ingestion that scans `wait/`, batches by domain (up to 50), moves to `run/`, imports to Weaviate (multi-tenant by domain) and updates a SQLite status DB. Successful files are deleted; failures move to `buggy/`. CLI provides domain/user stats and progress.
