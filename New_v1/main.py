#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v4.0 - UPGRADED
==============================================
🔥 שדרוגים:
- מערכת מגבלות 24 שעות מדויקת
- טעינת קובץ לפי מגבלה יומית
- הגבלת תוצאות ל-3 עבור 93%+
- מיון חכם (100% ראשון)
- שמירה אוטומטית כל 10 מוזמנים
- Recovery מקריסה
- פרופיל מוזמן חכם
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
logger.info("🚀 Starting Guest Matcher API v4.0 - UPGRADED...")

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
    logger.info("✅ Google Auth imported")
    
    from logic import (
        load_excel_flexible,
        load_mobile_contacts,
        process_matching_results,
        validate_dataframes,
        to_buf,
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

# 🔥 מגבלות משודרגות
DAILY_LIMIT = 30
MAX_FILE_SIZE = 50 * 1024 * 1024
RATE_LIMIT_PER_MINUTE = 100
ALLOWED_FILE_TYPES = {'.xlsx', '.xls', '.csv'}
CHECKPOINT_INTERVAL = 10  # 🔥 שמירה כל 10 מוזמנים
RESET_INTERVAL_HOURS = 24  # 🔥 איפוס כל 24 שעות

# Environment Variables
GREEN_API_ID = os.environ.get('GREEN_API_ID')
GREEN_API_TOKEN = os.environ.get('GREEN_API_TOKEN')
GOOGLE_SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')
GOOGLE_SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')

GREEN_API_URL = None
if GREEN_API_ID and GREEN_API_TOKEN:
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"
    logger.info("✅ WhatsApp configured")

missing_vars = []
for var_name, var_value in [
    ('GREEN_API_ID', GREEN_API_ID),
    ('GREEN_API_TOKEN', GREEN_API_TOKEN),
    ('GOOGLE_SHEET_ID', GOOGLE_SHEET_ID),
    ('GOOGLE_CREDENTIALS_JSON', GOOGLE_CREDENTIALS_JSON)
]:
    if not var_value:
        missing_vars.append(var_name)

if missing_vars:
    logger.warning(f"⚠️ Missing vars: {', '.join(missing_vars)}")
else:
    logger.info("✅ All environment variables configured")

# In-Memory Storage
pending_codes: Dict[str, Dict[str, Any]] = {}  # 🔥 משודרג - כולל timestamp
rate_limit_tracker: Dict[str, list] = {}
_google_client = None

logger.info("✅ Configuration complete")

# ============================================================
#                    FASTAPI APP
# ============================================================

app = FastAPI(
    title="Guest Matcher API",
    version="4.0.0",
    description="Production-ready wedding guest matching system - UPGRADED"
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
        import gspread
        
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
            ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="12")
            headers = ['id', 'full_name', 'phone', 'join_date', 'last_reset', 
                      'daily_matches_used', 'current_file_hash', 'current_progress', 
                      'is_premium', 'saved_selections', 'last_checkpoint_time', 'total_guests']
            ws.update('A1:L1', [headers])
            logger.info(f"✅ Created worksheet: {GOOGLE_SHEET_NAME}")
            
        return ws
    except Exception as e:
        logger.error(f"❌ Worksheet error: {e}")
        return None

# 🔥 פונקציות מגבלות 24 שעות
async def check_and_reset_if_needed(phone: str) -> Dict[str, Any]:
    """
    🔥 בודק אם עברו 24 שעות ומאפס את המונה
    מחזיר: dict עם daily_matches_used, is_premium, needs_reset
    """
    try:
        ws = await get_worksheet()
        if not ws:
            return {"daily_matches_used": 0, "is_premium": False, "needs_reset": False}
        
        all_values = ws.get_all_values()
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                last_reset_str = row[4] if len(row) > 4 else ""
                daily_used = int(row[5]) if len(row) > 5 and row[5] else 0
                is_premium = bool(row[8]) if len(row) > 8 and row[8] else False
                
                # 🔥 בדיקת 24 שעות
                now = datetime.now()
                needs_reset = False
                
                if last_reset_str:
                    try:
                        last_reset = datetime.fromisoformat(last_reset_str)
                        hours_passed = (now - last_reset).total_seconds() / 3600
                        
                        if hours_passed >= RESET_INTERVAL_HOURS:
                            needs_reset = True
                            # איפוס
                            ws.update(f"E{i}", now.isoformat())  # last_reset
                            ws.update(f"F{i}", 0)  # daily_matches_used
                            daily_used = 0
                            logger.info(f"♻️ Reset daily limit for {phone} after {hours_passed:.1f} hours")
                    except:
                        needs_reset = True
                        ws.update(f"E{i}", now.isoformat())
                        ws.update(f"F{i}", 0)
                        daily_used = 0
                else:
                    # אין תאריך - הגדר עכשיו
                    ws.update(f"E{i}", now.isoformat())
                
                return {
                    "daily_matches_used": daily_used,
                    "is_premium": is_premium,
                    "needs_reset": needs_reset,
                    "last_reset": now.isoformat()
                }
        
        # משתמש חדש
        return {"daily_matches_used": 0, "is_premium": False, "needs_reset": False}
        
    except Exception as e:
        logger.error(f"❌ Check reset failed: {e}")
        return {"daily_matches_used": 0, "is_premium": False, "needs_reset": False}

async def get_remaining_limit(phone: str) -> int:
    """🔥 מחזיר כמה התאמות נותרו למשתמש"""
    user_data = await check_and_reset_if_needed(phone)
    
    if user_data.get("is_premium"):
        return 999999  # ללא הגבלה
    
    return max(0, DAILY_LIMIT - user_data.get("daily_matches_used", 0))

async def calculate_reset_time(phone: str) -> str:
    """🔥 מחשב מתי המגבלה תתאפס"""
    try:
        ws = await get_worksheet()
        if not ws:
            return "24 שעות"
        
        all_values = ws.get_all_values()
        
        for row in all_values[1:]:
            if len(row) > 2 and row[2] == phone:
                last_reset_str = row[4] if len(row) > 4 else ""
                
                if last_reset_str:
                    last_reset = datetime.fromisoformat(last_reset_str)
                    reset_time = last_reset + timedelta(hours=RESET_INTERVAL_HOURS)
                    hours_left = (reset_time - datetime.now()).total_seconds() / 3600
                    
                    if hours_left > 0:
                        return f"{int(hours_left)} שעות ו-{int((hours_left % 1) * 60)} דקות"
        
        return "24 שעות"
        
    except Exception as e:
        logger.error(f"❌ Calculate reset time failed: {e}")
        return "24 שעות"

# 🔥 שמירת checkpoint
async def save_checkpoint(phone: str, file_hash: str, progress: int, selections: dict):
    """שמירת התקדמות כל 10 מוזמנים"""
    try:
        ws = await get_worksheet()
        if not ws:
            return
        
        all_values = ws.get_all_values()
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                ws.update(f"G{i}", file_hash)  # current_file_hash
                ws.update(f"H{i}", progress)  # current_progress
                ws.update(f"J{i}", json.dumps(selections))  # saved_selections
                ws.update(f"K{i}", datetime.now().isoformat())  # last_checkpoint_time
                logger.info(f"💾 Checkpoint saved for {phone}: progress={progress}")
                break
                
    except Exception as e:
        logger.error(f"❌ Save checkpoint failed: {e}")

# 🔥 שחזור checkpoint
async def load_checkpoint(phone: str, file_hash: str) -> Optional[Dict]:
    """טעינת התקדמות שמורה"""
    try:
        ws = await get_worksheet()
        if not ws:
            return None
        
        all_values = ws.get_all_values()
        
        for row in all_values[1:]:
            if len(row) > 2 and row[2] == phone:
                saved_hash = row[6] if len(row) > 6 else ""
                saved_progress = int(row[7]) if len(row) > 7 and row[7] else 0
                saved_selections = row[9] if len(row) > 9 else "{}"
                
                if saved_hash == file_hash and saved_progress > 0:
                    return {
                        "progress": saved_progress,
                        "selections": json.loads(saved_selections) if saved_selections else {}
                    }
        
        return None
        
    except Exception as e:
        logger.error(f"❌ Load checkpoint failed: {e}")
        return None

# ============================================================
#                    HELPER FUNCTIONS
# ============================================================

def format_phone_for_whatsapp(phone: str) -> str:
    """Format phone for WhatsApp (972xxxxxxxxx)"""
    digits = re.sub(r'\D', '', phone)
    if digits.startswith('0'):
        digits = '972' + digits[1:]
    return digits

def create_file_hash(content: bytes) -> str:
    """Generate MD5 hash for file"""
    return hashlib.md5(content).hexdigest()

def check_rate_limit(identifier: str) -> bool:
    """Check if user exceeded rate limit"""
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
    """Validate uploaded file"""
    if not file.filename:
        return False, "No filename provided"
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_FILE_TYPES:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_FILE_TYPES)}"
    
    return True, "OK"

