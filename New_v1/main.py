#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v5.2 - DRIVE & RESUME
==============================================
"""

import logging
import sys
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import traceback
import gc
from apscheduler.schedulers.background import BackgroundScheduler
import json
import pickle
from pydantic import BaseModel

# 🔥 DRIVE & GOOGLE IMPORTS
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from google.oauth2 import service_account
from google.oauth2.service_account import Credentials
from io import BytesIO as MediaBytesIO
from io import BytesIO
import gspread

# ============================================================
#                    LOGGING SETUP
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)
logger.info("🚀 Starting Guest Matcher API v5.2 - DRIVE & RESUME...")

# ============================================================
#                    IMPORTS & LOGIC
# ============================================================
try:
    import os
    import re
    import hashlib
    import random
    import time
    
    PORT = os.environ.get('PORT', '8080')
    
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, JSONResponse
    import uvicorn
    import requests
    
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
    )
    LOGIC_AVAILABLE = True
    
except ImportError as e:
    logger.error(f"❌ Import failed: {e}")
    LOGIC_AVAILABLE = False
    sys.exit(1)
except Exception as e:
    logger.error(f"💥 Critical error: {e}")
    logger.error(traceback.format_exc())
    sys.exit(1)

# ============================================================
#                    CONFIGURATION
# ============================================================

DAILY_LIMIT = 30
MAX_FILE_SIZE = 50 * 1024 * 1024
RATE_LIMIT_PER_MINUTE = 100
ALLOWED_FILE_TYPES = {'.xlsx', '.xls', '.csv', '.json'} 

MASTER_CODE = os.environ.get('MASTER_CODE', '9998')
ADMIN_CODES = {
    "0507676706": os.environ.get('ADMIN_CODE', '1111')
}

GREEN_API_ID = os.environ.get('GREEN_API_ID')
GREEN_API_TOKEN = os.environ.get('GREEN_API_TOKEN')
GOOGLE_SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')
GOOGLE_SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_CREDENTIALS_JSON')

# 🔥 DRIVE CONFIGS (כפי שסופק)
DRIVE_PARENT_FOLDER_ID = os.environ.get('DRIVE_PARENT_FOLDER_ID', '1z9_9cxKzR4KVEf6Mz8oLehSGTl0marlf') 
MAX_STORAGE_DAYS = int(os.environ.get('MAX_STORAGE_DAYS', 100))
AUTO_CLEANUP_ENABLED = os.environ.get('AUTO_CLEANUP_ENABLED', 'true').lower() == 'true'
DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive']


GREEN_API_URL = None
if GREEN_API_ID and GREEN_API_TOKEN:
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"

# 🔥 In-Memory Storage
pending_codes: Dict[str, Dict[str, Any]] = {}
rate_limit_tracker: Dict[str, list] = {}
user_sessions: Dict[str, Dict[str, Any]] = {} # שומר קבצים בזיכרון לאחר טעינה/העלאה
_google_client = None
_drive_client = None


# Pydantic Schemas for validation
class SendCodeRequest(BaseModel):
    phone: str
    
class VerifyCodeRequest(BaseModel):
    phone: str
    code: str

class SaveFullNameRequest(BaseModel):
    phone: str
    full_name: str
    
logger.info("✅ Configuration complete")

# ============================================================
#                    GOOGLE SERVICES FUNCTIONS
# ============================================================

def get_drive_service():
    """Builds and returns a Google Drive service client."""
    global _drive_client
    if _drive_client is not None:
        return _drive_client
    
    if not GOOGLE_CREDENTIALS_JSON:
        logger.error("Drive Service: Credentials not configured")
        return None
    
    try:
        creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
        credentials = Credentials.from_service_account_info(
            creds_info, scopes=DRIVE_SCOPES
        )
        _drive_client = build('drive', 'v3', credentials=credentials)
        logger.info("✅ Google Drive client created")
        return _drive_client
    except Exception as e:
        logger.error(f"❌ Failed to build Drive service: {e}")
        return None

# Helper to get Google client (for Sheets)
def get_google_client():
    global _google_client
    if _google_client is not None:
        return _google_client
    if not GOOGLE_CREDENTIALS_JSON:
        raise Exception("Google credentials not configured")
    try:
        creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
        SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        credentials = service_account.Credentials.from_service_account_info(
            creds_info, scopes=SCOPES
        )
        _google_client = gspread.authorize(credentials)
        return _google_client
    except Exception as e:
        logger.error(f"❌ Google Sheets failed: {e}")
        raise

# 🔥 MODIFIED: הוספת עמודות לשמירת נתיבי קבצים וסשן
async def get_worksheet():
    try:
        gc = get_google_client()
        sh = gc.open_by_key(GOOGLE_SHEET_ID)
        try:
            ws = sh.worksheet(GOOGLE_SHEET_NAME)
        except:
            ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="12")
            # 🔥 עמודות חדשות לשמירת מצב וקבצים
            headers = [
                'id', 'full_name', 'phone', 'join_date', 'last_activity', 
                'daily_matches_used', 'guests_file_id', 'contacts_file_id', 
                'is_premium', 'last_index', 'total_guests', 'session_data'
            ]
            ws.update('A1:L1', [headers])
        return ws
    except Exception as e:
        logger.error(f"❌ Worksheet error: {e}")
        return None

# 🔥 NEW: Finds user data including row index
async def find_user_data(phone: str) -> Optional[Dict[str, Any]]:
    """Finds user data and their row index."""
    try:
        ws = await get_worksheet()
        if not ws:
            return None
        
        all_values = ws.get_all_values()
        if len(all_values) < 2:
            return None

        headers = all_values[0]
        phone_index = headers.index('phone') if 'phone' in headers else -1

        for i, row in enumerate(all_values[1:], 2):
            if len(row) > phone_index and row[phone_index] == phone:
                # Map row to dict (simple implementation here for speed)
                data = dict(zip(headers, row))
                
                # Ensure safe parsing for numeric/boolean values
                data['id'] = int(data.get('id') or 0)
                data['is_premium'] = data.get('is_premium', 'FALSE').upper() == 'TRUE'
                data['daily_matches_used'] = int(data.get('daily_matches_used') or 0) 
                data['full_name'] = data.get('full_name', '').strip()
                data['remaining_matches'] = DAILY_LIMIT - data['daily_matches_used']
                data['row_index'] = i 
                return data
        
        return None
    except Exception as e:
        logger.error(f"❌ find_user_data failed: {e}")
        return None

# 🔥 NEW: Updates a user's sheet data (flexible update)
async def update_user_sheet(phone: str, **kwargs):
    """Updates specific columns for a user."""
    if not GOOGLE_SHEET_ID:
        return
        
    try:
        ws = await get_worksheet()
        if not ws:
            return

        headers = ws.row_values(1)
        user_data = await find_user_data(phone)
        
        if not user_data:
            logger.warning(f"Attempted to update non-existent user: {phone}")
            return
            
        row_index = user_data['row_index']
        updates = []
        
        for key, value in kwargs.items():
            if key in headers:
                col_index = headers.index(key)
                
                updates.append((f"{chr(65 + col_index)}{row_index}", value))
                
        if updates:
            ws.batch_update([
                {'range': r, 'values': [[v]]} for r, v in updates
            ])
            logger.info(f"✅ Updated {len(updates)} fields for {phone}: {kwargs.keys()}")
            
    except Exception as e:
        logger.error(f"❌ update_user_sheet failed: {e}")


# 🔥 DRIVE: שמירת קבצים פיזית ב-Drive
async def save_files_to_drive(phone: str, guests_bytes: bytes, contacts_bytes: bytes, guests_filename: str, contacts_mime: str) -> Dict[str, str]:
    """שומר קבצי מוזמנים ואנשי קשר ל-Drive ומחזיר את המזהים שלהם."""
    if not DRIVE_PARENT_FOLDER_ID:
        logger.warning("DRIVE_PARENT_FOLDER_ID is not set. Skipping Drive save.")
        return {"guests_file_id": "", "contacts_file_id": ""}
    
    drive_service = get_drive_service()
    if not drive_service:
        return {"guests_file_id": "", "contacts_file_id": ""}

    def _upload(data: bytes, filename: str, mime_type: str) -> Optional[str]:
        try:
            file_metadata = {
                'name': filename,
                'parents': [DRIVE_PARENT_FOLDER_ID]
            }
            media = MediaIoBaseUpload(MediaBytesIO(data), mimetype=mime_type, resumable=True)
            
            file = drive_service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id'
            ).execute()
            
            return file.get('id')
        except Exception as e:
            logger.error(f"❌ Failed to upload {filename} to Drive: {e}")
            return None

    # יצירת שמות קבצים ייחודיים
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    guest_id = _upload(guests_bytes, f"{phone}_guests_{timestamp}.xlsx", 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    contact_id = _upload(contacts_bytes, f"{phone}_contacts_{timestamp}.xlsx", contacts_mime)
    
    # 🔥 שמירת המזהים (IDs) ב-Sheets
    if guest_id or contact_id:
        await update_user_sheet(
            phone, 
            guests_file_id=guest_id if guest_id else '', 
            contacts_file_id=contact_id if contact_id else '',
            files_saved=datetime.now().strftime("%d/%m/%y %H:%M") # Updates the files_saved column
        )
    
    return {"guests_file_id": guest_id, "contacts_file_id": contact_id}

# 🔥 DRIVE: הורדת קבצים מ-Drive
def load_file_from_drive(file_id: str) -> Optional[BytesIO]:
    """Downloads a file from Google Drive and returns it as BytesIO."""
    drive_service = get_drive_service()
    if not drive_service:
        return None

    try:
        file = BytesIO()
        downloader = MediaIoBaseDownload(file, drive_service.files().get_media(fileId=file_id))
        
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        file.seek(0)
        logger.info(f"📂 File loaded from Drive: {file_id}")
        return file
    except Exception as e:
        logger.error(f"❌ Failed to load file from Drive: {e}")
        return None


# 🔥 DRIVE: ניקוי קבצים ישנים (משתמש ב-DRIVE_PARENT_FOLDER_ID)
async def cleanup_old_sessions():
    """מנקה קבצים ישנים מ-Drive שנוצרו לפני MAX_STORAGE_DAYS"""
    if not AUTO_CLEANUP_ENABLED or not DRIVE_PARENT_FOLDER_ID:
        logger.info("Drive Cleanup disabled or folder ID missing.")
        return
        
    drive_service = get_drive_service()
    if not drive_service:
        return
    
    cutoff_date = (datetime.now() - timedelta(days=MAX_STORAGE_DAYS)).strftime("%Y-%m-%dT%H:%M:%S")
    
    try:
        # חיפוש קבצים בתוך התיקייה המוגדרת
        query = (
            f"'{DRIVE_PARENT_FOLDER_ID}' in parents and "
            f"modifiedTime < '{cutoff_date}Z'"
        )
        
        results = drive_service.files().list(
            q=query, 
            fields="files(id, name)",
            pageSize=100
        ).execute()
        
        count = 0
        for file in results.get('files', []):
            drive_service.files().delete(fileId=file['id']).execute()
            logger.info(f"🗑️ Deleted old Drive file: {file['name']}")
            count += 1
            
        logger.info(f"✅ Drive cleanup finished: {count} files deleted.")
            
    except Exception as e:
        logger.error(f"❌ Drive Cleanup error: {e}")

# הפעלת תזמון
scheduler = BackgroundScheduler()
scheduler.add_job(cleanup_old_sessions, 'interval', days=1) 
scheduler.start()


async def check_and_reset_user(phone: str) -> Dict[str, Any]:
    """בודק אם עברו 24 שעות ומאפס, ומחזיר את כל נתוני המשתמש."""
    user_data = await find_user_data(phone)

    if not user_data:
        return {"remaining_matches": DAILY_LIMIT, "is_premium": False, "hours_until_reset": 0, "full_name": ""}
    
    last_activity_str = user_data.get('last_activity')
    daily_used = user_data['daily_matches_used']
    is_premium = user_data['is_premium']
    remaining = DAILY_LIMIT - daily_used
    
    now = datetime.now()
    hours_passed = 24
    
    if last_activity_str:
        try:
            if len(last_activity_str) < 18:
                last_activity = datetime.strptime(last_activity_str, "%d/%m/%y %H:%M")
            else:
                last_activity = datetime.fromisoformat(last_activity_str.replace(" ", "T"))
            
            hours_passed = (now - last_activity).total_seconds() / 3600
        except Exception:
            hours_passed = 24
            logger.warning(f"⚠️ Invalid last_activity date format for {phone}, assuming 24h passed.")

    if hours_passed >= 24 and daily_used > 0:
        await update_user_sheet(phone, daily_matches_used=0)
        daily_used = 0
        remaining = DAILY_LIMIT
        hours_passed = 24
        logger.info(f"♻️ Daily usage reset for {phone}")

    if is_premium or remaining >= DAILY_LIMIT:
        hours_until_reset = 0
    else:
        hours_until_reset = max(0.0, 24.0 - hours_passed)
        
    user_data['remaining_matches'] = remaining if not is_premium else 999999
    user_data['hours_until_reset'] = hours_until_reset
    
    return user_data

async def log_or_create_user(phone: str, full_name: Optional[str] = None) -> Dict[str, Any]:
    """Handles user creation/update (D & B)."""
    user_data = await find_user_data(phone)
    now = datetime.now().strftime("%d/%m/%y %H:%M")
    
    if user_data:
        updates = {'last_activity': now}
        
        is_name_set = user_data.get('full_name', '').strip() != ''
        if full_name and not is_name_set:
            updates['full_name'] = full_name
            user_data['full_name'] = full_name
            
        if updates:
            await update_user_sheet(phone, **updates)
            logger.info(f"✅ Updated user (log-in): {phone}")
        
    else:
        ws = await get_worksheet()
        if not ws: raise Exception("Cannot access worksheet")

        all_values = ws.get_all_values()
        next_row = len(all_values) + 1
        next_id = next_row - 1
        
        # 12 עמודות - כולל ID קבצים ו-session_data
        new_user_data = [
            next_id, full_name or "", phone, now, now, 0, "", "", 'FALSE', 0, 0, ""
        ]
        
        ws.update(f"A{next_row}:L{next_row}", [new_user_data])
        logger.info(f"✅ Added new user: {phone}")
        
        headers = ws.row_values(1)
        user_data = dict(zip(headers, new_user_data))
        user_data['row_index'] = next_row

    return user_data

async def batch_update_user(phone: str, matches_used: int):
    """Updates daily_matches_used and last_activity."""
    user_data = await check_and_reset_user(phone)
    if not user_data: return 0
    is_premium = user_data.get("is_premium")

    try:
        current_used = user_data['daily_matches_used']
        new_used = current_used + matches_used
        new_remaining = max(0, DAILY_LIMIT - new_used)
        now = datetime.now().strftime("%d/%m/%y %H:%M")
        
        updates = {'last_activity': now}
        if not is_premium:
            updates['daily_matches_used'] = new_used
            
        await update_user_sheet(phone, **updates)
        
        logger.info(f"✅ Batch updated {phone}: used {matches_used}, new total used {new_used}")
        return new_remaining if not is_premium else 999999
        
    except Exception as e:
        logger.error(f"❌ Batch update failed: {e}")
        return 0

def format_phone_for_whatsapp(phone: str) -> str:
    """Format phone for WhatsApp"""
    digits = re.sub(r'\D', '', phone)
    if digits.startswith('0'):
        digits = '972' + digits[1:]
    return digits

def create_file_hash(content: bytes) -> str:
    """Generate MD5 hash"""
    return hashlib.md5(content).hexdigest()

def check_rate_limit(identifier: str) -> bool:
    """Check rate limit"""
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
    """Validate file"""
    if not file.filename:
        return False, "No filename"
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_FILE_TYPES:
        return False, f"Invalid type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}"
    
    return True, "OK"

def validate_phone(phone: str) -> bool:
    """Validate Israeli phone"""
    phone_regex = r'^05\d{8}$'
    return bool(re.match(phone_regex, phone))

def validate_name(name: str) -> bool:
    """Validate name"""
    name_regex = r'^[\u0590-\u05FFa-zA-Z\s]{2,}$'
    return bool(re.match(name_regex, name.strip()))

def cleanup_memory():
    """Force GC"""
    gc.collect()
    logger.debug("🧹 Memory cleaned")

def format_time_until_reset(hours: float) -> str:
    """Format hours"""
    if hours <= 0:
        return "ההגבלה אופסה!"
    
    total_minutes = int(hours * 60)
    hours_int = total_minutes // 60
    minutes_int = total_minutes % 60
    
    if hours_int > 0:
        return f"{hours_int} שעות ו-{minutes_int} דקות"
    else:
        return f"{minutes_int} דקות"

# ============================================================
#                    FASTAPI APP
# ============================================================

app = FastAPI(
    title="Guest Matcher API",
    version="5.2.0",
    description="Drive and Resume Session System"
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
    """Root endpoint"""
    return {
        "name": "Guest Matcher API",
        "version": "5.2.0",
        "status": "operational",
        "features": {
            "matching": LOGIC_AVAILABLE,
            "database": bool(GOOGLE_SHEET_ID),
            "whatsapp": bool(GREEN_API_URL),
            "drive_storage": bool(DRIVE_PARENT_FOLDER_ID),
            "resume_session": True
        }
    }

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "logic": LOGIC_AVAILABLE,
        "database": bool(GOOGLE_SHEET_ID and GOOGLE_CREDENTIALS_JSON),
        "whatsapp": bool(GREEN_API_URL)
    }

@app.post("/send-code")
async def send_code_endpoint(data: SendCodeRequest, request: Request):
    """Send verification code & create user if non-existent (D)"""
    phone = data.phone
    
    if not validate_phone(phone):
        raise HTTPException(400, "Invalid phone")
    
    if not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests")
    
    try:
        await log_or_create_user(phone, full_name=None)
    except Exception as e:
        logger.error(f"❌ DB Error during send-code: {e}")
        raise HTTPException(500, "Internal server error during user setup")

    formatted_phone = format_phone_for_whatsapp(phone)
    code = str(random.randint(1000, 9999))
    
    pending_codes[phone] = {
        "code": code,
        "timestamp": time.time(),
    }
    
    if GREEN_API_URL:
        payload = {"chatId": f"{formatted_phone}@c.us", "message": f"🔐 קוד האימות שלך: {code}"}
        try:
            requests.post(GREEN_API_URL, json=payload, timeout=10)
            logger.info(f"📱 Code sent to {formatted_phone}")
        except Exception as e:
            logger.warning(f"⚠️ WhatsApp error, proceeding with fallback: {e}")
    else:
        logger.warning(f"⚠️ WhatsApp not configured, returning code {code}")
        
    return {"status": "success", "message": "Code sent"}


@app.post("/verify-code")
async def verify_code_endpoint(data: VerifyCodeRequest):
    """Verify code & check if name input is required"""
    phone = data.phone
    code = data.code
    
    if not phone or not code:
        raise HTTPException(400, "Phone and code required")
    
    is_admin_master = (phone in ADMIN_CODES and code == ADMIN_CODES[phone]) or (code == MASTER_CODE)

    if is_admin_master:
        user_data = await log_or_create_user(phone, full_name="Admin" if phone in ADMIN_CODES else "Master User")
        user_stats = await check_and_reset_user(phone)
        
        return {
            "status": "LOGIN_SUCCESS",
            "remaining_matches": 999999,
            "is_premium": True,
            "hours_until_reset": 0,
            "user_full_name": user_data.get("full_name", "")
        }
    
    if phone in pending_codes:
        stored_data = pending_codes[phone]
        stored_code = stored_data.get("code")
        timestamp = stored_data.get("timestamp", 0)
        
        if time.time() - timestamp > 300: # 5 minutes expiry
            pending_codes.pop(phone, None)
            return {"status": "EXPIRED"}
        
        if stored_code == code:
            pending_codes.pop(phone, None)
            
            user_data = await log_or_create_user(phone, full_name=None)
            user_stats = await check_and_reset_user(phone)
            
            if user_data.get('full_name', '').strip() == '':
                logger.info(f"➡️ User {phone} verified, requires name input.")
                return {"status": "NAME_REQUIRED"}
            
            logger.info(f"✅ User {phone} verified, logged in.")
            return {
                "status": "LOGIN_SUCCESS",
                "remaining_matches": user_stats["remaining_matches"],
                "is_premium": user_stats["is_premium"],
                "hours_until_reset": user_stats["hours_until_reset"],
                "user_full_name": user_data.get("full_name", "")
            }
    
    logger.warning(f"❌ Invalid code: {phone}")
    return {"status": "FAILED"}


@app.post("/save-full-name")
async def save_full_name_endpoint(data: SaveFullNameRequest):
    """Save full name for first-time users (B)"""
    phone = data.phone
    full_name = data.full_name
    
    if not validate_name(full_name):
        raise HTTPException(400, "Invalid name")

    try:
        user_data = await find_user_data(phone)
        
        if not user_data:
            raise HTTPException(404, "User not found. Please re-verify phone.")

        is_name_set = user_data.get('full_name', '').strip() != ''
        
        if not is_name_set:
            await update_user_sheet(phone, full_name=full_name)
            logger.info(f"✅ Full name saved for {phone}: {full_name}")
            
        user_stats = await check_and_reset_user(phone)
        
        return {
            "status": "LOGIN_SUCCESS",
            "remaining_matches": user_stats["remaining_matches"],
            "is_premium": user_stats["is_premium"],
            "hours_until_reset": user_stats["hours_until_reset"],
            "user_full_name": full_name
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Save full name error: {e}")
        raise HTTPException(500, "Failed to save name")


@app.post("/check-phone-column")
async def check_phone_column(guests_file: UploadFile = File(...)):
    """בדיקה אם קובץ המוזמנים מכיל עמודת טלפון מלאה"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    is_valid, error = validate_file(guests_file)
    if not is_valid:
        raise HTTPException(400, error)
        
    try:
        guests_bytes = await guests_file.read()
        
        if len(guests_bytes) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File too large")
            
        result = check_existing_phone_column(BytesIO(guests_bytes))
        
        return result
    except Exception as e:
        logger.error(f"❌ Check phone column error: {e}")
        raise HTTPException(500, str(e))


