import os
import json
import logging
from google.cloud import storage
from datetime import datetime
import orjson

# קבלת שם הבאקט מה־ENV
GCS_BUCKET = os.environ.get("GCS_BUCKET")

# יצירת לקוח של Cloud Storage
client = storage.Client()

def save_session_to_gcs(session_data: dict, phone: str) -> str:
    """
    שומר את נתוני הסשן כ־JSON ב־Google Cloud Storage
    """
    try:
        if not GCS_BUCKET:
            raise ValueError("GCS_BUCKET environment variable not set")

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
            raise ValueError("GCS_BUCKET environment variable not set")

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
    שומר קובץ (Excel/CSV) ב־GCS בתיקייה files_<phone>
    """
    try:
        if not GCS_BUCKET:
            raise ValueError("GCS_BUCKET environment variable not set")

        bucket = client.bucket(GCS_BUCKET)
        blob_name = f"files_{phone}/{file_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        blob = bucket.blob(blob_name)

        file_obj.file.seek(0)
        blob.upload_from_file(file_obj.file, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

        logging.info(f"✅ File saved to GCS: {blob_name}")
        return blob_name

    except Exception as e:
        logging.error(f"❌ Failed to upload file to GCS: {e}")
        return None