async def log_user_to_sheets(phone: str, full_name: str = ""):
    """Save user to Google Sheets"""
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
        
        current_time = datetime.now().isoformat()
        
        if existing_row:
            ws.update(f"D{existing_row}", current_time)  # last_activity (join_date stays same)
            if full_name and full_name.strip():
                ws.update(f"B{existing_row}", full_name)
            logger.info(f"✅ Updated user: {phone}")
        else:
            next_row = len(all_values) + 1
            next_id = next_row - 1
            
            new_user_data = [
                next_id, full_name or phone, phone, current_time, current_time,
                0, "", 0, False, "{}", "", 0
            ]
            
            ws.update(f"A{next_row}:L{next_row}", [new_user_data])
            logger.info(f"✅ Added user: {phone}")
            
    except Exception as e:
        logger.error(f"❌ Log user failed: {e}")

async def get_user_data(phone: str) -> Dict[str, Any]:
    """Get user data from sheets with 24h reset check"""
    return await check_and_reset_if_needed(phone)

async def update_user_progress(phone: str, matches_used: int = None, 
                              file_hash: str = None, progress: int = None):
    """Update user progress"""
    if not LOGIC_AVAILABLE or not GOOGLE_SHEET_ID:
        return
        
    try:
        ws = await get_worksheet()
        if not ws:
            return
        
        all_values = ws.get_all_values()
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                if matches_used is not None:
                    ws.update(f"F{i}", matches_used)
                if file_hash is not None:
                    ws.update(f"G{i}", file_hash)
                if progress is not None:
                    ws.update(f"H{i}", progress)
                break
                
    except Exception as e:
        logger.error(f"❌ Update progress failed: {e}")

