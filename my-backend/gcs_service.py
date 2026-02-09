import os
import json
import logging
from datetime import datetime
import orjson

# קבלת שם הבאקט מה־ENV
GCS_BUCKET = os.environ.get("GCS_BUCKET")

# יצירת לקוח של Cloud Storage - lazy initialization
_client = None

def get_storage_client():
    """Get or create storage client - returns None if fails"""
    global _client
    if _client is None:
        try:
            from google.cloud import storage
            _client = storage.Client()
            logging.info("✅ Storage client created")
        except Exception as e:
            logging.warning(f"⚠️ Storage client not available: {e}")
            _client = False  # Mark as failed (not None, so we don't retry)
            return None

    # If client creation failed before, return None
    if _client is False:
        return None

    return _client

def save_session_to_gcs(session_data: dict, phone: str) -> str:
    """
    שומר את נתוני הסשן כ־JSON ב־Google Cloud Storage
    """
    try:
        if not GCS_BUCKET:
            logging.warning("⚠️ GCS_BUCKET not set - skipping save")
            return None

        client = get_storage_client()
        if client is None:
            logging.warning("⚠️ GCS client not available - skipping save")
            return None

        bucket = client.bucket(GCS_BUCKET)
        blob_name = f"sessions/{phone}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        blob = bucket.blob(blob_name)

        # ממיר את המידע למחרוזת JSON
        data_bytes = orjson.dumps(session_data)
        blob.upload_from_string(data_bytes, content_type="application/json")

        logging.info(f"✅ Session saved to GCS: {blob_name}")
        return blob_name

    except Exception as e:
        logging.error(f"❌ Failed to save session to GCS: {e}")
        return None


def load_session_from_gcs(blob_name: str) -> dict | None:
    """
    טוען קובץ JSON מה־Google Cloud Storage לפי השם המלא שלו
    """
    try:
        if not GCS_BUCKET:
            logging.warning("⚠️ GCS_BUCKET not set - skipping load")
            return None

        client = get_storage_client()
        if client is None:
            logging.warning("⚠️ GCS client not available - skipping load")
            return None

        bucket = client.bucket(GCS_BUCKET)
        blob = bucket.blob(blob_name)

        if not blob.exists():
            logging.warning(f"⚠️ Blob not found: {blob_name}")
            return None

        data_bytes = blob.download_as_bytes()
        session_data = orjson.loads(data_bytes)

        logging.info(f"📥 Session loaded from GCS: {blob_name}")
        return session_data

    except Exception as e:
        logging.error(f"❌ Failed to load session from GCS: {e}")
        return None


def save_file_to_gcs(phone: str, file_obj, file_type: str) -> str | None:
    """
    שומר קובץ (Excel/CSV) ב־GCS בתיקייה files_<phone>/YYYYMMDD_HHMMSS/
    """
    try:
        if not GCS_BUCKET:
            logging.warning("⚠️ GCS_BUCKET not set - skipping file save")
            return None

        client = get_storage_client()
        if client is None:
            logging.warning("⚠️ GCS client not available - skipping file save")
            return None

        bucket = client.bucket(GCS_BUCKET)
        
        # 🔥 יצירת תיקיית סשן ייחודית: כוללת תאריך (D) ושעה (H).
        now_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        # הנתיב הוא: files_0507676706/20251021_181446/contacts.xlsx
        blob_name = f"files_{phone}/{now_str}/{file_type}.xlsx"
        
        # --- לוגים לבדיקה ---
        logging.info(f"💾 DEBUG GCS: Bucket={GCS_BUCKET}")
        logging.info(f"💾 DEBUG GCS: Time Folder={now_str}")
        logging.info(f"💾 DEBUG GCS: Full Blob Path={blob_name}")
        # --------------------
        
        blob = bucket.blob(blob_name)

        # הקוד הזה עובד ב-GCS כיוון שהוא מפרש את ה-`/` כהפרדה לתיקייה
        file_obj.file.seek(0)
        blob.upload_from_file(file_obj.file, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

        logging.info(f"✅ File saved to GCS: {blob_name}")
        return blob_name

    except Exception as e:
        logging.error(f"❌ Failed to upload file to GCS: {e}")
        return None