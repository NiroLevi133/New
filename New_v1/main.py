#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v5.1 - AUTH REFACTOR
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
from dotenv import load_dotenv
load_dotenv()
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload
import pickle
from pydantic import BaseModel
from gcs_service import save_session_to_gcs, load_session_from_gcs, save_file_to_gcs

# ============================================================
#                    LOGGING SETUP
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)
logger.info("🚀 Starting Guest Matcher API v5.1 - AUTH REFACTOR...")

# ============================================================
#                    IMPORTS
# ============================================================
try:
    import os
    import re
    import hashlib
    import random
    import time
    from io import BytesIO
    
    PORT = os.environ.get('PORT', '8080')
    
    # Import BaseModels for Pydantic validation
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, JSONResponse
    import uvicorn
    import requests
    
    import pandas as pd
    
    from google.oauth2 import service_account
    import gspread
    
    from logic import (
        load_excel_flexible,
        load_mobile_contacts,
        process_matching_results,
        validate_dataframes,
        to_buf,
        export_with_original_structure,
        check_existing_phone_column,
        create_contacts_template,
        # 🔥 הפונקציות ב-logic.py צריכות עכשיו לקבל creds (או gc)
        save_session_to_drive,
        load_session_from_drive,
        save_files_to_drive,
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
ALLOWED_FILE_TYPES = {'.xlsx', '.xls', '.csv'}

MASTER_CODE = os.environ.get('MASTER_CODE', '9998')
ADMIN_CODES = {
    "0507676706": os.environ.get('ADMIN_CODE', '1111')
}

GREEN_API_ID = os.environ.get('GREEN_API_ID')
GREEN_API_TOKEN = os.environ.get('GREEN_API_TOKEN')
GOOGLE_SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')
GOOGLE_SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')
DRIVE_PARENT_FOLDER_ID = os.environ.get('DRIVE_PARENT_FOLDER_ID')

GREEN_API_URL = None
if GREEN_API_ID and GREEN_API_TOKEN:
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"

# 🔥 In-Memory Storage
pending_codes: Dict[str, Dict[str, Any]] = {}
rate_limit_tracker: Dict[str, list] = {}
user_sessions: Dict[str, Dict[str, Any]] = {}
_google_client = None
_google_credentials = None

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
#                    GOOGLE SHEETS FUNCTIONS (MODIFIED)
# ============================================================

def get_google_client():
    """
    Get cached Google Sheets client.
    Returns (gspread_client, credentials) or (None, None) on failure.
    """
    global _google_client
    global _google_credentials
    if _google_client is not None and _google_credentials is not None:
        return _google_client, _google_credentials
        
    if not GOOGLE_CREDENTIALS_JSON:
        logger.error("❌ Google credentials not configured. Sheets/Drive functionality disabled.")
        return None, None # 🔥 התיקון הקריטי: מחזיר None במקום להעלות חריגה
        
    try:
        creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
        SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
        credentials = service_account.Credentials.from_service_account_info(
            creds_info, scopes=SCOPES
        )
        _google_client = gspread.authorize(credentials)
        _google_credentials = credentials
        logger.info("✅ Google Sheets client and credentials created")
        return _google_client, _google_credentials
    
    except Exception as e:
        logger.error(f"❌ Google Sheets client failed: {e}")
        return None, None # 🔥 מחזיר None גם בכשל חיבור

# פונקציה לניקוי קבצים ישנים
async def cleanup_old_sessions():
    """מנקה סשנים וקבצים ישנים מ-30 יום"""
    try:
        gc_creds_tuple = get_google_client() 
        if gc_creds_tuple is None:
             logger.warning("⚠️ Cleanup skipped: Drive client not available.")
             return
        
        # 🔥 תיקון: משתמשים באובייקט creds
        gc, creds = gc_creds_tuple 
        drive_service = build('drive', 'v3', credentials=creds) 
        
        cutoff_date = (datetime.now() - timedelta(days=30)).isoformat()
        
        # חיפוש וניקוי קבצים ישנים
        query = f"modifiedTime < '{cutoff_date}' and name contains 'guest_matcher_sessions'"
        # משתמשים ב-drive_service שנוצר
        results = drive_service.files().list(q=query, fields="files(id, name)").execute()
        
        for file in results.get('files', []):
            drive_service.files().delete(fileId=file['id']).execute()
            logger.info(f"Deleted old session: {file['name']}")
            
    except Exception as e:
        logger.error(f"Cleanup error: {e}")

# הפעלת תזמון
scheduler = BackgroundScheduler()
scheduler.add_job(cleanup_old_sessions, 'interval', days=1)
scheduler.start()

# Helper to get worksheet (FIXED)
async def get_worksheet():
    try:
        # 🔥 קריאה ל-get_google_client ופירוק תוצאת ה-Tuple 
        gc_creds_tuple = get_google_client()
        
        if gc_creds_tuple is None or not GOOGLE_SHEET_ID:
            logger.warning("⚠️ Skipping Sheets operation due to missing client or Sheet ID.")
            return None 

        # 🔥 פירוק ה-Tuple: gc הוא gspread client, creds הוא Credentials
        gc, creds = gc_creds_tuple 
        
        sh = gc.open_by_key(GOOGLE_SHEET_ID)

        try:
            ws = sh.worksheet(GOOGLE_SHEET_NAME)
        except:
            ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="12")
            # הוסף עמודות נוספות לשמירת מצב
            headers = [
                'id', 'full_name', 'phone', 'join_date', 'last_activity', 
                'daily_matches_used', 'current_file_hash', 'current_progress', 
                'is_premium', 'last_session_id', 'files_saved', 'session_data'
            ]
            ws.update('A1:L1', [headers])
            logger.info(f"✅ Created worksheet: {GOOGLE_SHEET_NAME}")

        return ws
    except Exception as e:
        logger.error(f"❌ Worksheet error: {e}")
        return None

