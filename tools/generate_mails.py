#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelqwerwer1ta
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate sample mail JSON files")
    p.add_argument("out", help="Output directory (e.g., wait/)")
    p.add_argument("--count", type=int, default=200, help="How many mails to generate")
    p.add_argument("--domains", type=int, default=4, help="How many domains to cycle")
    p.add_argument("--start", default=None, help="Start timestamp (ISO). Default: now-1d")
    p.add_argument("--mailbox", default="inbox", help="Mailbox value")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    start_dt = (
        datetime.fromisoformat(args.start) if args.start else datetime.utcnow() - timedelta(days=1)
    )
    for i in range(1, args.count + 1):
        dom = f"example{(i % args.domains) + 1}.com"
        user = f"user{i}@{dom}"
        ts = start_dt + timedelta(seconds=i * 30)
        mail_id = f"mail{i:05d}"
        rec = {
            "mail_id": mail_id,
            "user_id": user,
            "received_time": ts.replace(microsecond=0).isoformat(),
            "subject": f"Test Email {i}",
            "content": f"This is a generated email number {i} for {dom}",
            "domain": dom,
            "mailbox": args.mailbox,
        }
        name = f"{mail_id}__domain={dom}__.json"
        with (out / name).open("w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False)


if __name__ == "__main__":
    main()

