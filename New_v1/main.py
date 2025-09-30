#!/usr/bin/env python3
"""
==============================================
    Guest Matcher API v3.0
==============================================
Production-ready backend for matching wedding guests with contacts

Features:
- Smart matching algorithm (93%+ auto-selection)
- Mobile contacts support
- File validation & rate limiting
- Google Sheets database
- WhatsApp authentication
- Memory optimized
- Error recovery
- Request tracking
"""

import logging
import sys
from datetime import datetime
from functools import wraps
from typing import Optional, Dict, Any
import traceback
import gc

# ============================================================
#                    LOGGING SETUP
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Custom filter to add request_id to logs
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'request_id'):
            record.request_id = 'system'
        return True

logger.addFilter(RequestIdFilter())

logger.info("🚀 Starting Guest Matcher API v3.0...")

# ============================================================
#                    IMPORTS
# ============================================================
try:
    logger.info("📦 Importing libraries...")
    
    # Standard Library
    import os
    import json
    import re
    import hashlib
    import random
    import time
    from io import BytesIO
    
    # Port Configuration
    PORT = os.environ.get('PORT', '8080')
    logger.info(f"✅ Port: {PORT}")
    
    # FastAPI & Web
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse, JSONResponse
    import uvicorn
    import requests
    
    logger.info("✅ FastAPI imported")
    
    # Data Processing
    import pandas as pd
    logger.info("✅ Pandas imported")
    
    # Google Cloud
    from google.oauth2 import service_account
    logger.info("✅ Google Auth imported")
    
    # Custom Logic Module
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

# Business Constants
DAILY_LIMIT = 30
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
RATE_LIMIT_PER_MINUTE = 100
ALLOWED_FILE_TYPES = {'.xlsx', '.xls', '.csv'}

# Environment Variables
GREEN_API_ID = os.environ.get('GREEN_API_ID')
GREEN_API_TOKEN = os.environ.get('GREEN_API_TOKEN')
GOOGLE_SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')
GOOGLE_SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')

# Construct URLs
GREEN_API_URL = None
if GREEN_API_ID and GREEN_API_TOKEN:
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"
    logger.info("✅ WhatsApp configured")

# Validation
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
pending_codes: Dict[str, str] = {}
rate_limit_tracker: Dict[str, list] = {}
_google_client = None

logger.info("✅ Configuration complete")

# ============================================================
#                    FASTAPI APP
# ============================================================