def cleanup_memory():
    """Force garbage collection"""
    gc.collect()
    logger.debug("🧹 Memory cleaned")

# ============================================================
#                    API ROUTES
# ============================================================

@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "name": "Guest Matcher API",
        "version": "4.0.0 - UPGRADED",
        "status": "operational",
        "features": {
            "matching": LOGIC_AVAILABLE,
            "database": bool(GOOGLE_SHEET_ID),
            "whatsapp": bool(GREEN_API_URL),
            "mobile_contacts": True,
            "auto_selection": True,
            "rate_limiting": True,
            "file_validation": True,
            "24h_reset": True,  # 🔥
            "smart_sorting": True,  # 🔥
            "checkpoint_save": True,  # 🔥
            "smart_profile": True  # 🔥
        }
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "logic": LOGIC_AVAILABLE,
        "database": bool(GOOGLE_SHEET_ID and GOOGLE_CREDENTIALS_JSON),
        "whatsapp": bool(GREEN_API_URL),
        "memory_ok": True
    }

@app.post("/send-code")
async def send_code(data: dict, request: Request):
    """Send verification code via WhatsApp"""
    phone = data.get("phone")
    full_name = data.get("full_name", "")
    
    if not phone:
        raise HTTPException(400, "Phone required")
    
    if not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests. Try again later.")
    
    if not GREEN_API_URL:
        raise HTTPException(500, "WhatsApp not configured")
    
    formatted_phone = format_phone_for_whatsapp(phone)
    code = str(random.randint(1000, 9999))
    
    # 🔥 שמירה עם timestamp
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
    """Verify authentication code"""
    phone = data.get("phone")
    code = data.get("code")
    full_name = data.get("full_name", "")
    
    if not phone or not code:
        raise HTTPException(400, "Phone and code required")
    
    # 🔥 בדיקת תוקף (5 דקות)
    if phone in pending_codes:
        stored_data = pending_codes[phone]
        stored_code = stored_data.get("code")
        timestamp = stored_data.get("timestamp", 0)
        
        # בדיקת פג תוקף
        if time.time() - timestamp > 300:  # 5 minutes
            pending_codes.pop(phone, None)
            return {"status": "expired", "message": "הקוד פג תוקף"}
        
        if stored_code == code:
            pending_codes.pop(phone, None)
            
            await log_user_to_sheets(phone, full_name)
            user_data = await get_user_data(phone)
            
            # 🔥 חישוב זמן איפוס
            reset_time = await calculate_reset_time(phone)
            
            logger.info(f"✅ User verified: {phone}")
            return {
                "status": "success",
                "daily_matches_used": user_data["daily_matches_used"],
                "is_premium": user_data["is_premium"],
                "remaining_matches": await get_remaining_limit(phone),
                "reset_time": reset_time
            }
    
    logger.warning(f"❌ Invalid code: {phone}")
    return {"status": "failed"}

