"""郵件資料結構與轉換工具函式。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Tuple


def _normalize_mail_fields(rec: Dict) -> Dict:
    """調整輸入紀錄欄位名稱，統一後續處理格式。"""

    # 允許產品輸入使用不同欄位名稱
    rec = dict(rec)
    if "mail_header" in rec and "subject" not in rec:
        rec["subject"] = rec["mail_header"]
    if "mail_content" in rec and "content" not in rec:
        rec["content"] = rec["mail_content"]
    return rec


def _split_ymd(received_time: str) -> Tuple[str, str, str]:
    """將接收時間拆解為年月日，供篩選欄位使用。"""

    # 預期為 ISO 風格字串，若有例外會拋出錯誤以利追蹤
    dt = datetime.fromisoformat(received_time)
    return f"{dt.year:04d}", f"{dt.month:02d}", f"{dt.day:02d}"


@dataclass
class Mail:
    """代表單封郵件資料的資料類別。"""

    mail_id: str
    user_id: str
    domain: str
    received_time: str
    subject: str
    content: str
    # 可選的產品篩選欄位，會映射到 filter_* 屬性
    extra_filters: Dict[str, str] = field(default_factory=dict)

    @staticmethod
    def from_json_record(rec: Dict) -> "Mail":
        """從原始 JSON 記錄建立 `Mail` 物件。"""

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
        """產出以年月日拆分的篩選欄位值。"""

        y, m, d = _split_ymd(self.received_time)
        return {"filter_year": y, "filter_month": m, "filter_day": d}

    def to_weaviate_properties(self) -> Dict:
        """轉換成 Weaviate 需要的屬性字典。"""

        # 向量由 Weaviate 向量化模組負責，這裡僅提供文字內容
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
    """封裝同一網域的郵件檔案路徑集合。"""

    domain: str
    file_paths: List[str]


@dataclass
class BatchImportResult:
    """描述批次匯入結果的資料類別。"""

    domain: str
    success_ids: List[str]
    failed: Dict[str, str]  # mail_id -> 錯誤訊息

