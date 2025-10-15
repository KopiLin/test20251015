from __future__ import annotations

"""讀取與解析應用程式設定的輔助模組。

此模組以資料類別封裝設定檔結構，並提供 `load_config` 方便載入
YAML 檔案。所有註解皆採繁體中文說明，協助團隊快速理解各欄位用途。
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class EmbeddingConfig:
    """向量嵌入相關設定。"""

    provider: str  # 嵌入服務提供者，例如 "openai" 或 "ollama"
    model: str  # 服務端應使用的模型名稱
    vector_dimensions: int  # 預期的向量維度，供 Weaviate 驗證


@dataclass
class WeaviateConfig:
    """Weaviate 連線與集合相關設定。"""

    host: str  # Weaviate 伺服器位址 (含通訊協定)
    api_key: Optional[str]  # 若伺服器啟用驗證則填入 API Key
    collection_name: str  # 儲存郵件的集合名稱
    embedding: EmbeddingConfig  # 內嵌的向量設定


@dataclass
class PathsConfig:
    """檔案與資料庫路徑設定。"""

    wait_dir: str  # 等待匯入的郵件資料夾
    run_dir: str  # 目前執行中批次的暫存資料夾
    buggy_dir: str  # 匯入失敗或解析失敗的檔案放置位置
    sqlite_path: str  # SQLite 狀態資料庫檔案路徑


@dataclass
class QueueConfig:
    """排程佇列的容量設定。"""

    maxsize: int  # 工作佇列一次可容納的最大批次數量


@dataclass
class WorkerConfig:
    """背景工作執行緒相關設定。"""

    threads: int  # 要啟動的工作執行緒數量
    poll_interval: float  # 主迴圈掃描等待資料夾的時間間隔（秒）


@dataclass
class LoggingConfig:
    """紀錄器設定。"""

    level: str = "INFO"  # 文字形式的 logging level，例如 INFO、DEBUG


@dataclass
class AppConfig:
    """彙整所有子設定的總體設定資料結構。"""

    paths: PathsConfig
    weaviate: WeaviateConfig
    queue: QueueConfig
    worker: WorkerConfig
    logging: LoggingConfig


def load_config(path: str) -> AppConfig:
    """從指定路徑載入 YAML 設定檔並轉換成 `AppConfig`。

    Args:
        path: 設定檔的絕對路徑或相對路徑。

    Raises:
        FileNotFoundError: 找不到指定的設定檔。

    Returns:
        解析後的 `AppConfig` 物件。
    """

    import os
    import yaml

    if not os.path.exists(path):
        raise FileNotFoundError(f"Config file not found: {path}")

    # 讀取 YAML 內容並轉為 Python 字典
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    # 建立各子設定資料類別，確保欄位型別一致
    embedding = EmbeddingConfig(
        provider=data["weaviate"]["embedding"]["provider"],
        model=data["weaviate"]["embedding"]["model"],
        vector_dimensions=int(data["weaviate"]["embedding"]["vector_dimensions"]),
    )

    weav_cfg = WeaviateConfig(
        host=data["weaviate"]["host"],
        api_key=data["weaviate"].get("api_key"),
        collection_name=data["weaviate"].get("collection_name", "MailDoc"),
        embedding=embedding,
    )

    paths = PathsConfig(
        wait_dir=data["paths"]["wait_dir"],
        run_dir=data["paths"]["run_dir"],
        buggy_dir=data["paths"]["buggy_dir"],
        sqlite_path=data["paths"]["sqlite_path"],
    )

    queue_cfg = QueueConfig(maxsize=int(data["queue"]["maxsize"]))
    worker_cfg = WorkerConfig(
        threads=int(data["worker"]["threads"]),
        poll_interval=float(data["worker"]["poll_interval"]),
    )
    logging_cfg = LoggingConfig(level=data.get("logging", {}).get("level", "INFO"))

    return AppConfig(
        paths=paths,
        weaviate=weav_cfg,
        queue=queue_cfg,
        worker=worker_cfg,
        logging=logging_cfg,
    )

