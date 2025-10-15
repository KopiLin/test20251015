from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple


def _normalize_mail_fields(rec: Dict) -> Dict:
    # Support alternate field names from product input
    rec = dict(rec)
    if "mail_header" in rec and "subject" not in rec:
        rec["subject"] = rec["mail_header"]
    if "mail_content" in rec and "content" not in rec:
        rec["content"] = rec["mail_content"]
    return rec


def _split_ymd(received_time: str) -> Tuple[str, str, str]:
    # Expect ISO-like timestamp; fallback safe parsing
    dt = datetime.fromisoformat(received_time)
    return f"{dt.year:04d}", f"{dt.month:02d}", f"{dt.day:02d}"


@dataclass
class Mail:
    mail_id: str
    user_id: str
    domain: str
    received_time: str
    subject: str
    content: str
    # Optional product filters (mapped to filter_* properties)
    extra_filters: Dict[str, str] = field(default_factory=dict)

    @staticmethod
    def from_json_record(rec: Dict) -> "Mail":
        r = _normalize_mail_fields(rec)
        mail_id = r["mail_id"]
        user_id = r["user_id"]
        domain = r.get("domain") or (user_id.split("@", 1)[1] if "@" in user_id else "unknown")
        received_time = r["received_time"]
        subject = r.get("subject", "")
        content = r.get("content", "")

        extra_filters: Dict[str, str] = {}
        for k in ("mailbox", "folder"):
            if k in r and isinstance(r[k], str):
                extra_filters[f"filter_{k}"] = r[k]

        return Mail(
            mail_id=mail_id,
            user_id=user_id,
            domain=domain,
            received_time=received_time,
            subject=subject,
            content=content,
            extra_filters=extra_filters,
        )

    def ymd_filters(self) -> Dict[str, str]:
        y, m, d = _split_ymd(self.received_time)
        return {"filter_year": y, "filter_month": m, "filter_day": d}

    def to_weaviate_properties(self) -> Dict:
        # Vector is created by Weaviate's vectorizer; not provided here.
        props = {
            "filter_user_id": self.user_id,
            **self.ymd_filters(),
            "mail_id": self.mail_id,
            "search_mail_content": self.content,
            "search_mail_header": self.subject,
        }
        props.update(self.extra_filters)
        return props


@dataclass
class MailBatch:
    domain: str
    file_paths: List[str]


@dataclass
class BatchImportResult:
    domain: str
    success_ids: List[str]
    failed: Dict[str, str]  # mail_id -> error_message

