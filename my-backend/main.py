#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v6.0 - OPEN ACCESS
==============================================
🔥 שינויים מ-v5.2:
1. הסרת כל מערכת האימות (SMS, GreenAPI, קודים, סיסמאות)
2. הסרת מגבלת 30 התאמות ביום
3. הסרת Admin mode
4. כניסה פשוטה: שם + טלפון → Firestore → עבודה
5. Firestore כ-DB ראשי למשתמשים
"""

import logging
import sys
from datetime import datetime
from typing import Optional, Dict, Any, List
import traceback
import gc
import json
import os
from dotenv import load_dotenv
load_dotenv()
from io import BytesIO
import tempfile

from pydantic import BaseModel

# ============================================================
#                    LOGGING SETUP
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)
logger.info("🚀 Starting Guest Matcher API v6.0 - OPEN ACCESS...")

# ============================================================
#  🔧 Setup Google Credentials from JSON string if provided
# ============================================================
if os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON'):
    try:
        creds_json = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')
        # Create a temporary file for the credentials
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as temp_file:
            temp_file.write(creds_json)
            temp_file.flush()
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = temp_file.name
            logger.info(f"✅ Google credentials loaded from GOOGLE_APPLICATION_CREDENTIALS_JSON")
    except Exception as e:
        logger.warning(f"⚠️ Failed to setup Google credentials: {e}")

# ============================================================
#                    IMPORTS
# ============================================================
try:
    import re
    import hashlib
    import time

    PORT = os.environ.get('PORT', '8080')

    from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, JSONResponse
    import uvicorn

    import pandas as pd

    from logic import (
        load_excel_flexible,
        load_mobile_contacts,
        process_matching_results,
        validate_dataframes,
        to_buf,
        export_with_original_structure,
        check_existing_phone_column,
        create_contacts_template,
        create_guests_template,
        NAME_COL,
        PHONE_COL,
        AUTO_SELECT_TH,
        format_phone,
        normalize,
        reason_for,
    )
    LOGIC_AVAILABLE = True

except ImportError as e:
    logger.error(f"❌ Import failed: {e}")
    LOGIC_AVAILABLE = False
except Exception as e:
    logger.error(f"💥 Critical error: {e}")
    logger.error(traceback.format_exc())
    LOGIC_AVAILABLE = False

# ============================================================
#                    FIRESTORE SETUP (disabled for testing)
# ============================================================
FIRESTORE_AVAILABLE = False
db = None
# try:
#     from google.cloud import firestore
#     db = firestore.Client()
#     FIRESTORE_AVAILABLE = True
#     logger.info("✅ Firestore client created")
# except Exception as e:
#     logger.warning(f"⚠️ Firestore not available: {e}")
#     FIRESTORE_AVAILABLE = False
#     db = None

# ============================================================
#                    GCS SETUP (disabled for testing)
# ============================================================
GCS_AVAILABLE = False
def save_file_to_gcs(*args, **kwargs):
    return None
def get_storage_client():
    return None
# try:
#     from gcs_service import save_file_to_gcs, get_storage_client
#     gcs_test = get_storage_client()
#     GCS_AVAILABLE = gcs_test is not None
# except Exception as e:
#     logger.warning(f"⚠️ GCS not available: {e}")
#     GCS_AVAILABLE = False

# ============================================================
#                    CONFIGURATION
# ============================================================
MAX_FILE_SIZE = 50 * 1024 * 1024
RATE_LIMIT_PER_MINUTE = 100
ALLOWED_FILE_TYPES = {'.xlsx', '.xls', '.csv'}

# In-Memory
rate_limit_tracker: Dict[str, list] = {}
user_sessions: Dict[str, Dict[str, Any]] = {}

# ============================================================
#                    PYDANTIC MODELS
# ============================================================
class RegisterRequest(BaseModel):
    phone: str
    full_name: str

# ============================================================
#                    FIRESTORE FUNCTIONS
# ============================================================

def save_user_to_firestore(phone: str, full_name: str) -> Dict[str, Any]:
    """שומר/מעדכן משתמש ב-Firestore"""
    if not FIRESTORE_AVAILABLE:
        logger.warning("⚠️ Firestore not available, using in-memory")
        return {
            "phone": phone,
            "full_name": full_name,
            "created_at": datetime.now().isoformat(),
            "last_login": datetime.now().isoformat(),
            "login_count": 1
        }

    try:
        doc_ref = db.collection("users").document(phone)
        doc = doc_ref.get()

        now = datetime.now().isoformat()

        if doc.exists:
            # משתמש קיים - עדכן last_login
            user_data = doc.to_dict()
            doc_ref.update({
                "last_login": now,
                "login_count": firestore.Increment(1)
            })
            user_data["last_login"] = now
            user_data["login_count"] = user_data.get("login_count", 0) + 1
            logger.info(f"✅ User updated: {phone}")
            return user_data
        else:
            # משתמש חדש
            user_data = {
                "phone": phone,
                "full_name": full_name,
                "created_at": now,
                "last_login": now,
                "login_count": 1
            }
            doc_ref.set(user_data)
            logger.info(f"✅ New user created: {phone}")
            return user_data

    except Exception as e:
        logger.error(f"❌ Firestore error: {e}")
        return {
            "phone": phone,
            "full_name": full_name,
            "created_at": datetime.now().isoformat(),
            "last_login": datetime.now().isoformat(),
            "login_count": 1
        }


def get_user_from_firestore(phone: str) -> Optional[Dict[str, Any]]:
    """מחזיר משתמש מ-Firestore"""
    if not FIRESTORE_AVAILABLE:
        return None

    try:
        doc_ref = db.collection("users").document(phone)
        doc = doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        logger.error(f"❌ Firestore get error: {e}")
        return None


def log_user_activity(phone: str, activity_type: str, details: dict = None):
    """שומר לוג פעילות ב-Firestore"""
    if not FIRESTORE_AVAILABLE:
        return

    try:
        db.collection("activity_logs").add({
            "phone": phone,
            "activity_type": activity_type,
            "details": details or {},
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"❌ Activity log error: {e}")

# ============================================================
#                    HELPER FUNCTIONS
# ============================================================

def check_rate_limit(identifier: str) -> bool:
    now = time.time()
    if identifier not in rate_limit_tracker:
        rate_limit_tracker[identifier] = []
    rate_limit_tracker[identifier] = [
        req_time for req_time in rate_limit_tracker[identifier]
        if now - req_time < 60
    ]
    if len(rate_limit_tracker[identifier]) >= RATE_LIMIT_PER_MINUTE:
        return False
    rate_limit_tracker[identifier].append(now)
    return True

def validate_file(file: UploadFile) -> tuple[bool, str]:
    if not file.filename:
        return False, "No filename"
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_FILE_TYPES:
        return False, f"Invalid type"
    return True, "OK"

def validate_phone(phone: str) -> bool:
    phone_regex = r'^05\d{8}$'
    return bool(re.match(phone_regex, phone))

def validate_name(name: str) -> bool:
    name_regex = r'^[\u0590-\u05FFa-zA-Z\s]{2,}$'
    return bool(re.match(name_regex, name.strip()))

def cleanup_memory():
    gc.collect()

def create_file_hash(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()

# ============================================================
#                    FASTAPI APP
# ============================================================

app = FastAPI(
    title="Guest Matcher API",
    version="6.0.0",
    description="Open Access - No limits, no SMS verification"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
#                    API ROUTES
# ============================================================

@app.get("/")
async def root():
    return {
        "name": "Guest Matcher API",
        "version": "6.0.0",
        "status": "operational",
        "features": {
            "matching": LOGIC_AVAILABLE,
            "database": FIRESTORE_AVAILABLE,
            "file_storage": GCS_AVAILABLE,
            "open_access": True,
            "no_limits": True
        },
        "services": {
            "firestore": "✅ Available" if FIRESTORE_AVAILABLE else "⚠️ Not available",
            "gcs": "✅ Available" if GCS_AVAILABLE else "⚠️ Not available",
            "matching": "✅ Available" if LOGIC_AVAILABLE else "❌ Error"
        }
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "logic": LOGIC_AVAILABLE,
            "database": FIRESTORE_AVAILABLE,
            "file_storage": GCS_AVAILABLE,
        }
    }


# ============================================================
#  🔥 NEW: Simple Register/Login - replaces send-code + verify-code
# ============================================================

@app.post("/register")
async def register_endpoint(data: RegisterRequest):
    """
    🔥 כניסה פשוטה: שם + טלפון → שמירה ב-Firestore → כניסה מיידית
    ללא SMS, ללא סיסמה, ללא הגבלות
    """
    phone = data.phone
    full_name = data.full_name

    if not validate_phone(phone):
        raise HTTPException(400, "מספר טלפון לא תקין - נדרש פורמט 05XXXXXXXX")

    if not validate_name(full_name):
        raise HTTPException(400, "שם לא תקין - נדרש לפחות 2 תווים בעברית או אנגלית")

    if not check_rate_limit(phone):
        raise HTTPException(429, "יותר מדי בקשות, נסה שוב בעוד דקה")

    try:
        # שמירה/עדכון ב-Firestore
        user_data = save_user_to_firestore(phone, full_name)

        # לוג פעילות
        log_user_activity(phone, "login", {"full_name": full_name})

        logger.info(f"✅ User registered/logged in: {phone} ({full_name})")

        return {
            "status": "success",
            "user": {
                "phone": phone,
                "full_name": user_data.get("full_name", full_name),
                "login_count": user_data.get("login_count", 1),
                "created_at": user_data.get("created_at", ""),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Register error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"שגיאה בהרשמה: {str(e)}")


# ============================================================
#  MERGE FILES - simplified (no limits)
# ============================================================

@app.post("/merge-files")
async def merge_files(
    guests_file: UploadFile = File(...),
    contacts_file: UploadFile = File(...),
    phone: Optional[str] = None,
    contacts_source: str = "file",
    skip_filled_phones: str = "false",
    background_tasks: BackgroundTasks = None
):
    """Process and match - NO LIMITS"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")

    if phone and not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests")

    for file in [guests_file, contacts_file]:
        is_valid, error = validate_file(file)
        if not is_valid:
            raise HTTPException(400, error)

    try:
        logger.info("📂 Reading files...")
        guests_bytes = await guests_file.read()
        contacts_bytes = await contacts_file.read()

        if len(guests_bytes) > MAX_FILE_SIZE or len(contacts_bytes) > MAX_FILE_SIZE:
            raise HTTPException(400, "File too large")

        file_hash = create_file_hash(guests_bytes)

        # שמירת קובץ מקורי ב-session (לייצוא)
        if phone:
            user_sessions[phone] = {
                "original_guests_file": BytesIO(guests_bytes),
                "original_guests_filename": guests_file.filename,
                "skip_filled_phones": skip_filled_phones.lower() == 'true'
            }

        logger.info("👰 Processing guests...")
        guests_df = load_excel_flexible(BytesIO(guests_bytes))
        del guests_bytes

        logger.info(f"📞 Processing contacts...")
        if contacts_source == "mobile":
            contacts_data = json.loads(contacts_bytes.decode('utf-8'))
            contacts_df = load_mobile_contacts(contacts_data)
            del contacts_data
        else:
            contacts_df = load_excel_flexible(BytesIO(contacts_bytes))

        del contacts_bytes

        is_valid, error = validate_dataframes(guests_df, contacts_df)
        if not is_valid:
            raise HTTPException(400, error)

        logger.info("🔄 Processing matches...")
        all_results = process_matching_results(guests_df, contacts_df, contacts_source)

        del guests_df
        del contacts_df

        # 🔥 NO LIMITS - return ALL results
        sorted_results = sorted(all_results, key=lambda r: r.get("best_score", 0), reverse=True)

        if background_tasks:
            background_tasks.add_task(cleanup_memory)
        else:
            cleanup_memory()

        auto_count = sum(1 for r in sorted_results if r.get("auto_selected"))
        perfect_count = sum(1 for r in sorted_results if r.get("best_score") == 100)

        # לוג פעילות
        if phone:
            log_user_activity(phone, "merge", {
                "total_guests": len(sorted_results),
                "auto_selected": auto_count,
                "perfect_matches": perfect_count
            })

        logger.info(f"✅ Loaded {len(sorted_results)} guests (no limits)")

        return {
            "results": sorted_results,
            "total_guests": len(sorted_results),
            "auto_selected_count": auto_count,
            "perfect_matches_count": perfect_count,
            "file_hash": file_hash
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Merge error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))