@app.post("/merge-files")
async def merge_files(
    guests_file: UploadFile = File(...),
    contacts_file: UploadFile = File(...),
    phone: Optional[str] = None,
    contacts_source: str = "file",
    skip_filled_phones: str = "false",
    background_tasks: BackgroundTasks = None
):
    """Process, Match, Save Files to Drive, and store session info"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    if phone and not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests")
    
    for file in [guests_file, contacts_file]:
        is_valid, error = validate_file(file)
        if not is_valid:
            raise HTTPException(400, error)
    
    try:
        guests_bytes = await guests_file.read()
        contacts_bytes = await contacts_file.read()
        
        file_hash = create_file_hash(guests_bytes)
        
        # Check limit
        if phone:
            user_data = await check_and_reset_user(phone)
            remaining = user_data["remaining_matches"]
            
            if remaining <= 0 and not user_data.get("is_premium"):
                hours_left = user_data.get("hours_until_reset", 24)
                raise HTTPException(403, {
                    "error": "daily_limit_exceeded",
                    "message": f"נגמרו ההתאמות",
                    "hours_until_reset": hours_left,
                    "formatted_time": format_time_until_reset(hours_left)
                })
        
        # 2. 🔥 שמירת קבצים ל-Drive ושמירת ID ב-Sheets
        if phone and DRIVE_PARENT_FOLDER_ID:
            guests_filename = guests_file.filename
            contacts_mime_type = contacts_file.content_type
            
            await save_files_to_drive(
                phone, 
                guests_bytes, 
                contacts_bytes, 
                guests_filename, 
                contacts_mime_type
            )
        
        # 3. שמור קובץ מקורי בזיכרון (עבור Export)
        if phone:
            user_sessions[phone] = {
                "original_guests_file": BytesIO(guests_bytes),
                "original_guests_filename": guests_file.filename,
                "skip_filled_phones": skip_filled_phones.lower() == 'true'
            }
        
        # 4. Process (הפעלת לוגיקת המיזוג)
        guests_df = load_excel_flexible(BytesIO(guests_bytes))
        contacts_df = load_excel_flexible(BytesIO(contacts_bytes))
        all_results = process_matching_results(guests_df, contacts_df, contacts_source)
        
        results_93_plus = [r for r in all_results if r.get("best_score", 0) >= 93]
        results_below_93 = [r for r in all_results if r.get("best_score", 0) < 93]
        
        sorted_results = results_93_plus + results_below_93
        
        warning_message = None
        limited_results = sorted_results
        
        if phone and not user_data.get("is_premium"):
            remaining = user_data["remaining_matches"]
            
            if len(results_93_plus) >= remaining:
                limited_results = results_93_plus[:remaining]
                warning_message = f"נטענו {remaining} המוזמנים הטובים ביותר"
            elif len(sorted_results) > remaining:
                limited_results = sorted_results[:remaining]
                warning_message = f"נטענו {remaining} מוזמנים"
        
        if background_tasks:
            background_tasks.add_task(cleanup_memory)
        else:
            cleanup_memory()
        
        auto_count = sum(1 for r in limited_results if r.get("auto_selected"))
        perfect_count = sum(1 for r in limited_results if r.get("best_score") == 100)
        
        response_data = {
            "results": limited_results,
            "total_guests": len(limited_results),
            "total_93_plus": len(results_93_plus),
            "auto_selected_count": auto_count,
            "perfect_matches_count": perfect_count,
            "file_hash": file_hash
        }
        
        if phone:
            response_data["remaining_matches"] = user_data["remaining_matches"]
        
        if warning_message:
            response_data["warning"] = warning_message
            response_data["total_in_file"] = len(sorted_results)
        
        return response_data
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Merge error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))

# 🔥 NEW: נקודת קצה לשמירת מצב הסשן (בחירות, אינדקס)
@app.post("/save-session-state")
async def save_session_state_endpoint(data: dict):
    """שומר את מצב הסשן (בחירות, אינדקס) ב-Google Sheets (עמודה L)."""
    phone = data.get("phone")
    if not phone:
        raise HTTPException(400, "Phone required")
    
    try:
        session_state = {
            "current_guest_index": data.get("current_guest_index", 0),
            "selected_contacts": data.get("selected_contacts", {}),
            "matches_used_in_session": data.get("matches_used_in_session", 0),
            "file_hash": data.get("file_hash", ""),
            "skip_filled_phones": data.get("skip_filled_phones", False),
            "total_guests": data.get("total_guests", 0),
            "timestamp": datetime.now().isoformat(),
        }
        
        pickled_state = pickle.dumps(session_state).decode('latin1')
        
        await update_user_sheet(
            phone,
            session_data=pickled_state,
            last_index=session_state["current_guest_index"],
            total_guests=session_state["total_guests"]
        )
        
        return {"status": "success", "message": "מצב הסשן נשמר בהצלחה"}
        
    except Exception as e:
        logger.error(f"❌ Save session state error: {e}")
        raise HTTPException(500, f"Failed to save session state: {str(e)}")

# 🔥 NEW: נקודת קצה לטעינת סשן
@app.post("/load-session")
async def load_session_endpoint(data: dict):
    """טוען את הסשן האחרון של המשתמש מה-Sheets וה-Drive."""
    phone = data.get("phone")
    if not phone:
        raise HTTPException(400, "Phone required")
    
    try:
        user_row = await find_user_data(phone)
        
        if not user_row:
            return {"status": "NO_SESSION"}

        # 1. בדיקת נתיבי קבצים שמורים
        guests_file_id = user_row.get('guests_file_id')
        contacts_file_id = user_row.get('contacts_file_id')
        session_data_raw = user_row.get('session_data')
        
        if not guests_file_id or not contacts_file_id or not session_data_raw:
            return {"status": "NO_SESSION", "message": "לא נמצאו קבצים או מצב שמור"}
            
        # 2. טעינת קבצי ה-DF
        guests_file_data = load_file_from_drive(guests_file_id)
        contacts_file_data = load_file_from_drive(contacts_file_id)

        if not guests_file_data or not contacts_file_data:
            return {"status": "NO_SESSION", "message": "לא נמצאו קבצים ב-Drive"}

        # 🔥 טעינת מצב הסשן (אינדקס, בחירות)
        session_state = pickle.loads(session_data_raw.encode('latin1'))

        # 3. בדיקת תוקף זמן (נניח 7 ימים)
        session_time = datetime.fromisoformat(session_state.get('timestamp', '1970-01-01T00:00:00'))
        if (datetime.now() - session_time).days > 7:
            await update_user_sheet(phone, session_data='', guests_file_id='', contacts_file_id='', last_index=0, total_guests=0)
            return {"status": "EXPIRED", "message": "הסשן פג תוקף (מעל 7 ימים)"}

        # 4. הפעלת לוגיקת המיזוג מחדש (כדי לקבל את results)
        guests_df = load_excel_flexible(guests_file_data)
        contacts_df = load_excel_flexible(contacts_file_data)
        all_results = process_matching_results(guests_df, contacts_df, contacts_source="file")
        
        # 5. 🔥 שמירת הקבצים ב-in-memory cache (עבור export)
        user_sessions[phone] = {
            "original_guests_file": guests_file_data,
            "original_guests_filename": "resumed_guests.xlsx",
            "skip_filled_phones": session_state.get("skip_filled_phones", False)
        }

        # 6. החזרת כל הנתונים הדרושים ל-Frontend
        return {
            "status": "SESSION_RESUMED",
            "results": all_results,
            "session_data": session_state
        }

    except Exception as e:
        logger.error(f"❌ Load session error: {e}")
        return {"status": "NO_SESSION", "error": str(e)}

# 🔥 עדכון חדש - Batch בסוף
@app.post("/complete-session")
async def complete_session(data: dict):
    """
    מסיים session ומעדכן Batch
    """
    phone = data.get("phone")
    matches_used = data.get("matches_used", 0)
    
    if not phone:
        raise HTTPException(400, "Phone required")
    
    try:
        new_remaining = await batch_update_user(phone, matches_used)
        
        if phone in user_sessions:
            del user_sessions[phone]
        
        # ננקה את נתוני הסשן ב-Sheets גם כן
        await update_user_sheet(phone, session_data='', guests_file_id='', contacts_file_id='', last_index=0, total_guests=0)
        
        return {
            "status": "success",
            "remaining_matches": new_remaining,
            "matches_used": matches_used
        }
        
    except Exception as e:
        logger.error(f"❌ Complete session error: {e}")
        raise HTTPException(500, "Failed to complete session")

@app.post("/export-results")
async def export_results(data: dict):
    """ייצוא חכם - שומר מבנה מקורי"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    phone = data.get("phone")
    results = data.get("results", [])
    selected_contacts = data.get("selected_contacts", {})
    skip_filled_from_client = data.get("skip_filled", False) 
    
    if not results:
        raise HTTPException(400, "No results")
    
    try:
        original_file = None
        skip_filled_flag = skip_filled_from_client
        
        if phone and phone in user_sessions:
            session = user_sessions[phone]
            original_file = session.get("original_guests_file")
            if original_file:
                skip_filled_flag = session.get("skip_filled_phones", skip_filled_from_client)
                original_file.seek(0)
        
        if original_file:
            excel_buffer = export_with_original_structure(original_file, selected_contacts, skip_filled=skip_filled_flag)
            filename = f"guests_with_contacts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        # אחרת - ייצוא רגיל
        export_data = []
        for result in results:
            guest_name = result["guest"]
            guest_details = result.get("guest_details", {})
            
            row_data = dict(guest_details)
            
            if NAME_COL not in row_data:
                row_data[NAME_COL] = guest_name
            
            selected = selected_contacts.get(guest_name)
            if selected and not selected.get("isNotFound"):
                row_data[PHONE_COL] = selected.get("phone", "")
            else:
                row_data[PHONE_COL] = ""
            
            export_data.append(row_data)
        
        export_df = pd.DataFrame(export_data)
        excel_buffer = to_buf(export_df)
        
        filename = f"guests_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return StreamingResponse(
            BytesIO(excel_buffer.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"❌ Export error: {e}")
        raise HTTPException(500, str(e))

