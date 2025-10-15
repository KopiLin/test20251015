from __future__ import annotations

import argparse
import json
from typing import Any

from .config import load_config
from .database import MailStatusDB


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Mail Worker – Query CLI")
    p.add_argument("--config", required=True, help="Path to YAML config file")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("domain-stats", help="Show domain-level success/failure/pending counts")
    d.add_argument("domain")

    u = sub.add_parser("user-stats", help="Show user-level success/failure/pending counts")
    u.add_argument("user_id")

    sub.add_parser("progress", help="Show last completed received_time")

    return p.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)
    db = MailStatusDB(cfg.paths.sqlite_path)

    if args.cmd == "domain-stats":
        print(json.dumps(db.domain_stats(args.domain), ensure_ascii=False))
    elif args.cmd == "user-stats":
        print(json.dumps(db.user_stats(args.user_id), ensure_ascii=False))
    elif args.cmd == "progress":
        print(json.dumps({"last_completed_time": db.last_completed_time()}, ensure_ascii=False))


if __name__ == "__main__":
    main()