# ============================================================
#  EXPORT RESULTS
# ============================================================

@app.post("/export-results")
async def export_results(request: Request):
    """Export matched results to Excel"""
    try:
        data = await request.json()
        phone = data.get("phone", "")
        selected_contacts = data.get("selected_contacts", {})
        skip_filled = data.get("skip_filled", False)

        if phone and phone in user_sessions:
            session = user_sessions[phone]
            original_file = session["original_guests_file"]
            original_file.seek(0)

            buf = export_with_original_structure(
                original_file,
                selected_contacts,
                skip_filled=skip_filled
            )

            # לוג
            log_user_activity(phone, "export", {
                "contacts_matched": len([c for c in selected_contacts.values() if not c.get("isNotFound")])
            })

            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=guests_matched.xlsx"}
            )
        else:
            raise HTTPException(400, "No session found - please re-upload files")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Export error: {e}")
        raise HTTPException(500, str(e))


# ============================================================
#  CHECK PHONE COLUMN
# ============================================================

@app.post("/check-phone-column")
async def check_phone_column(guests_file: UploadFile = File(...)):
    """Check if guests file has a phone column"""
    try:
        result = check_existing_phone_column(guests_file.file)
        return result
    except Exception as e:
        logger.error(f"❌ Check phone column error: {e}")
        raise HTTPException(500, str(e))