# Helper to map row to dict (NO CHANGE)
def _map_row_to_user_data(row: List[str], headers: List[str]) -> Dict[str, Any]:
    """Maps a Google Sheet row to a user data dictionary."""
    data = dict(zip(headers, row))
    
    # Ensure safe parsing for numeric/boolean values
    data['id'] = int(data.get('id') or 0)
    data['is_premium'] = data.get('is_premium', 'FALSE').upper() == 'TRUE'
    # daily_matches_used is in column F (index 5)
    data['daily_matches_used'] = int(data.get('daily_matches_used') or 0) 
    data['full_name'] = data.get('full_name', '').strip()
    data['remaining_matches'] = DAILY_LIMIT - data['daily_matches_used']
    
    return data

# 🔥 NEW: Finds user and prepares data (Centralized Logic) (NO CHANGE)
async def find_user_data(phone: str) -> Optional[Dict[str, Any]]:
    """Finds user data and their row index, handles date format flexibility."""
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
                user_data = _map_row_to_user_data(row, headers)
                user_data['row_index'] = i  # Actual row index in sheet (1-based)
                return user_data
        
        return None
    except Exception as e:
        logger.error(f"❌ find_user_data failed: {e}")
        return None

# 🔥 NEW: Updates a user's sheet data (flexible update) (NO CHANGE)
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
            # Using batch update for efficiency
            ws.batch_update([
                {'range': r, 'values': [[v]]} for r, v in updates
            ])
            logger.info(f"✅ Updated {len(updates)} fields for {phone}: {kwargs.keys()}")
            
    except Exception as e:
        logger.error(f"❌ update_user_sheet failed: {e}")