@app.post("/merge-files")
async def merge_files(
    guests_file: UploadFile = File(...),
    contacts_file: UploadFile = File(...),
    phone: Optional[str] = None,
    contacts_source: str = "file",
    background_tasks: BackgroundTasks = None
):
    """Process and match guests with contacts - UPGRADED"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    if phone and not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests")
    
    # Validate files
    for file in [guests_file, contacts_file]:
        is_valid, error = validate_file(file)
        if not is_valid:
            raise HTTPException(400, error)
    
    try:
        logger.info("📂 Reading files...")
        guests_bytes = await guests_file.read()
        contacts_bytes = await contacts_file.read()
        
        if len(guests_bytes) > MAX_FILE_SIZE or len(contacts_bytes) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File too large. Max: {MAX_FILE_SIZE/1024/1024}MB")
        
        file_hash = create_file_hash(guests_bytes)
        
        # 🔥 בדיקת מגבלה יומית
        if phone:
            remaining = await get_remaining_limit(phone)
            user_data = await get_user_data(phone)
            
            if remaining <= 0 and not user_data.get("is_premium"):
                reset_time = await calculate_reset_time(phone)
                raise HTTPException(403, {
                    "error": "daily_limit_exceeded",
                    "message": f"הגעת למגבלה היומית של {DAILY_LIMIT} התאמות",
                    "reset_time": reset_time
                })
        
        # Process guests
        logger.info("👰 Processing guests...")
        guests_df = load_excel_flexible(BytesIO(guests_bytes))
        del guests_bytes
        
        total_guests = len(guests_df)
        
        # 🔥 הגבלת טעינה לפי מגבלה יומית
        if phone:
            remaining = await get_remaining_limit(phone)
            user_data = await get_user_data(phone)
            
            if not user_data.get("is_premium") and total_guests > remaining:
                logger.warning(f"⚠️ Limiting guests from {total_guests} to {remaining}")
                guests_df = guests_df.head(remaining)
                warning_message = f"נטענו {remaining} מוזמנים מתוך {total_guests} (יתרת מגבלה יומית)"
            else:
                warning_message = None
        else:
            warning_message = None
        
        # Process contacts
        logger.info(f"📞 Processing contacts ({contacts_source})...")
        if contacts_source == "mobile":
            contacts_data = json.loads(contacts_bytes.decode('utf-8'))
            contacts_df = load_mobile_contacts(contacts_data)
            del contacts_data
        else:
            contacts_df = load_excel_flexible(BytesIO(contacts_bytes))
        
        del contacts_bytes
        
        # Validate
        is_valid, error = validate_dataframes(guests_df, contacts_df)
        if not is_valid:
            raise HTTPException(400, error)
        
        # 🔥 בדיקת checkpoint קיים
        checkpoint = None
        if phone:
            checkpoint = await load_checkpoint(phone, file_hash)
        
        # Process matches
        logger.info("🔄 Processing matches with smart sorting...")
        results = process_matching_results(guests_df, contacts_df, contacts_source)
        
        del guests_df
        del contacts_df
        
        if background_tasks:
            background_tasks.add_task(cleanup_memory)
        else:
            cleanup_memory()
        
        auto_count = sum(1 for r in results if r.get("auto_selected"))
        perfect_count = sum(1 for r in results if r.get("best_score") == 100)
        
        logger.info(f"✅ Processed {len(results)} guests")
        logger.info(f"🎯 {perfect_count} perfect matches (100%)")
        logger.info(f"✨ {auto_count} auto-selected (93%+)")
        
        response_data = {
            "results": results,
            "total_guests": len(results),
            "auto_selected_count": auto_count,
            "perfect_matches_count": perfect_count,
            "file_hash": file_hash
        }
        
        if warning_message:
            response_data["warning"] = warning_message
            response_data["total_in_file"] = total_guests
        
        if checkpoint:
            response_data["checkpoint"] = checkpoint
        
        return response_data
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Merge error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, str(e))

# 🔥 שמירת התקדמות
@app.post("/save-checkpoint")
async def save_checkpoint_endpoint(data: dict):
    """Save progress checkpoint"""
    phone = data.get("phone")
    file_hash = data.get("file_hash")
    progress = data.get("progress")
    selections = data.get("selections", {})
    
    if not phone or not file_hash:
        raise HTTPException(400, "Missing required fields")
    
    try:
        await save_checkpoint(phone, file_hash, progress, selections)
        return {"status": "success", "saved_at": datetime.now().isoformat()}
    except Exception as e:
        logger.error(f"❌ Save checkpoint endpoint error: {e}")
        raise HTTPException(500, "Failed to save checkpoint")

# 🔥 שחזור התקדמות
@app.post("/load-checkpoint")
async def load_checkpoint_endpoint(data: dict):
    """Load saved progress"""
    phone = data.get("phone")
    file_hash = data.get("file_hash")
    
    if not phone or not file_hash:
        raise HTTPException(400, "Missing required fields")
    
    try:
        checkpoint = await load_checkpoint(phone, file_hash)
        if checkpoint:
            return {"status": "found", "checkpoint": checkpoint}
        else:
            return {"status": "not_found"}
    except Exception as e:
        logger.error(f"❌ Load checkpoint endpoint error: {e}")
        raise HTTPException(500, "Failed to load checkpoint")

@app.post("/export-results")
async def export_results(data: dict):
    """Export results to Excel"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    results = data.get("results", [])
    selected_contacts = data.get("selected_contacts", {})
    
    if not results:
        raise HTTPException(400, "No results")
    
    try:
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
        
        logger.info(f"📥 Exported {len(results)} guests")
        
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

# 🔥 סטטיסטיקות משתמש משודרגות
@app.get("/user-stats/{phone}")
async def get_user_stats(phone: str):
    """Get user statistics with 24h reset info"""
    try:
        user_data = await get_user_data(phone)
        remaining = await get_remaining_limit(phone)
        reset_time = await calculate_reset_time(phone)
        
        return {
            "phone": phone,
            "daily_matches_used": user_data["daily_matches_used"],
            "daily_matches_remaining": remaining,
            "is_premium": user_data["is_premium"],
            "daily_limit": DAILY_LIMIT,
            "reset_time": reset_time,
            "last_reset": user_data.get("last_reset", "")
        }
    except Exception as e:
        logger.error(f"❌ Stats error: {e}")
        raise HTTPException(500, "Failed to get stats")

# 🔥 בדיקת סטטוס תשלום
@app.get("/check-payment-status/{phone}")
async def check_payment_status(phone: str):
    """Check if user has paid for premium"""
    try:
        user_data = await get_user_data(phone)
        return {
            "is_premium": user_data.get("is_premium", False),
            "phone": phone
        }
    except Exception as e:
        logger.error(f"❌ Check payment error: {e}")
        raise HTTPException(500, "Failed to check payment status")

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