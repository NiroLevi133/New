#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v5.0 - BATCH UPDATE
==============================================
"""

import logging
import sys
from datetime import datetime, timedelta
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

# In-Memory Storage
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
        logger.error("❌ Google credentials not configured")
        return None
    
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
        if gc is None:
            return None
        
        sh = gc.open_by_key(GOOGLE_SHEET_ID)
        
        try:
            ws = sh.worksheet(GOOGLE_SHEET_NAME)
        except:
            ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="10")
            headers = ['id', 'full_name', 'phone', 'join_date', 'last_activity', 
                      'daily_matches_used', 'current_file_hash', 'current_progress', 'is_premium']
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
                # עמודה F (אינדקס 5) היא daily_matches_used
                daily_used = int(row[5]) if len(row) > 5 and row[5] and str(row[5]).isdigit() else 0 
                remaining = DAILY_LIMIT - daily_used
                # 🔥 לוגיקה פשוטה: is_premium = True אם כתוב True בגיליון
                is_premium = str(row[8]).upper() == 'TRUE' if len(row) > 8 else False 
                
                now = datetime.now()
                hours_passed = 24
                
                # 2. בדיקת זמן איפוס
                if last_activity_str:
                    try:
                        last_activity = datetime.strptime(last_activity_str, "%d/%m/%y %H:%M")
                        hours_passed = (now - last_activity).total_seconds() / 3600
                    except ValueError:
                        try:
                            last_activity = datetime.fromisoformat(last_activity_str)
                            hours_passed = (now - last_activity).total_seconds() / 3600
                        except:
                            hours_passed = 24 
                            logger.warning(f"⚠️ Invalid date format for {phone}, assuming 24h passed.")
                    except Exception:
                        pass
                
                # 3. איפוס המונה (Daily Used)
                if hours_passed >= 24 and daily_used > 0:
                    ws.update(f"F{i}", 0) # מאפסים את המונה ל-0 שימוש
                    daily_used = 0
                    remaining = DAILY_LIMIT
                    hours_passed = 24 
                    logger.info(f"♻️ Daily usage reset for {phone}")

                # 4. חישוב שעות עד איפוס (Hours Until Reset)
                if is_premium or remaining >= DAILY_LIMIT:
                    hours_until_reset = 0
                else:
                    hours_until_reset = max(0.0, 24.0 - hours_passed)
                
                return {
                    "remaining_matches": remaining if not is_premium else 999999,
                    "is_premium": is_premium,
                    "hours_until_reset": hours_until_reset,
                    "last_activity": last_activity_str
                }
        
        # משתמש חדש
        return {"remaining_matches": DAILY_LIMIT, "is_premium": False, "hours_until_reset": 0}
        
    except Exception as e:
        logger.error(f"❌ Check reset failed: {e}")
        return {"remaining_matches": DAILY_LIMIT, "is_premium": False, "hours_until_reset": 0}

# 🔥 תיקון קריטי: עדכון BATCH בסוף
async def batch_update_user(phone: str, matches_used: int):
    """
    עדכון Batch - מעדכן את מספר ההתאמות שבוצעו ומועד הפעילות האחרון.
    """
    try:
        ws = await get_worksheet()
        if not ws:
            return DAILY_LIMIT
        
        all_values = ws.get_all_values()
        now = datetime.now().strftime("%d/%m/%y %H:%M")
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                # קריאה מדוייקת יותר של המונה הנוכחי מתוך הגיליון
                current_used = int(row[5]) if len(row) > 5 and row[5] and str(row[5]).isdigit() else 0
                is_premium = str(row[8]).upper() == 'TRUE' if len(row) > 8 else False
                
                if is_premium:
                    new_used = 0
                    new_remaining = 999999
                else:
                    # החישוב הנכון: מוסיפים את השימוש הנוכחי למונה הקיים
                    new_used = min(DAILY_LIMIT, current_used + matches_used)
                    new_remaining = DAILY_LIMIT - new_used
                
                # עדכון בבת אחת - E (last_activity), F (daily_matches_used)
                ws.update(f"E{i}:F{i}", [[now, new_used]])
                logger.info(f"✅ Batch updated {phone}: used {matches_used}, TOTAL used {new_used}, remaining {new_remaining}")
                return new_remaining
        
        return DAILY_LIMIT
                
    except Exception as e:
        logger.error(f"❌ Batch update failed: {e}")
        return 0

# ============================================================
#                    HELPER FUNCTIONS
# ============================================================
# ... (שאר פונקציות העזר נשארות זהות) ...

def format_phone_for_whatsapp(phone: str) -> str:
# ... (פונקציה נשארת זהה) ...

def create_file_hash(content: bytes) -> str:
# ... (פונקציה נשארת זהה) ...

def check_rate_limit(identifier: str) -> bool:
# ... (פונקציה נשארת זהה) ...

def validate_file(file: UploadFile) -> tuple[bool, str]:
# ... (פונקציה נשארת זהה) ...

def validate_phone(phone: str) -> bool:
# ... (פונקציה נשארת זהה) ...

def validate_name(name: str) -> bool:
# ... (פונקציה נשארת זהה) ...

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
            
            # 🔥 לא מעדכנים is_premium כאן. הסטטוס נשמר רק כפי שהוגדר בגיליון.
            ws.update(f"E{existing_row}", current_time) # עדכון last_activity
            logger.info(f"✅ Updated user activity: {phone}")
        else:
            next_row = len(all_values) + 1
            next_id = next_row - 1
            
            new_user_data = [
                next_id,
                full_name or phone,
                phone,
                current_time,
                "", # last_activity
                0,  # daily_matches_used
                "",
                0,
                False # is_premium
            ]
            
            ws.update(f"A{next_row}:I{next_row}", [new_user_data])
            logger.info(f"✅ Added new user: {phone}")
            
    except Exception as e:
        logger.error(f"❌ Log user failed: {e}")

# ... (שאר פונקציות העזר נשארות זהות) ...

# ============================================================
#                    API ROUTES
# ============================================================

# ... (Routes: /, /health, /send-code נשארים זהים) ...

@app.post("/verify-code")
async def verify_code(data: dict):
    """Verify code"""
    phone = data.get("phone")
    code = data.get("code")
    full_name = data.get("full_name", "")
    
    if not phone or not code:
        raise HTTPException(400, "Phone and code required")
    
    # 🔥 הוסר הטיפול המיוחד ב-ADMIN_CODES. כעת הוא משתמש רגיל.
    
    # Master code
    if code == MASTER_CODE:
        logger.info(f"🔓 Master code: {phone}")
        await log_user_to_sheets(phone, full_name)
        user_data = await check_and_reset_user(phone)
        
        # 🔥 אם משתמש נכנס עם MASTER_CODE, הוא מקבל את הסטטוס הרגיל שלו
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
            # קריאה ל-check_and_reset_user תביא את המונה המעודכן מה-Sheets
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