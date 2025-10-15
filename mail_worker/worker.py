from __future__ import annotations

import json
import logging
import os
import queue
import shutil
import threading
from pathlib import Path
from typing import List, Optional

from .database import MailStatusDB, WeaviateMailDatabase
from .models import BatchImportResult, Mail, MailBatch


logger = logging.getLogger(__name__)


def _read_mail_file(path: Path) -> Optional[Mail]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        mail = Mail.from_json_record(data)
        return mail
    except Exception as e:
        logger.warning("Failed to parse JSON %s: %s", path, e)
        return None


def process_batch(
    batch: MailBatch,
    *,
    run_dir: Path,
    buggy_dir: Path,
    ws: WeaviateMailDatabase,
    status_db: MailStatusDB,
) -> BatchImportResult:
    files = [Path(p) for p in batch.file_paths]
    mails: List[Mail] = []
    mail_to_path: dict[str, Path] = {}
    parse_failed_paths: List[Path] = []

    # Parse JSON mails
    for p in files:
        m = _read_mail_file(p)
        if m is None:
            parse_failed_paths.append(p)
        else:
            mails.append(m)
            if m.mail_id not in mail_to_path:
                mail_to_path[m.mail_id] = p

    # Move parse-failed files to buggy
    for p in parse_failed_paths:
        try:
            dest = buggy_dir / p.name
            shutil.move(str(p), str(dest))
        except Exception as e:
            logger.error("Failed to move parse-failed file to buggy %s: %s", p, e)

    # If nothing left to import, return early
    if not mails:
        return BatchImportResult(domain=batch.domain, success_ids=[], failed={})

    # Import to Weaviate
    success_ids: List[str]
    failed_map: dict[str, str]
    try:
        success_ids, failed_map = ws.import_batch(mails)
    except Exception as e:
        # Catastrophic error for this batch; move all files to buggy
        logger.exception("Weaviate batch import failed for domain %s: %s", batch.domain, e)
        for p in [Path(p) for p in batch.file_paths]:
            try:
                shutil.move(str(p), str(buggy_dir / p.name))
            except Exception as me:
                logger.error("Failed moving file to buggy after batch error %s: %s", p, me)
        # Best-effort: mark all parsed mails as failed
        try:
            status_db.mark_failure_many(
                (
                    (m.mail_id, m.user_id, m.domain, m.received_time, f"batch_error: {e}")
                    for m in mails
                )
            )
        except Exception:
            logger.exception("Failed updating DB for batch error")
        return BatchImportResult(domain=batch.domain, success_ids=[], failed={m.mail_id: str(e) for m in mails})

    # Update status DB
    try:
        if success_ids:
            success_rows = []
            id2mail = {m.mail_id: m for m in mails}
            for mid in success_ids:
                m = id2mail.get(mid)
                if m:
                    success_rows.append((m.mail_id, m.user_id, m.domain, m.received_time))
            if success_rows:
                status_db.mark_success_many(success_rows)
        if failed_map:
            fail_rows = []
            id2mail = {m.mail_id: m for m in mails}
            for mid, msg in failed_map.items():
                m = id2mail.get(mid)
                if m:
                    fail_rows.append((m.mail_id, m.user_id, m.domain, m.received_time, msg))
            if fail_rows:
                status_db.mark_failure_many(fail_rows)
    except Exception:
        logger.exception("Failed to update status DB for domain %s", batch.domain)

    # Apply file lifecycle: success -> delete; failure -> move to buggy
    success_set = set(success_ids)
    for m in mails:
        file_path = mail_to_path.get(m.mail_id)
        if file_path is None:
            # Fallback best-effort
            file_path = run_dir / f"{m.mail_id}.json"

        try:
            if m.mail_id in success_set:
                # Delete successful file
                if file_path.exists():
                    file_path.unlink()
            else:
                # Move failed to buggy
                dest = buggy_dir / file_path.name
                if file_path.exists():
                    shutil.move(str(file_path), str(dest))
        except Exception as e:
            logger.error("Failed to finalize file %s: %s", file_path, e)

    return BatchImportResult(domain=batch.domain, success_ids=success_ids, failed=failed_map)


def worker_loop(
    *,
    name: str,
    task_queue: "queue.Queue[Optional[MailBatch]]",
    run_dir: Path,
    buggy_dir: Path,
    ws: WeaviateMailDatabase,
    status_db: MailStatusDB,
    shutdown_event: threading.Event,
) -> None:
    logger.info("Worker %s started", name)
    try:
        while not shutdown_event.is_set():
            try:
                task = task_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if task is None:
                task_queue.task_done()
                break

            try:
                process_batch(task, run_dir=run_dir, buggy_dir=buggy_dir, ws=ws, status_db=status_db)
            except Exception:
                logger.exception("Worker %s failed processing batch for domain %s", name, getattr(task, "domain", "unknown"))
                # Best effort: move all files to buggy if not already handled
                try:
                    for fp in task.file_paths:
                        p = Path(fp)
                        if p.exists():
                            shutil.move(str(p), str(buggy_dir / p.name))
                except Exception:
                    logger.exception("Worker %s failed moving files to buggy after exception", name)
            finally:
                task_queue.task_done()
    finally:
        try:
            ws.close_current_thread()
        except Exception:
            pass
        try:
            status_db.close_current_thread()
        except Exception:
            pass
        logger.info("Worker %s exiting", name)
