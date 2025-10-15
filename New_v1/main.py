#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v5.0 - BATCH UPDATE
==============================================
🔥 Batch processing - עדכון רק בסוף
"""

import logging
import sys
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional, Dict, Any
import traceback
import gc
import json

# ============================================================
#                    LOGGING SETUP
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)
logger.info("🚀 Starting Guest Matcher API v5.0 - BATCH UPDATE...")

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
    logger.info(f"✅ Port: {PORT}")
    
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, JSONResponse
    import uvicorn
    import requests
    
    logger.info("✅ FastAPI imported")
    
    import pandas as pd
    logger.info("✅ Pandas imported")
    
    from google.oauth2 import service_account
    import gspread
    logger.info("✅ Google Auth & gspread imported")
    
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
    logger.info("✅ Logic module loaded")
    
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

GREEN_API_URL = None
if GREEN_API_ID and GREEN_API_TOKEN:
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"
    logger.info("✅ WhatsApp configured")

# 🔥 In-Memory Storage - עכשיו שומר את הקובץ המקורי!
pending_codes: Dict[str, Dict[str, Any]] = {}
rate_limit_tracker: Dict[str, list] = {}
user_sessions: Dict[str, Dict[str, Any]] = {}
_google_client = None

logger.info("✅ Configuration complete")

# ============================================================
#                    FASTAPI APP
# ============================================================

app = FastAPI(
    title="Guest Matcher API",
    version="5.0.0",
    description="Batch processing system"
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
#                    GOOGLE SHEETS FUNCTIONS
# ============================================================

def get_google_client():
    """Get cached Google Sheets client"""
    global _google_client
    
    if _google_client is not None:
        return _google_client
    
    if not GOOGLE_CREDENTIALS_JSON:
        raise Exception("Google credentials not configured")
    
    try:
        creds_info = json.loads(GOOGLE_CREDENTIALS_JSON)
        SCOPES = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        
        credentials = service_account.Credentials.from_service_account_info(
            creds_info, scopes=SCOPES
        )
        
        _google_client = gspread.authorize(credentials)
        logger.info("✅ Google Sheets client created")
        return _google_client
        
    except Exception as e:
        logger.error(f"❌ Google Sheets failed: {e}")
        raise

async def get_worksheet():
    """Get worksheet with error handling"""
    try:
        gc = get_google_client()
        sh = gc.open_by_key(GOOGLE_SHEET_ID)
        
        try:
            ws = sh.worksheet(GOOGLE_SHEET_NAME)
        except:
            ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="10")
            headers = ['id', 'full_name', 'phone', 'join_date', 'last_activity', 
                      'remaining_matches', 'current_file_hash', 'current_progress', 'is_premium']
            ws.update('A1:I1', [headers])
            logger.info(f"✅ Created worksheet: {GOOGLE_SHEET_NAME}")
            
        return ws
    except Exception as e:
        logger.error(f"❌ Worksheet error: {e}")
        return None

async def check_and_reset_user(phone: str) -> Dict[str, Any]:
    """בודק אם עברו 24 שעות ומאפס"""
    try:
        ws = await get_worksheet()
        if not ws:
            return {"remaining_matches": 30, "is_premium": False, "hours_until_reset": 0}
        
        all_values = ws.get_all_values()
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                # 1. חילוץ נתונים
                last_activity_str = row[4] if len(row) > 4 else ""
                # עמודה 5 (F) היא daily_matches_used
                daily_used = int(row[5]) if len(row) > 5 and row[5] and str(row[5]).isdigit() else 0 
                remaining = DAILY_LIMIT - daily_used
                is_premium = str(row[8]).upper() == 'TRUE' if len(row) > 8 else False
                
                now = datetime.now()
                hours_passed = 24
                
                # 2. בדיקת זמן איפוס
                if last_activity_str:
                    try:
                        # 🔥 נסה לקרוא את פורמט התאריך הסטנדרטי שלך
                        last_activity = datetime.strptime(last_activity_str, "%d/%m/%y %H:%M")
                        hours_passed = (now - last_activity).total_seconds() / 3600
                    except ValueError:
                         # נסה פורמט אחר אם יש בעיה (למקרה של תאריך מלא כמו 2025-10-06T00:50:08.571739)
                        try:
                            last_activity = datetime.fromisoformat(last_activity_str)
                            hours_passed = (now - last_activity).total_seconds() / 3600
                        except:
                            hours_passed = 24 # אם יש שגיאת פורמט, נניח שהזמן עבר
                            logger.warning(f"⚠️ Invalid date format for {phone}, assuming 24h passed.")
                    except Exception:
                        pass
                
                # 3. איפוס המונה (Daily Used)
                if hours_passed >= 24 and daily_used > 0:
                    # 🚨 איפוס: אם עברו 24 שעות והוא השתמש במונה, אפס אותו.
                    ws.update(f"F{i}", 0) # מאפסים את המונה ל-0 שימוש
                    daily_used = 0
                    remaining = DAILY_LIMIT
                    hours_passed = 24 # מאפס את הזמן שחלף לצורך חישוב hours_until_reset
                    logger.info(f"♻️ Daily usage reset for {phone}")

                # 4. חישוב שעות עד איפוס (Hours Until Reset)
                # 🔥 אם הוא פרימיום או שיש לו 30 התאמות (כי הוא אופס או עדיין לא השתמש), אין זמן איפוס.
                if is_premium or remaining >= DAILY_LIMIT:
                    hours_until_reset = 0
                else:
                    # הוא השתמש (remaining < 30) והזמן עדיין לא עבר:
                    hours_until_reset = max(0.0, 24.0 - hours_passed)
                
                return {
                    "remaining_matches": remaining if not is_premium else 999999,
                    "is_premium": is_premium,
                    "hours_until_reset": hours_until_reset,
                    "last_activity": last_activity_str
                }
        
        return {"remaining_matches": DAILY_LIMIT, "is_premium": False, "hours_until_reset": 0}
        
    except Exception as e:
        logger.error(f"❌ Check reset failed: {e}")
        return {"remaining_matches": DAILY_LIMIT, "is_premium": False, "hours_until_reset": 0}

# 🔥 עדכון BATCH בסוף
async def batch_update_user(phone: str, matches_used: int):
    """
    🔥 עדכון Batch - מעדכן הכל בבת אחת בסוף
    """
    try:
        ws = await get_worksheet()
        if not ws:
            return 0
        
        all_values = ws.get_all_values()
        now = datetime.now().strftime("%d/%m/%y %H:%M")
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                # 🚨 קריאה מדוייקת יותר מהגיליון לפני עדכון
                current_remaining = int(row[5]) if len(row) > 5 and row[5] and str(row[5]).isdigit() else DAILY_LIMIT
                is_premium = str(row[8]).upper() == 'TRUE' if len(row) > 8 else False
                
                if is_premium:
                    new_remaining = 999999
                else:
                    new_remaining = max(0, current_remaining - matches_used)
                
                # עדכון בבת אחת - שימו לב: remaining_matches נמצא בעמודה F (אינדקס 5)
                ws.update(f"E{i}:F{i}", [[now, new_remaining]])
                logger.info(f"✅ Batch updated {phone}: used {matches_used}, remaining {new_remaining}")
                return new_remaining
        
        return 0
                
    except Exception as e:
        logger.error(f"❌ Batch update failed: {e}")
        return 0

# ============================================================
#                    HELPER FUNCTIONS
# ============================================================

# (שאר פונקציות העזר נשארות כפי שהן)
# ...

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

async def log_user_to_sheets(phone: str, full_name: str = ""):
    """Save user to Sheets"""
    if not LOGIC_AVAILABLE or not GOOGLE_SHEET_ID:
        return
        
    try:
        ws = await get_worksheet()
        if not ws:
            return
        
        try:
            all_values = ws.get_all_values()
            existing_row = None
            
            for i, row in enumerate(all_values[1:], 2):
                if len(row) > 2 and row[2] == phone:
                    existing_row = i
                    break
        except:
            all_values = []
            existing_row = None
        
        current_time = datetime.now().strftime("%d/%m/%y %H:%M")
        
        if existing_row:
            if full_name and full_name.strip():
                ws.update(f"B{existing_row}", full_name)
            logger.info(f"✅ Updated user: {phone}")
        else:
            next_row = len(all_values) + 1
            next_id = next_row - 1
            
            new_user_data = [
                next_id,
                full_name or phone,
                phone,
                current_time,
                "",
                DAILY_LIMIT, # ברירת מחדל: 30
                "",
                0,
                False
            ]
            
            ws.update(f"A{next_row}:I{next_row}", [new_user_data])
            logger.info(f"✅ Added new user: {phone}")
            
    except Exception as e:
        logger.error(f"❌ Log user failed: {e}")

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
#                    API ROUTES
# ============================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Guest Matcher API",
        "version": "5.0.0",
        "status": "operational",
        "features": {
            "matching": LOGIC_AVAILABLE,
            "database": bool(GOOGLE_SHEET_ID),
            "whatsapp": bool(GREEN_API_URL),
            "batch_update": True,
            "smart_export": True
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
async def send_code(data: dict, request: Request):
    """Send verification code"""
    phone = data.get("phone")
    full_name = data.get("full_name", "")
    
    if not phone:
        raise HTTPException(400, "Phone required")
    
    if not validate_phone(phone):
        raise HTTPException(400, "Invalid phone")
    
    if full_name and not validate_name(full_name):
        raise HTTPException(400, "Invalid name")
    
    if not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests")
    
    if not GREEN_API_URL:
        # אם אין וואטסאפ מוגדר, השתמש בקוד ראשי לצורך בדיקה
        code = MASTER_CODE if phone == "0507676706" else str(random.randint(1000, 9999))
        
        pending_codes[phone] = {
            "code": code,
            "timestamp": time.time(),
            "full_name": full_name
        }
        
        logger.warning(f"⚠️ WhatsApp not configured, returning code {code}")
        return {"status": "success", "code": code}

    formatted_phone = format_phone_for_whatsapp(phone)
    code = str(random.randint(1000, 9999))
    
    pending_codes[phone] = {
        "code": code,
        "timestamp": time.time(),
        "full_name": full_name
    }
    
    payload = {
        "chatId": f"{formatted_phone}@c.us",
        "message": f"🔐 קוד האימות שלך: {code}"
    }

    try:
        res = requests.post(GREEN_API_URL, json=payload, timeout=10)
        logger.info(f"📱 Code sent to {formatted_phone}")
        return {"status": "success", "code": code}
    except Exception as e:
        logger.warning(f"⚠️ WhatsApp error: {e}")
        return {"status": "success", "code": code}

@app.post("/verify-code")
async def verify_code(data: dict):
    """Verify code"""
    phone = data.get("phone")
    code = data.get("code")
    full_name = data.get("full_name", "")
    
    if not phone or not code:
        raise HTTPException(400, "Phone and code required")
    
    # Admin
    if phone in ADMIN_CODES and code == ADMIN_CODES[phone]:
        logger.info(f"👑 Admin login: {phone}")
        await log_user_to_sheets(phone, full_name or "Admin")
        
        return {
            "status": "success",
            "remaining_matches": 999999,
            "is_premium": True,
            "hours_until_reset": 0,
            "is_admin": True
        }
    
    # Master code
    if code == MASTER_CODE:
        logger.info(f"🔓 Master code: {phone}")
        await log_user_to_sheets(phone, full_name)
        user_data = await check_and_reset_user(phone)
        
        return {
            "status": "success",
            "remaining_matches": user_data["remaining_matches"],
            "is_premium": user_data["is_premium"],
            "hours_until_reset": user_data["hours_until_reset"],
            "master_login": True
        }
    
    # Regular code
    if phone in pending_codes:
        stored_data = pending_codes[phone]
        stored_code = stored_data.get("code")
        timestamp = stored_data.get("timestamp", 0)
        
        if time.time() - timestamp > 300:
            pending_codes.pop(phone, None)
            return {"status": "expired"}
        
        if stored_code == code:
            pending_codes.pop(phone, None)
            
            await log_user_to_sheets(phone, full_name)
            user_data = await check_and_reset_user(phone)
            
            logger.info(f"✅ User verified: {phone}")
            
            return {
                "status": "success",
                "remaining_matches": user_data["remaining_matches"],
                "is_premium": user_data["is_premium"],
                "hours_until_reset": user_data["hours_until_reset"]
            }
    
    logger.warning(f"❌ Invalid code: {phone}")
    return {"status": "failed"}

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
    skip_filled_phones: str = "false", # 🔥 חדש: האם לדלג על מוזמנים עם טלפון קיים
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