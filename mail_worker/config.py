from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class EmbeddingConfig:
    provider: str  # "openai" | "ollama"
    model: str
    vector_dimensions: int


@dataclass
class WeaviateConfig:
    host: str
    api_key: Optional[str]
    collection_name: str
    embedding: EmbeddingConfig


@dataclass
class PathsConfig:
    wait_dir: str
    run_dir: str
    buggy_dir: str
    sqlite_path: str


@dataclass
class QueueConfig:
    maxsize: int


@dataclass
class WorkerConfig:
    threads: int
    poll_interval: float


@dataclass
class LoggingConfig:
    level: str = "INFO"


@dataclass
class AppConfig:
    paths: PathsConfig
    weaviate: WeaviateConfig
    queue: QueueConfig
    worker: WorkerConfig
    logging: LoggingConfig


def load_config(path: str) -> AppConfig:
    import os
    import yaml

    if not os.path.exists(path):
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

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