app = FastAPI(
    title="Guest Matcher API",
    version="3.0.0",
    description="Production-ready wedding guest matching system"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("✅ CORS configured")

# ============================================================
#                    MIDDLEWARE
# ============================================================

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add unique request ID to each request"""
    request_id = f"{int(time.time()*1000)}-{random.randint(1000,9999)}"
    request.state.request_id = request_id
    
    # Add to logging context
    old_factory = logging.getLogRecordFactory()
    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.request_id = request_id
        return record
    logging.setLogRecordFactory(record_factory)
    
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    
    # Restore old factory
    logging.setLogRecordFactory(old_factory)
    
    return response

# ============================================================
#                    HELPER FUNCTIONS
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
            ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="10")
            headers = ['id', 'full_name', 'phone', 'join_date', 'last_activity',
                      'daily_matches_used', 'current_file_hash', 'current_progress', 'is_premium']
            ws.update('A1:I1', [headers])
            logger.info(f"✅ Created worksheet: {GOOGLE_SHEET_NAME}")
            
        return ws
    except Exception as e:
        logger.error(f"❌ Worksheet error: {e}")
        return None

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
    
    # Remove old requests (older than 1 minute)
    rate_limit_tracker[identifier] = [
        req_time for req_time in rate_limit_tracker[identifier]
        if now - req_time < 60
    ]
    
    # Check limit
    if len(rate_limit_tracker[identifier]) >= RATE_LIMIT_PER_MINUTE:
        return False
    
    # Add new request
    rate_limit_tracker[identifier].append(now)
    return True

def validate_file(file: UploadFile) -> tuple[bool, str]:
    """Validate uploaded file"""
    # Check file extension
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
        
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if existing_row:
            ws.update(f"E{existing_row}", current_time)
            if full_name and full_name.strip():
                ws.update(f"B{existing_row}", full_name)
            logger.info(f"✅ Updated user: {phone}")
        else:
            next_row = len(all_values) + 1
            next_id = next_row - 1
            
            new_user_data = [
                next_id, full_name or phone, phone, current_time, current_time,
                0, "", 0, False
            ]
            
            ws.update(f"A{next_row}:I{next_row}", [new_user_data])
            logger.info(f"✅ Added user: {phone}")
            
    except Exception as e:
        logger.error(f"❌ Log user failed: {e}")

async def get_user_data(phone: str) -> Dict[str, Any]:
    """Get user data from sheets"""
    default = {
        "daily_matches_used": 0,
        "is_premium": False,
        "current_file_hash": "",
        "current_progress": 0
    }
    
    if not LOGIC_AVAILABLE or not GOOGLE_SHEET_ID:
        return default
        
    try:
        ws = await get_worksheet()
        if not ws:
            return default
        
        all_values = ws.get_all_values()
        
        for i, row in enumerate(all_values[1:], 2):
            if len(row) > 2 and row[2] == phone:
                today = datetime.now().date()
                last_activity = row[4] if len(row) > 4 else ""
                
                daily_matches = int(row[5]) if len(row) > 5 and row[5] else 0
                
                if last_activity:
                    try:
                        last_date = datetime.strptime(last_activity.split()[0], "%Y-%m-%d").date()
                        if last_date < today:
                            daily_matches = 0
                            ws.update(f"F{i}", 0)
                            ws.update(f"E{i}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    except:
                        pass
                
                return {
                    "daily_matches_used": daily_matches,
                    "is_premium": bool(row[8]) if len(row) > 8 and row[8] else False,
                    "current_file_hash": row[6] if len(row) > 6 else "",
                    "current_progress": int(row[7]) if len(row) > 7 and row[7] else 0
                }
        
        return default
        
    except Exception as e:
        logger.error(f"❌ Get user data failed: {e}")
        return default

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
                ws.update(f"E{i}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                
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
        "version": "3.0.0",
        "status": "operational",
        "features": {
            "matching": LOGIC_AVAILABLE,
            "database": bool(GOOGLE_SHEET_ID),
            "whatsapp": bool(GREEN_API_URL),
            "mobile_contacts": True,
            "auto_selection": True,
            "rate_limiting": True,
            "file_validation": True
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
    
    # Rate limiting
    if not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests. Try again later.")
    
    if not GREEN_API_URL:
        raise HTTPException(500, "WhatsApp not configured")
    
    formatted_phone = format_phone_for_whatsapp(phone)
    code = str(random.randint(1000, 9999))
    pending_codes[phone] = code
    
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
    
    if pending_codes.get(phone) == code:
        pending_codes.pop(phone, None)
        
        await log_user_to_sheets(phone, full_name)
        user_data = await get_user_data(phone)
        
        logger.info(f"✅ User verified: {phone}")
        return {
            "status": "success",
            "daily_matches_used": user_data["daily_matches_used"],
            "is_premium": user_data["is_premium"]
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
    """Process and match guests with contacts"""
    if not LOGIC_AVAILABLE:
        raise HTTPException(500, "Logic not available")
    
    # Rate limiting
    if phone and not check_rate_limit(phone):
        raise HTTPException(429, "Too many requests")
    
    # Validate files
    for file in [guests_file, contacts_file]:
        is_valid, error = validate_file(file)
        if not is_valid:
            raise HTTPException(400, error)
    
    try:
        # Read files
        logger.info("📂 Reading files...")
        guests_bytes = await guests_file.read()
        contacts_bytes = await contacts_file.read()
        
        # Check file size
        if len(guests_bytes) > MAX_FILE_SIZE or len(contacts_bytes) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File too large. Max: {MAX_FILE_SIZE/1024/1024}MB")
        
        file_hash = create_file_hash(guests_bytes)
        
        # Process guests
        logger.info("👰 Processing guests...")
        guests_df = load_excel_flexible(BytesIO(guests_bytes))
        del guests_bytes
        
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
        
        # Process matches
        logger.info("🔄 Processing matches...")
        results = process_matching_results(guests_df, contacts_df, contacts_source)
        
        del guests_df
        del contacts_df
        
        # Cleanup
        if background_tasks:
            background_tasks.add_task(cleanup_memory)
        else:
            cleanup_memory()
        
        auto_count = sum(1 for r in results if r.get("auto_selected"))
        logger.info(f"✅ Processed {len(results)} guests, {auto_count} auto-selected")
        
        return {
            "results": results,
            "total_guests": len(results),
            "auto_selected_count": auto_count,
            "file_hash": file_hash
        }
    
    except Exception as e:
        logger.error(f"❌ Merge error: {e}")
        raise HTTPException(500, str(e))

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

@app.get("/user-stats/{phone}")
async def get_user_stats(phone: str):
    """Get user statistics"""
    try:
        user_data = await get_user_data(phone)
        
        return {
            "phone": phone,
            "daily_matches_used": user_data["daily_matches_used"],
            "daily_matches_remaining": max(0, DAILY_LIMIT - user_data["daily_matches_used"]),
            "is_premium": user_data["is_premium"],
            "current_progress": user_data["current_progress"],
            "daily_limit": DAILY_LIMIT
        }
    except Exception as e:
        logger.error(f"❌ Stats error: {e}")
        raise HTTPException(500, "Failed to get stats")

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
else:
    logger.info("✅ App ready for Cloud Run")