# ============================================================
#  SAVE FILES TO GCS
# ============================================================

@app.post("/save-files")
async def save_files(
    guests_file: UploadFile = File(...),
    contacts_file: UploadFile = File(...),
    phone: Optional[str] = None
):
    """Save uploaded files to GCS"""
    if not phone:
        return {"status": "skipped", "reason": "no phone"}

    try:
        guests_path = save_file_to_gcs(phone, guests_file, "guests")
        contacts_path = save_file_to_gcs(phone, contacts_file, "contacts")

        # If both are None, GCS is not available
        if guests_path is None and contacts_path is None:
            logger.info("⚠️ GCS not available - files not saved")
            return {"status": "skipped", "reason": "gcs_not_available"}

        # לוג
        log_user_activity(phone, "upload_files", {
            "guests_path": guests_path or "not_saved",
            "contacts_path": contacts_path or "not_saved"
        })

        return {
            "status": "success",
            "guests_path": guests_path,
            "contacts_path": contacts_path
        }
    except Exception as e:
        logger.error(f"❌ Save files error: {e}")
        return {"status": "error", "message": str(e)}


# ============================================================
#  TEMPLATES
# ============================================================

@app.get("/download-contacts-template")
async def download_contacts_template():
    template = create_contacts_template()
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        template.to_excel(w, index=False, sheet_name="אנשי קשר")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=contacts_template.xlsx"}
    )