@app.get("/download-contacts-template")
async def download_contacts_template():
    """Download contacts template"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    template_df = create_contacts_template()
    excel_buffer = to_buf(template_df)
    
    return StreamingResponse(
        BytesIO(excel_buffer.getvalue()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=contacts_template.xlsx"}
    )

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()
    
@app.get("/download-guests-template")
async def download_guests_template():
    """Download guests template"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    template_df = create_guests_template()
    excel_buffer = to_buf(template_df)
    
    return StreamingResponse(
        BytesIO(excel_buffer.getvalue()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=guests_template.xlsx"}
    )

@app.get("/user-stats/{phone}")
async def get_user_stats(phone: str):
    """Get user statistics"""
    try:
        user_data = await check_and_reset_user(phone)
        
        return {
            "phone": phone,
            "remaining_matches": user_data["remaining_matches"],
            "is_premium": user_data["is_premium"],
            "daily_limit": DAILY_LIMIT,
            "hours_until_reset": user_data["hours_until_reset"],
            "formatted_reset_time": format_time_until_reset(user_data["hours_until_reset"])
        }
    except Exception as e:
        logger.error(f"❌ Stats error: {e}")
        raise HTTPException(500, "Failed to get stats")

@app.get("/check-payment-status/{phone}")
async def check_payment_status(phone: str):
    """Check payment status"""
    try:
        user_data = await check_and_reset_user(phone)
        return {
            "is_premium": user_data.get("is_premium", False),
            "phone": phone,
            "remaining_matches": user_data["remaining_matches"]
        }
    except Exception as e:
        logger.error(f"❌ Check payment error: {e}")
        raise HTTPException(500, "Failed to check payment status")

@app.post("/webhook")
async def webhook(request: Request):
    """Webhook endpoint"""
    try:
        body = await request.json()
        logger.info(f"📨 Webhook received: {body}")
        return {"status": "received"}
    except Exception as e:
        logger.error(f"❌ Webhook error: {e}")
        return {"status": "error", "message": str(e)}

# ============================================================
#                    STARTUP
# ============================================================

logger.info("✅ All routes defined")

if __name__ == "__main__":
    port = int(PORT)
    logger.info(f"🚀 Starting server on port {port}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        timeout_keep_alive=30,
        access_log=False
    )