# 🔥 MODIFIED: Handles user creation and reset logic (NO CHANGE)
async def check_and_reset_user(phone: str) -> Dict[str, Any]:
    """בודק אם עברו 24 שעות ומאפס, ומחזיר את כל נתוני המשתמש."""
    user_data = await find_user_data(phone)

    if not user_data:
        # אם משתמש לא קיים עדיין, יוצר אובייקט ברירת מחדל
        return {
            "remaining_matches": DAILY_LIMIT, 
            "is_premium": False, 
            "hours_until_reset": 0,
            "full_name": ""
        }
    
    # 1. חילוץ נתונים
    last_activity_str = user_data.get('last_activity')
    daily_used = user_data['daily_matches_used']
    is_premium = user_data['is_premium']
    remaining = DAILY_LIMIT - daily_used
    
    now = datetime.now()
    hours_passed = 24
    
    # 2. בדיקת זמן איפוס
    if last_activity_str:
        try:
            # 🔥 גמישות בפורמט: מנסה קודם את הפורמט הסטנדרטי שלנו, ואז פורמט ISO.
            if len(last_activity_str) < 18:
                last_activity = datetime.strptime(last_activity_str, "%d/%m/%y %H:%M")
            else:
                last_activity = datetime.fromisoformat(last_activity_str.replace(" ", "T"))
            
            hours_passed = (now - last_activity).total_seconds() / 3600
        except Exception:
            hours_passed = 24
            logger.warning(f"⚠️ Invalid last_activity date format for {phone}, assuming 24h passed.")

    # 3. איפוס המונה (Daily Used)
    if hours_passed >= 24 and daily_used > 0:
        await update_user_sheet(phone, daily_matches_used=0)
        daily_used = 0
        remaining = DAILY_LIMIT
        hours_passed = 24
        logger.info(f"♻️ Daily usage reset for {phone}")

    # 4. חישוב שעות עד איפוס
    if is_premium or remaining >= DAILY_LIMIT:
        hours_until_reset = 0
    else:
        hours_until_reset = max(0.0, 24.0 - hours_passed)
        
    user_data['remaining_matches'] = remaining if not is_premium else 999999
    user_data['hours_until_reset'] = hours_until_reset
    
    return user_data

# 🔥 MODIFIED: Handles user creation/update (D & B) (NO CHANGE)
async def log_or_create_user(phone: str, full_name: Optional[str] = None) -> Dict[str, Any]:
    """
    בודק האם המשתמש קיים.
    אם לא: יוצר שורה חדשה עם 'join_date' (דרישה D).
    אם כן: מעדכן 'last_activity' ואת 'full_name' רק אם הוא ריק (דרישה B).
    מחזיר את נתוני המשתמש המעודכנים.
    """
    user_data = await find_user_data(phone)
    now = datetime.now().strftime("%d/%m/%y %H:%M")
    
    if user_data:
        # המשתמש קיים - עדכון last_activity ו-full_name אם ריק (דרישה B & E)
        updates = {'last_activity': now}
        
        is_name_set = user_data.get('full_name', '').strip() != ''
        if full_name and not is_name_set:
            updates['full_name'] = full_name
            user_data['full_name'] = full_name # עדכון ה-dict המוחזר
            
        if updates:
            await update_user_sheet(phone, **updates)
            logger.info(f"✅ Updated user (log-in): {phone}")
        
    else:
        # משתמש חדש - יצירת שורה (דרישה D & E)
        ws = await get_worksheet()
        if not ws:
            raise Exception("Cannot access worksheet")

        all_values = ws.get_all_values()
        next_row = len(all_values) + 1
        next_id = next_row - 1
        
        # 🚨 ה-daily_matches_used בברירת מחדל הוא 0, משמע remaining_matches=30
        new_user_data = [
            next_id,
            full_name or "", # full_name יכול להיות ריק בכניסה ראשונה
            phone,
            now, # join_date (דרישה D)
            now, # last_activity (דרישה E)
            0,
            "", "", # current_file_hash, current_progress (לא בשימוש ב-Frontend)
            'FALSE'
        ]
        
        # יש לוודא שהכותרות תואמות
        ws.update(f"A{next_row}:I{next_row}", [new_user_data])
        logger.info(f"✅ Added new user: {phone}")
        
        # יצירת מילון עם נתוני משתמש מלאים
        headers = ws.row_values(1)
        user_data = _map_row_to_user_data(new_user_data, headers)
        user_data['row_index'] = next_row

    return user_data


# 🔥 MODIFIED: Batch update user (F) (NO CHANGE)
async def batch_update_user(phone: str, matches_used: int):
    """
    מעדכן Batch - מעדכן את 'daily_matches_used' ואת 'last_activity'.
    """
    user_data = await check_and_reset_user(phone)
    
    if not user_data:
        return 0
        
    is_premium = user_data.get("is_premium")

    try:
        current_used = user_data['daily_matches_used']
        new_used = current_used + matches_used
        new_remaining = max(0, DAILY_LIMIT - new_used)
        now = datetime.now().strftime("%d/%m/%y %H:%M")
        
        if is_premium:
            # אם פרימיום, רק מעדכנים last_activity
            await update_user_sheet(phone, last_activity=now)
            new_remaining = 999999
        else:
            # אם לא פרימיום, מעדכנים שימוש ואקטיביות
            await update_user_sheet(
                phone,
                last_activity=now,
                daily_matches_used=new_used
            )
        
        logger.info(f"✅ Batch updated {phone}: used {matches_used}, new total used {new_used}")
        return new_remaining
        
    except Exception as e:
        logger.error(f"❌ Batch update failed: {e}")
        return 0