@app.get("/download-guests-template")
async def download_guests_template():
    template = create_guests_template()
    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        template.to_excel(w, index=False, sheet_name="מוזמנים")
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=guests_template.xlsx"}
    )


# ============================================================
#  SESSION MANAGEMENT (simplified)
# ============================================================

@app.post("/save-session")
async def save_session(request: Request):
    """Save session data"""
    try:
        data = await request.json()
        phone = data.get("phone", "")

        if not phone:
            return {"status": "skipped"}

        if FIRESTORE_AVAILABLE:
            doc_ref = db.collection("sessions").document(phone)
            doc_ref.set({
                "session_data": data,
                "updated_at": datetime.now().isoformat()
            })

        return {"status": "success"}
    except Exception as e:
        logger.error(f"❌ Save session error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/load-session")
async def load_session(request: Request):
    """Load saved session"""
    try:
        data = await request.json()
        phone = data.get("phone", "")

        if not phone or not FIRESTORE_AVAILABLE:
            return {"status": "not_found"}

        doc_ref = db.collection("sessions").document(phone)
        doc = doc_ref.get()

        if doc.exists:
            session_data = doc.to_dict().get("session_data", {})
            return {"status": "success", "session_data": session_data}

        return {"status": "not_found"}
    except Exception as e:
        logger.error(f"❌ Load session error: {e}")
        return {"status": "error", "message": str(e)}


# ============================================================
#  CHECK MOBILE SUPPORT (kept for compatibility)
# ============================================================

@app.get("/check-mobile-support")
async def check_mobile_support():
    return {"supports_contacts_api": False}


# ============================================================
#                    STARTUP
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"🚀 Starting server on port {port}")
    logger.info(f"🔓 Open access - no limits, no SMS verification")
    logger.info(f"🗄️ Firestore: {'✅' if FIRESTORE_AVAILABLE else '❌'}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        timeout_keep_alive=30,
        access_log=False
    )
