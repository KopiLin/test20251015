"""郵件批次匯入主程式，負責掃描檔案、派發工作與維護狀態。

此模組負責整體工作流程：讀取設定、初始化環境、監控等待中的郵件，
並將檔案依網域分組後送交工作執行緒處理。所有註解皆為繁體中文，
方便團隊快速掌握流程。"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import re
import shutil
import signal
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .config import AppConfig, load_config
from .database import MailStatusDB, WeaviateMailDatabase
from .models import MailBatch, Mail
from .worker import worker_loop


def parse_args() -> argparse.Namespace:
    """解析指令列參數。"""

    parser = argparse.ArgumentParser(description="Mail Worker – Batch Ingestion")
    parser.add_argument("--config", required=True, help="Path to YAML config file")
    return parser.parse_args()


def main() -> None:
    """應用程式進入點，負責啟動所有資源並監控批次處理。"""

    args = parse_args()
    cfg = load_config(args.config)

    # 設定記錄器格式與層級
    logging.basicConfig(level=getattr(logging, cfg.logging.level.upper(), logging.INFO), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logger = logging.getLogger("mail_worker")
    logger.info("Starting Mail Worker with config %s", args.config)

    # 準備執行所需的資料夾，若不存在則建立
    wait_dir = Path(cfg.paths.wait_dir)
    run_dir = Path(cfg.paths.run_dir)
    buggy_dir = Path(cfg.paths.buggy_dir)
    for d in (wait_dir, run_dir, buggy_dir):
        d.mkdir(parents=True, exist_ok=True)

    # 初始化資料庫物件：SQLite 狀態庫與 Weaviate 連線
    status_db = MailStatusDB(cfg.paths.sqlite_path)
    ws = WeaviateMailDatabase(
        host=cfg.weaviate.host,
        api_key=cfg.weaviate.api_key,
        collection_name=cfg.weaviate.collection_name,
        provider=cfg.weaviate.embedding.provider,
        model=cfg.weaviate.embedding.model,
        vector_dimensions=cfg.weaviate.embedding.vector_dimensions,
    )

    # 在主執行緒預先確保集合存在，避免工作執行緒才發現錯誤
    try:
        ws.ensure_collection()
    except Exception:
        logger.exception("Failed to ensure Weaviate collection; exiting")
        return

    # 將 run/ 目錄殘留的檔案復原回 wait/，避免上次中斷造成遺失
    try:
        for p in run_dir.glob("*.json"):
            shutil.move(str(p), str(wait_dir / p.name))
    except Exception:
        logger.exception("Failed to recover leftover run/ files")

    # 建立工作佇列與關閉事件，佇列容量由設定決定
    task_queue: "queue.Queue[Optional[MailBatch]]" = queue.Queue(maxsize=cfg.queue.maxsize)
    shutdown_event = threading.Event()

    # 註冊訊號處理函式，支援優雅關閉
    def _signal_handler(signum, frame):
        logger.info("Signal %s received; initiating shutdown", signum)
        shutdown_event.set()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # 依設定啟動多個背景工作執行緒
    threads = []
    for i in range(cfg.worker.threads):
        t = threading.Thread(
            target=worker_loop,
            kwargs=dict(
                name=f"worker-{i+1}",
                task_queue=task_queue,
                run_dir=run_dir,
                buggy_dir=buggy_dir,
                ws=ws,
                status_db=status_db,
                shutdown_event=shutdown_event,
            ),
            daemon=True,
        )
        t.start()
        threads.append(t)

    try:
        _main_loop(
            cfg,
            wait_dir=wait_dir,
            run_dir=run_dir,
            status_db=status_db,
            task_queue=task_queue,
            shutdown_event=shutdown_event,
            logger=logger,
        )
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt; shutting down")
        shutdown_event.set()
    finally:
        # 傳送空任務做為毒藥丸，通知工作執行緒終止
        for _ in range(len(threads)):
            try:
                task_queue.put_nowait(None)
            except queue.Full:
                # 佇列已滿時改為阻塞等待，直到成功放入
                while True:
                    try:
                        task_queue.put(None, timeout=1.0)
                        break
                    except queue.Full:
                        if shutdown_event.is_set():
                            continue
        # 等待所有工作執行緒結束
        for t in threads:
            t.join(timeout=5.0)
        # 關閉主執行緒所持有的連線
        try:
            status_db.close_current_thread()
        except Exception:
            pass
        try:
            ws.close_current_thread()
        except Exception:
            pass


# --------------- Orchestrator ---------------

import threading


def _parse_domain_from_filename(name: str) -> Optional[str]:
    """嘗試從檔名中推測郵件所屬網域。"""

    # 嘗試匹配 `domain=<值>` 格式
    m = re.search(r"domain=([A-Za-z0-9.-]+)", name)
    if m:
        return m.group(1)
    # 退而求其次，尋找 email 形式的 `@domain`
    m = re.search(r"@([A-Za-z0-9.-]+)", name)
    if m:
        return m.group(1)
    return None


def _discover_candidates(wait_dir: Path, limit: int = 1000) -> Dict[str, List[Path]]:
    """掃描等待資料夾並依網域歸類郵件檔案。"""

    files = sorted([p for p in wait_dir.glob("*.json")])[:limit]
    by_domain: Dict[str, List[Path]] = {}
    for p in files:
        dom = _parse_domain_from_filename(p.name)
        if dom is None:
            # 若檔名無法推測，則讀取 JSON 內容補抓 domain 或 user_id
            try:
                with p.open("r", encoding="utf-8") as f:
                    import json as _json

                    rec = _json.load(f)
                dom = rec.get("domain")
                if not dom and isinstance(rec.get("user_id"), str) and "@" in rec["user_id"]:
                    dom = rec["user_id"].split("@", 1)[1]
            except Exception:
                dom = None
        if not dom:
            dom = "unknown"
        lst = by_domain.setdefault(dom, [])
        if len(lst) < 50:  # 每個網域最多一次挑選 50 封郵件
            lst.append(p)
    return by_domain


def _select_domains(by_domain: Dict[str, List[Path]], capacity: int) -> List[Tuple[str, List[Path]]]:
    """依佇列剩餘空間挑選要送出的網域批次。"""

    if capacity <= 0:
        return []
    selected: List[Tuple[str, List[Path]]] = []
    for size in range(50, 0, -1):
        if capacity <= 0:
            break
        for dom, paths in list(by_domain.items()):
            if len(paths) == size and capacity > 0:
                selected.append((dom, paths))
                capacity -= 1
                del by_domain[dom]
                if capacity <= 0:
                    break
    return selected


def _move_files(src_paths: List[Path], dst_dir: Path) -> List[Path]:
    """將檔案移動到指定資料夾，並回傳成功移動的路徑。"""

    moved: List[Path] = []
    for p in src_paths:
        try:
            dest = dst_dir / p.name
            shutil.move(str(p), str(dest))
            moved.append(dest)
        except Exception as e:
            logging.getLogger("mail_worker").error("Failed moving %s to %s: %s", p, dest, e)
    return moved


def _enqueue_batches(
    selected: List[Tuple[str, List[Path]]],
    *,
    run_dir: Path,
    task_queue: "queue.Queue[Optional[MailBatch]]",
    status_db: MailStatusDB,
    logger: logging.Logger,
) -> None:
    """將挑選出的郵件批次移動到 run/ 並送入佇列。"""

    for dom, paths in selected:
        moved = _move_files(paths, run_dir)
        if not moved:
            continue
        batch = MailBatch(domain=dom, file_paths=[str(p) for p in moved])
        # 預先寫入待處理狀態，提供進度查詢功能
        pending_rows = []
        for p in moved:
            try:
                import json as _json

                with p.open("r", encoding="utf-8") as f:
                    rec = _json.load(f)
                m = Mail.from_json_record(rec)
                pending_rows.append((m.mail_id, m.user_id, m.domain, m.received_time))
            except Exception:
                # 此處解析失敗時，後續工作執行緒仍會負責搬移與紀錄
                continue
        if pending_rows:
            try:
                status_db.mark_pending_many(pending_rows)
            except Exception:
                logger.exception("Failed to insert pending rows for domain %s", dom)
        try:
            task_queue.put_nowait(batch)
            logger.info("Enqueued batch domain=%s size=%d", dom, len(moved))
        except queue.Full:
            logger.info("Queue full while enqueuing; stopping enqueues for now")
            # 依既有設計，檔案會暫留在 run/，等待下一輪再嘗試
            break


def _main_loop(
    cfg: AppConfig,
    *,
    wait_dir: Path,
    run_dir: Path,
    status_db: MailStatusDB,
    task_queue: "queue.Queue[Optional[MailBatch]]",
    shutdown_event: threading.Event,
    logger: logging.Logger,
) -> None:
    """核心主迴圈，負責定期掃描郵件並送交工作佇列。"""

    poll = max(0.1, float(cfg.worker.poll_interval))
    while not shutdown_event.is_set():
        try:
            remaining = cfg.queue.maxsize - task_queue.qsize()
            if remaining > 0:
                by_domain = _discover_candidates(wait_dir, limit=1000)
                selected = _select_domains(by_domain, remaining)
                if selected:
                    _enqueue_batches(selected, run_dir=run_dir, task_queue=task_queue, status_db=status_db, logger=logger)
            time.sleep(poll)
        except Exception:
            logger.exception("Main loop iteration failed")
            time.sleep(poll)



if __name__ == "__main__":
    main()