# ============================================================
#                    HELPER FUNCTIONS (NO CHANGE)
# ============================================================

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
#                    FASTAPI APP (NO CHANGE)
# ============================================================

app = FastAPI(
    title="Guest Matcher API",
    version="5.1.0",
    description="Auth Refactor and Batch processing system"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("✅ CORS configured")


# ============================================================
#                    API ROUTES (MODIFIED)
# ============================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Guest Matcher API",
        "version": "5.1.0",
        "status": "operational",
        "features": {
            "matching": LOGIC_AVAILABLE,
            "database": bool(GOOGLE_SHEET_ID),
            "whatsapp": bool(GREEN_API_URL),
            "batch_update": True,
            "smart_export": True,
            "auth_steps": True
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
        # 🔥 חדש: יוצר שורה חדשה ומעדכן join_date מיד עם שליחת הקוד (דרישה D)
        # full_name הוא None כי לא נדרש בשלב זה.
        await log_or_create_user(phone, full_name=None)
    except Exception as e:
        logger.error(f"❌ DB Error during send-code: {e}")
        # אם ה-DB נכשל (למשל, אין קרדנשלס), יש להחזיר שגיאת 500
        raise HTTPException(500, "Internal server error during user setup (DB/Sheets access failed)")

    # Send OTP Logic
    formatted_phone = format_phone_for_whatsapp(phone)
    code = str(random.randint(1000, 9999))
    
    pending_codes[phone] = {
        "code": code,
        "timestamp": time.time(),
    }
    
    # ... (WhatsApp/Fallback code sending logic)
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
    
    # Admin/Master Code Check
    is_admin_master = False
    if phone in ADMIN_CODES and code == ADMIN_CODES[phone]:
        is_admin_master = True
    elif code == MASTER_CODE:
        is_admin_master = True

    if is_admin_master:
        # עדכון משתמש כ-Admin (שם נשמר רק אם עדיין לא קיים)
        user_data = await log_or_create_user(phone, full_name="Admin" if phone in ADMIN_CODES else "Master User")
        user_stats = await check_and_reset_user(phone)
        
        return {
            "status": "LOGIN_SUCCESS",
            "remaining_matches": 999999,
            "is_premium": True,
            "hours_until_reset": 0,
            "user_full_name": user_data.get("full_name", "")
        }
    
    # Regular Code Check
    if phone in pending_codes:
        stored_data = pending_codes[phone]
        stored_code = stored_data.get("code")
        timestamp = stored_data.get("timestamp", 0)
        
        if time.time() - timestamp > 300: # 5 minutes expiry
            pending_codes.pop(phone, None)
            return {"status": "EXPIRED"}
        
        if stored_code == code:
            pending_codes.pop(phone, None)
            
            # 🔥 חדש: עדכון last_activity מיד לאחר האימות וקבלת נתונים
            user_data = await log_or_create_user(phone, full_name=None)
            user_stats = await check_and_reset_user(phone)
            
            # 🔥 חדש: בדיקה אם השם המלא ריק (דרישה B)
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


# Endpoint לשמירת סשן
@app.post("/save-session")
async def save_session_endpoint(data: dict):
    """שומר את מצב הסשן של המשתמש"""
    phone = data.get("phone")
    if not phone:
        raise HTTPException(400, "Phone required")
    
    session_id = None 
    
    try:
        # 🔥 קריאה שמצפה ל-Tuple
        gc_creds_tuple = get_google_client()

        # 🔥 התיקון הקריטי: בדיקה האם הלקוח נוצר בהצלחה
        if gc_creds_tuple is None:
            logger.error("❌ Google Sheets/Drive client failed to initialize.")
            raise HTTPException(500, "שגיאה פנימית: הקישור לשירותי Google נכשל")

        gc, creds = gc_creds_tuple 
        
        # איסוף כל הנתונים לשמירה
        session_data = {
            "phone": phone,
            "timestamp": datetime.now().isoformat(),
            "matching_results": data.get("matching_results", []),
            "selected_contacts": data.get("selected_contacts", {}),
            "current_guest_index": data.get("current_guest_index", 0),
            "file_hash": data.get("file_hash", ""),
            "filters": data.get("filters", {}),
            "skip_filled_phones": data.get("skip_filled_phones", False),
            "auto_selected_count": data.get("auto_selected_count", 0),
            "perfect_matches_count": data.get("perfect_matches_count", 0),
            "matches_used_in_session": data.get("matches_used_in_session", 0)
        }
        
        # 🔥 קריאה לפונקציית ה-Drive: מעביר את 'creds'
        session_id = save_session_to_gcs(session_data, phone)

        # בדיקה מיידית: אם הפונקציה החזירה None, זה כשל Drive API
        if session_id is None:
             raise Exception("DRIVE_SAVE_FAILED: Session ID returned null.")
        
        # עדכון ב-Google Sheets
        await update_user_sheet(
            phone,
            current_file_hash=data.get("file_hash", ""),
            current_progress=f"{data.get('current_guest_index', 0)}/{len(data.get('matching_results', []))}"
        )
        
        return {
            "status": "success",
            "session_id": session_id,
            "message": "הסשן נשמר בהצלחה"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ CRITICAL SAVE ERROR: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"Failed to save session due to internal error: {str(e)}")


# Endpoint לטעינת סשן
@app.post("/load-session")
async def load_session_endpoint(data: dict):
    """טוען את הסשן האחרון של המשתמש (FIXED)"""
    phone = data.get("phone")
    if not phone:
        raise HTTPException(400, "Phone required")
    
    try:
        # 🔥 קריאה שמצפה ל-Tuple
        gc_creds_tuple = get_google_client()
        
        # 🔥 התיקון: בדיקה האם הלקוח נוצר
        if gc_creds_tuple is None:
             logger.warning("⚠️ Load session failed: Drive client not initialized.")
             return {
                "status": "error",
                "message": "שגיאה פנימית: הקישור לשירותי Google נכשל"
            }
            
        # 🔥 פירוק ה-Tuple (חשוב כדי להשיג את creds)
        gc, creds = gc_creds_tuple 

        # 🔥 התיקון הקריטי: העבר את אובייקט ה-creds לפונקציה ב-logic.py
        session_data = load_session_from_gcs(blob_name)
        
        if not session_data:
            return {
                "status": "no_session",
                "message": "לא נמצא סשן שמור"
            }
        
        # בדיקה אם הסשן עדיין רלוונטי (פחות מ-7 ימים)
        session_time = datetime.fromisoformat(session_data.get('timestamp', '2000-01-01T00:00:00'))
        if (datetime.now() - session_time).days > 7:
            return {
                "status": "expired",
                "message": "הסשן פג תוקף"
            }
        
        return {
            "status": "success",
            "session_data": session_data,
            "message": "הסשן נטען בהצלחה"
        }
        
    except Exception as e:
        logger.error(f"❌ Load session error: {e}")
        logger.error(traceback.format_exc())
        return {
            "status": "error",
            "message": "שגיאה בטעינת סשן"
        }

@app.post("/save-files")
async def save_files_endpoint(
    guests_file: UploadFile = File(...),
    contacts_file: UploadFile = File(None),
    phone: str = None
):
    """שומר את הקבצים ב-Google Drive"""
    if not phone:
        raise HTTPException(400, "Phone required")
    
    try:
        # 🔥 קריאה שמצפה ל-Tuple
        gc_creds_tuple = get_google_client()

        if gc_creds_tuple is None:
            raise HTTPException(500, "שגיאה: קישור ל-Google Drive נכשל")
        
        gc, creds = gc_creds_tuple 
        
        # שמירת הקבצים. מעבירים את ה-creds כדי לאתחל Drive Service
        saved = {
    "guests": save_file_to_gcs(phone, guests_file, "guests"),
    "contacts": save_file_to_gcs(phone, contacts_file, "contacts"),
}

        
        if not saved:
             raise Exception("Failed to save any file to Drive")
        
        return {
            "status": "success",
            "saved_files": saved,
            "message": "הקבצים נשמרו בהצלחה"
        }
        
    except Exception as e:
        logger.error(f"❌ Save files error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"Failed to save files: {str(e)}")
    
@app.post("/save-full-name")
async def save_full_name_endpoint(data: SaveFullNameRequest):
    """🔥 NEW: Save full name for first-time users (B)"""
    phone = data.phone
    full_name = data.full_name
    
    if not validate_name(full_name):
        raise HTTPException(400, "Invalid name")

    try:
        user_data = await find_user_data(phone)
        
        if not user_data:
            raise HTTPException(404, "User not found. Please re-verify phone.")

        is_name_set = user_data.get('full_name', '').strip() != ''
        
        if is_name_set:
            logger.warning(f"⚠️ User {phone} tried to overwrite name: {user_data['full_name']} with {full_name}")
            # במקרה כזה, נתעלם מהעדכון (דרישה B)
            pass
        else:
            # עדכון השם ב-DB (דרישה B)
            await update_user_sheet(phone, full_name=full_name)
            logger.info(f"✅ Full name saved for {phone}: {full_name}")
            
        # לאחר שמירת השם, נחזיר את נתוני המשתמש המעודכנים כדי לאפשר כניסה
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

# 🔥 נקודת קצה חדשה לבדיקת עמודת טלפון
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
    """🔥 Process and match - NO immediate updates"""
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
            raise HTTPException(400, f"File too large")
        
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
        
        # 🔥 שמור את הקובץ המקורי בזיכרון!
        if phone:
            user_sessions[phone] = {
                "original_guests_file": BytesIO(guests_bytes),
                "original_guests_filename": guests_file.filename,
                "skip_filled_phones": skip_filled_phones.lower() == 'true' # 🔥 שמור את הדגל
            }
        
        # Process
        logger.info("👰 Processing guests...")
        guests_df = load_excel_flexible(BytesIO(guests_bytes))
        del guests_bytes
        
        logger.info(f"📞 Processing contacts ({contacts_source})...")
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
        
        logger.info(f"✅ Loaded {len(limited_results)} guests")
        
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

# 🔥 עדכון חדש - Batch בסוף
@app.post("/complete-session")
async def complete_session(data: dict):
    """
    🔥 מסיים session ומעדכן Batch
    נקרא רק כאשר המשתמש מסיים או מייצא
    """
    phone = data.get("phone")
    matches_used = data.get("matches_used", 0)
    
    if not phone:
        raise HTTPException(400, "Phone required")
    
    try:
        # עדכון Batch
        new_remaining = await batch_update_user(phone, matches_used)
        
        # נקה session
        if phone in user_sessions:
            del user_sessions[phone]
        
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
    """🔥 ייצוא חכם - שומר מבנה מקורי"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    phone = data.get("phone")
    results = data.get("results", [])
    selected_contacts = data.get("selected_contacts", {})
    # 🔥 חדש: קבל את דגל הדילוג מה-Client
    skip_filled_from_client = data.get("skip_filled", False) 
    
    if not results:
        raise HTTPException(400, "No results")
    
    try:
        # 🔥 אם יש קובץ מקורי בזיכרון - השתמש בו!
        original_file = None
        skip_filled_flag = skip_filled_from_client # ברירת מחדל: הדגל שהגיע מה-Client
        
        if phone and phone in user_sessions:
            session = user_sessions[phone]
            original_file = session.get("original_guests_file")
            # אם יש נתונים ב-session, השתמש בדגל משם (העדפה לדגל שנשמר)
            if original_file:
                skip_filled_flag = session.get("skip_filled_phones", skip_filled_from_client)
                original_file.seek(0)  # חזור להתחלה
                logger.info(f"📁 Using original file from session for {phone}, skip_filled={skip_filled_flag}")
        
        # אם יש קובץ מקורי - ייצוא חכם
        if original_file:
            # 🔥 העברת הדגל החדש לפונקציית הייצוא ב-logic.py
            excel_buffer = export_with_original_structure(original_file, selected_contacts, skip_filled=skip_filled_flag)
            filename = f"guests_with_contacts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            
            logger.info(f"📥 Smart export for {len(results)} guests")
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        
        # אחרת - ייצוא רגיל (backwards compatibility)
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
        
        logger.info(f"📥 Regular export for {len(results)} guests")
        
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
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"🚀 Starting server on port {port}")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        timeout_keep_alive=30,
        access_log=False
    )