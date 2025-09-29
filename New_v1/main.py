#!/usr/bin/env python3
import logging

# הגדרת logging בתחילת הכל
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logger.info("🚀 Starting application...")

try:
    logger.info("📦 Importing libraries...")
    
    # import בסיסי ראשון
    import os
    import sys
    import json
    import re
    
    # בדיקת משתני סביבה קריטיים
    PORT = os.environ.get('PORT', '8080')
    logger.info(f"Port configured: {PORT}")
    
    # import רגיל
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    import uvicorn
    import datetime
    import hashlib
    import random
    import time
    import requests
    
    logger.info("✅ Basic libraries imported")
    
    # import מותנה
    try:
        import pandas as pd
        logger.info("✅ Pandas imported")
    except ImportError as e:
        logger.error(f"❌ Pandas import failed: {e}")
        sys.exit(1)
    
    try:
        from google.oauth2 import service_account
        logger.info("✅ Google auth imported")
    except ImportError as e:
        logger.error(f"❌ Google auth import failed: {e}")
        sys.exit(1)
    
    # בדיקת logic module
    try:
        from logic import (
            load_excel_flexible, 
            load_mobile_contacts,
            process_matching_results,
            top_matches, 
            NAME_COL, 
            PHONE_COL, 
            create_contacts_template,
            create_guests_template,
            to_buf,
            extract_relevant_guest_details,
            compute_best_scores
        )
        LOGIC_AVAILABLE = True
        logger.info("✅ Logic module available")
    except ImportError as e:
        LOGIC_AVAILABLE = False
        logger.warning(f"⚠️ Logic module not found: {e}")
        logger.warning("⚠️ App will run in limited mode")
    
    # יצירת אפליקציה
    logger.info("🏗️ Creating FastAPI app...")
    app = FastAPI(title="Guest Matcher API", version="2.0.0")
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("✅ CORS configured")
    
    # קבועים
    DAILY_LIMIT = 30
    
    # משתני סביבה עם בדיקות
    GREEN_API_ID = os.environ.get('GREEN_API_ID')
    GREEN_API_TOKEN = os.environ.get('GREEN_API_TOKEN')
    GOOGLE_SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')
    GOOGLE_SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
    GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    
    # בדיקת משתנים
    missing_vars = []
    if not GREEN_API_ID:
        missing_vars.append('GREEN_API_ID')
    if not GREEN_API_TOKEN:
        missing_vars.append('GREEN_API_TOKEN')
    if not GOOGLE_SHEET_ID:
        missing_vars.append('GOOGLE_SHEET_ID')
    if not GOOGLE_CREDENTIALS_JSON:
        missing_vars.append('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    
    if missing_vars:
        logger.warning(f"⚠️ Missing environment variables: {', '.join(missing_vars)}")
        logger.warning("⚠️ Some features may not work properly")
    else:
        logger.info("✅ All environment variables configured")
    
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}" if GREEN_API_ID and GREEN_API_TOKEN else None
    
    # אחסון זמני
    pending_codes = {}
    
    # מטמון לחיבור Google Sheets
    _google_client = None
    
    def get_google_client():
        """קבלת client ל-Google Sheets עם caching"""
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
            logger.error(f"❌ Google Sheets connection failed: {e}")
            raise

    def format_phone_for_whatsapp(phone: str) -> str:
        """המרה לפורמט WhatsApp"""
        digits = re.sub(r'\D', '', phone)
        if digits.startswith('0'):
            digits = '972' + digits[1:]
        return digits

    def create_file_hash(file_content: bytes) -> str:
        """יוצר hash עבור קובץ"""
        return hashlib.md5(file_content).hexdigest()

    async def get_worksheet():
        """קבלת worksheet עם טיפול בשגיאות"""
        try:
            gc = get_google_client()
            sh = gc.open_by_key(GOOGLE_SHEET_ID)
            
            try:
                ws = sh.worksheet(GOOGLE_SHEET_NAME)
            except:
                # צור worksheet חדש אם לא קיים
                ws = sh.add_worksheet(title=GOOGLE_SHEET_NAME, rows="1000", cols="10")
                headers = ['id', 'full_name', 'phone', 'join_date', 'last_activity',
                          'daily_matches_used', 'current_file_hash', 'current_progress', 'is_premium']
                ws.update('A1:I1', [headers])
                logger.info(f"✅ Created new worksheet: {GOOGLE_SHEET_NAME}")
                
            return ws
        except Exception as e:
            logger.error(f"❌ Worksheet access failed: {e}")
            return None

    async def log_user_to_sheets(phone: str, full_name: str = ""):
        """שמירת משתמש ב-Google Sheets"""
        if not LOGIC_AVAILABLE or not GOOGLE_SHEET_ID:
            return
            
        try:
            ws = await get_worksheet()
            if not ws:
                return
            
            # חפש משתמש קיים
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
            
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            if existing_row:
                # עדכן משתמש קיים
                ws.update(f"E{existing_row}", current_time)
                if full_name and full_name.strip():
                    ws.update(f"B{existing_row}", full_name)
                logger.info(f"✅ Updated user: {phone}")
            else:
                # הוסף משתמש חדש
                next_row = len(all_values) + 1
                next_id = next_row - 1
                
                new_user_data = [
                    next_id, full_name or phone, phone, current_time, current_time,
                    0, "", 0, False
                ]
                
                ws.update(f"A{next_row}:I{next_row}", [new_user_data])
                logger.info(f"✅ Added new user: {phone}")
                
        except Exception as e:
            logger.error(f"❌ Failed to log user: {e}")

    async def get_user_data(phone: str) -> dict:
        """קבלת נתוני משתמש"""
        default_data = {"daily_matches_used": 0, "is_premium": False, "current_file_hash": "", "current_progress": 0}
        
        if not LOGIC_AVAILABLE or not GOOGLE_SHEET_ID:
            return default_data
            
        try:
            ws = await get_worksheet()
            if not ws:
                return default_data
            
            all_values = ws.get_all_values()
            
            for i, row in enumerate(all_values[1:], 2):
                if len(row) > 2 and row[2] == phone:
                    # בדוק אם צריך לאפס מונה יומי
                    today = datetime.datetime.now().date()
                    last_activity = row[4] if len(row) > 4 else ""
                    
                    daily_matches_used = int(row[5]) if len(row) > 5 and row[5] else 0
                    
                    if last_activity:
                        try:
                            last_date = datetime.datetime.strptime(last_activity.split()[0], "%Y-%m-%d").date()
                            if last_date < today:
                                daily_matches_used = 0
                                ws.update(f"F{i}", 0)
                                ws.update(f"E{i}", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                        except:
                            pass
                    
                    return {
                        "daily_matches_used": daily_matches_used,
                        "is_premium": bool(row[8]) if len(row) > 8 and row[8] else False,
                        "current_file_hash": row[6] if len(row) > 6 else "",
                        "current_progress": int(row[7]) if len(row) > 7 and row[7] else 0
                    }
            
            return default_data
            
        except Exception as e:
            logger.error(f"❌ Error getting user data: {e}")
            return default_data

    async def update_user_progress(phone: str, matches_used: int = None, file_hash: str = None, progress: int = None):
        """עדכון התקדמות משתמש"""
        if not LOGIC_AVAILABLE or not GOOGLE_SHEET_ID:
            return
            
        try:
            ws = await get_worksheet()
            if not ws:
                return
            
            all_values = ws.get_all_values()
            
            for i, row in enumerate(all_values[1:], 2):
                if len(row) > 2 and row[2] == phone:
                    ws.update(f"E{i}", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    
                    if matches_used is not None:
                        ws.update(f"F{i}", matches_used)
                    if file_hash is not None:
                        ws.update(f"G{i}", file_hash)
                    if progress is not None:
                        ws.update(f"H{i}", progress)
                    break
                    
        except Exception as e:
            logger.error(f"❌ Error updating progress: {e}")

    # פונקציה נוספת לטיפול במצבי קיצון
    async def handle_daily_limit_exceeded(phone: str):
        """טיפול במקרה של חריגה ממגבלה יומית"""
        try:
            user_data = await get_user_data(phone)
            if user_data["is_premium"]:
                return {"allowed": True, "reason": "Premium user"}
            
            if user_data["daily_matches_used"] >= DAILY_LIMIT:
                return {
                    "allowed": False, 
                    "reason": f"Daily limit exceeded ({user_data['daily_matches_used']}/{DAILY_LIMIT})",
                    "matches_used": user_data["daily_matches_used"]
                }
            
            return {"allowed": True, "remaining": DAILY_LIMIT - user_data["daily_matches_used"]}
            
        except Exception as e:
            logger.error(f"Error checking daily limit: {e}")
            return {"allowed": True, "reason": "Error checking limit, allowing by default"}

    # Routes
    @app.get("/")
    async def root():
        return {
            "status": "healthy", 
            "message": "Guest Matcher API v2.0 is running", 
            "logic_available": LOGIC_AVAILABLE,
            "google_sheets_configured": bool(GOOGLE_SHEET_ID and GOOGLE_CREDENTIALS_JSON),
            "whatsapp_configured": bool(GREEN_API_ID and GREEN_API_TOKEN),
            "features": [
                "Mobile contacts support",
                "Enhanced guest details filtering", 
                "Improved matching algorithm",
                "Progressive export capability",
                "Daily usage tracking",
                "Premium user support"
            ]
        }
    
    @app.get("/health")
    async def health():
        return {
            "status": "ok", 
            "logic_available": LOGIC_AVAILABLE,
            "database_connected": bool(GOOGLE_SHEET_ID and GOOGLE_CREDENTIALS_JSON),
            "whatsapp_connected": bool(GREEN_API_ID and GREEN_API_TOKEN),
            "timestamp": datetime.datetime.now().isoformat()
        }
    
    @app.post("/webhook")
    async def webhook_listener(request: Request):
        try:
            data = await request.json()
            logger.info(f"Webhook received: {data}")
            return {"status": "ok", "received": True}
        except Exception as e:
            logger.error(f"Webhook error: {e}")
            return {"status": "error", "message": str(e)}
    
    @app.post("/send-code")
    async def send_code(data: dict):
        phone = data.get("phone")
        full_name = data.get("full_name", "")
        
        if not phone:
            raise HTTPException(status_code=400, detail="Phone number is required")
        
        if not GREEN_API_URL:
            raise HTTPException(status_code=500, detail="WhatsApp API not configured")
        
        formatted_phone = format_phone_for_whatsapp(phone)
        code = str(random.randint(1000, 9999))
        pending_codes[phone] = code
        
        payload = {
            "chatId": f"{formatted_phone}@c.us",
            "message": f"🔐 קוד האימות שלך הוא: {code}"
        }

        try:
            res = requests.post(GREEN_API_URL, json=payload, timeout=10)
            logger.info(f"WhatsApp message sent to {formatted_phone}")
            return {"status": "success", "code": code, "response": res.json()}
        except Exception as e:
            logger.warning(f"WhatsApp API error: {e}")
            return {"status": "success", "code": code, "message": "Code generated (WhatsApp sending failed)"}
    
    @app.post("/verify-code")
    async def verify_code(data: dict):
        phone = data.get("phone")
        code = data.get("code")
        full_name = data.get("full_name", "")
        
        if not phone or not code:
            raise HTTPException(status_code=400, detail="Phone and code are required")
        
        if pending_codes.get(phone) == code:
            pending_codes.pop(phone, None)
            
            await log_user_to_sheets(phone, full_name)
            user_data = await get_user_data(phone)
            
            logger.info(f"User verified successfully: {phone}")
            return {
                "status": "success",
                "daily_matches_used": user_data["daily_matches_used"],
                "is_premium": user_data["is_premium"],
                "current_file_hash": user_data["current_file_hash"],
                "current_progress": user_data["current_progress"]
            }
        
        logger.warning(f"Invalid code attempt for phone: {phone}")
        return {"status": "failed", "message": "Invalid verification code"}
    
    @app.post("/log-user")
    async def log_user(user_data: dict):
        phone = user_data.get("phone", "")
        full_name = user_data.get("full_name", "")
        
        if phone:
            await log_user_to_sheets(phone, full_name)
            logger.info(f"User logged: {phone}")
        
        return {"status": "success"}
    
    @app.post("/upgrade-user") 
    async def upgrade_user(user_data: dict):
        phone = user_data.get("phone")
        
        if not phone:
            raise HTTPException(status_code=400, detail="Phone number is required")
        
        try:
            ws = await get_worksheet()
            if not ws:
                raise HTTPException(status_code=500, detail="Database connection failed")
            
            all_values = ws.get_all_values()
            
            for i, row in enumerate(all_values[1:], 2):
                if len(row) > 2 and row[2] == phone:
                    ws.update(f"I{i}", True)  # Set is_premium to True
                    logger.info(f"User upgraded to premium: {phone}")
                    return {"status": "success", "message": "User upgraded to premium"}
            
            return {"status": "error", "message": "User not found"}
            
        except Exception as e:
            logger.error(f"Error upgrading user: {e}")
            raise HTTPException(status_code=500, detail="Failed to upgrade user")
    
    @app.get("/check-payment-status/{phone}")
    async def check_payment_status(phone: str):
        user_data = await get_user_data(phone)
        return {
            "is_premium": user_data["is_premium"],
            "daily_matches_used": user_data["daily_matches_used"],
            "phone": phone
        }
    
    @app.post("/update-match-count")
    async def update_match_count(match_data: dict):
        phone = match_data.get("phone")
        matches_used = match_data.get("matches_used")
        progress = match_data.get("progress")
        
        if phone:
            await update_user_progress(phone, matches_used=matches_used, progress=progress)
            logger.info(f"Updated match count for {phone}: {matches_used} matches, progress: {progress}")
        
        return {"status": "success"}
    
    @app.get("/check-mobile-support")
    async def check_mobile_support(request: Request):
        """בדיקת תמיכה במכשיר מובייל ובגישה לאנשי קשר"""
        user_agent = request.headers.get("user-agent", "").lower()
        
        is_mobile = any(device in user_agent for device in 
                       ["android", "iphone", "ipad", "mobile", "webos", "blackberry"])
        
        # בדיקה אם הדפדפן תומך ב-Contacts API
        is_chrome = "chrome" in user_agent and "edg" not in user_agent
        supports_contacts_api = is_chrome and is_mobile
        
        logger.info(f"Mobile support check - Mobile: {is_mobile}, Contacts API: {supports_contacts_api}")
        
        return {
            "is_mobile": is_mobile,
            "supports_contacts_api": supports_contacts_api,
            "user_agent": user_agent,
            "recommended_action": "Use mobile contacts API" if supports_contacts_api else "Upload file instead"
        }
    
    @app.post("/merge-files")
    async def merge_files(
        guests_file: UploadFile = File(...), 
        contacts_file: UploadFile = File(...),
        phone: str = None,
        contacts_source: str = "file"
    ):
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        # בדיקת מגבלה יומית
        if phone:
            limit_check = await handle_daily_limit_exceeded(phone)
            if not limit_check["allowed"]:
                raise HTTPException(
                    status_code=429, 
                    detail=f"Daily limit exceeded: {limit_check['reason']}"
                )
        
        try:
            guests_bytes = await guests_file.read()
            contacts_bytes = await contacts_file.read()

            file_hash = create_file_hash(guests_bytes)
            
            user_data = {"current_file_hash": "", "current_progress": 0}
            if phone:
                user_data = await get_user_data(phone)
            
            # עיבוד קובץ מוזמנים
            logger.info("Processing guests file...")
            guests_df = load_excel_flexible(BytesIO(guests_bytes))
            
            # עיבוד אנשי קשר לפי המקור
            logger.info(f"Processing contacts from source: {contacts_source}")
            if contacts_source == "mobile":
                try:
                    contacts_data = json.loads(contacts_bytes.decode('utf-8'))
                    contacts_df = load_mobile_contacts(contacts_data)
                    logger.info(f"Loaded {len(contacts_df)} mobile contacts")
                except Exception as e:
                    logger.error(f"Error processing mobile contacts: {e}")
                    raise HTTPException(status_code=400, detail=f"שגיאה בעיבוד אנשי קשר מהמובייל: {str(e)}")
            else:
                contacts_df = load_excel_flexible(BytesIO(contacts_bytes))
                logger.info(f"Loaded {len(contacts_df)} contacts from file")

            # בדוק המשכה מקובץ קיים
            start_index = 0
            if phone and file_hash == user_data["current_file_hash"]:
                start_index = user_data["current_progress"]
                logger.info(f"Resuming from index {start_index} for existing file")

            # עיבוד התאמות מלא
            logger.info("Processing matching results...")
            results = process_matching_results(guests_df, contacts_df, contacts_source)

            # עדכן hash אם קובץ חדש
            if phone and file_hash != user_data["current_file_hash"]:
                await update_user_progress(phone, file_hash=file_hash, progress=0)
                start_index = 0
                logger.info("New file detected, starting from beginning")
            
            logger.info(f"Successfully processed {len(results)} guests")
            return {
                "results": results,
                "start_index": start_index,
                "file_hash": file_hash,
                "contacts_source": contacts_source,
                "total_guests": len(results),
                "contacts_count": len(contacts_df)
            }
        
        except Exception as e:
            logger.error(f"Merge files error: {e}")
            raise HTTPException(status_code=500, detail=f"שגיאה בעיבוד הקבצים: {str(e)}")

    @app.post("/export-results")
    async def export_results(data: dict):
        """ייצוא תוצאות לקובץ Excel עם תמיכה בייצוא חלקי"""
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        results = data.get("results", [])
        selected_contacts = data.get("selected_contacts", {})
        export_type = data.get("export_type", "full")  # "full" or "partial"
        
        if not results:
            raise HTTPException(status_code=400, detail="No results provided")
        
        try:
            logger.info(f"Exporting {len(results)} guests with {len(selected_contacts)} selections")
            
            export_data = []
            
            for result in results:
                guest_name = result["guest"]
                guest_details = result["guest_details"]
                
                # התחל עם פרטי המוזמן - רק השדות הרלוונטיים
                row_data = {}
                
                # שם מלא תמיד ראשון
                row_data[NAME_COL] = guest_name
                
                # הוסף רק שדות רלוונטיים
                relevant_details = extract_relevant_guest_details(pd.Series(guest_details))
                row_data.update(relevant_details)
                
                # הוסף מידע על איש הקשר שנבחר
                selected_contact = selected_contacts.get(guest_name)
                if selected_contact and not selected_contact.get("isNotFound"):
                    row_data["טלפון נבחר"] = selected_contact.get("phone", "")
                    row_data["שם איש קשר"] = selected_contact.get("name", "")
                    row_data["ציון התאמה"] = selected_contact.get("score", "")
                    row_data["סטטוס"] = "נמצא"
                else:
                    row_data["טלפון נבחר"] = ""
                    row_data["שם איש קשר"] = "לא נמצא"
                    row_data["ציון התאמה"] = ""
                    row_data["סטטוס"] = "לא נמצא"
                
                export_data.append(row_data)
            
            # יצירת DataFrame וייצוא
            export_df = pd.DataFrame(export_data)
            excel_buffer = to_buf(export_df)
            
            filename = f"guests_with_contacts_{export_type}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            
            logger.info("Export completed successfully")
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
            
        except Exception as e:
            logger.error(f"Export error: {e}")
            raise HTTPException(status_code=500, detail=f"שגיאה בייצוא: {str(e)}")

    @app.get("/download-contacts-template")
    async def download_contacts_template():
        """הורדת קובץ דוגמה לאנשי קשר"""
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
            
        try:
            template_df = create_contacts_template()
            excel_buffer = to_buf(template_df)
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=contacts_template.xlsx"}
            )
        except Exception as e:
            logger.error(f"Template creation error: {e}")
            raise HTTPException(status_code=500, detail=f"שגיאה ביצירת התבנית: {str(e)}")

    @app.get("/download-guests-template")
    async def download_guests_template():
        """הורדת קובץ דוגמה למוזמנים"""
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
            
        try:
            template_df = create_guests_template()
            excel_buffer = to_buf(template_df)
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=guests_template.xlsx"}
            )
        except Exception as e:
            logger.error(f"Template creation error: {e}")
            raise HTTPException(status_code=500, detail=f"שגיאה ביצירת התבנית: {str(e)}")

    @app.get("/test-google-sheets")
    async def test_google_sheets():
        """בדיקת חיבור ל-Google Sheets"""
        try:
            if not GOOGLE_SHEET_ID or not GOOGLE_CREDENTIALS_JSON:
                return {"error": "Google Sheets not configured"}
            
            ws = await get_worksheet()
            if not ws:
                return {"error": "Failed to access worksheet"}
            
            gc = get_google_client()
            sh = gc.open_by_key(GOOGLE_SHEET_ID)
            
            return {
                "status": "success",
                "spreadsheet_title": sh.title,
                "worksheet_title": ws.title,
                "row_count": ws.row_count,
                "col_count": ws.col_count,
                "spreadsheet_url": f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}"
            }
            
        except Exception as e:
            logger.error(f"Google Sheets test error: {e}")
            return {
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__
            }

    @app.get("/api-status")
    async def api_status():
        """סטטוס מפורט של ה-API"""
        return {
            "version": "2.0.0",
            "status": "operational",
            "features": {
                "logic_module": LOGIC_AVAILABLE,
                "google_sheets": bool(GOOGLE_SHEET_ID and GOOGLE_CREDENTIALS_JSON),
                "whatsapp_integration": bool(GREEN_API_ID and GREEN_API_TOKEN),
                "mobile_contacts": True,
                "enhanced_matching": True,
                "progressive_export": True,
                "daily_usage_tracking": True,
                "premium_support": True
            },
            "daily_limit": DAILY_LIMIT,
            "supported_file_types": ["xlsx", "xls", "csv"],
            "supported_contact_sources": ["file", "mobile"],
            "endpoints": {
                "authentication": ["/send-code", "/verify-code"],
                "file_processing": ["/merge-files", "/export-results"],
                "templates": ["/download-contacts-template", "/download-guests-template"],
                "user_management": ["/log-user", "/upgrade-user", "/update-match-count"],
                "system": ["/health", "/api-status", "/test-google-sheets", "/check-mobile-support"]
            }
        }

    @app.get("/user-stats/{phone}")
    async def get_user_stats(phone: str):
        """קבלת סטטיסטיקות משתמש"""
        try:
            user_data = await get_user_data(phone)
            
            return {
                "phone": phone,
                "daily_matches_used": user_data["daily_matches_used"],
                "daily_matches_remaining": max(0, DAILY_LIMIT - user_data["daily_matches_used"]),
                "is_premium": user_data["is_premium"],
                "current_progress": user_data["current_progress"],
                "has_active_file": bool(user_data["current_file_hash"]),
                "daily_limit": DAILY_LIMIT
            }
        except Exception as e:
            logger.error(f"Error getting user stats: {e}")
            raise HTTPException(status_code=500, detail="Failed to get user statistics")

    @app.post("/reset-daily-limit/{phone}")
    async def reset_daily_limit(phone: str):
        """איפוס מונה יומי (לצורכי בדיקה או תמיכה)"""
        try:
            await update_user_progress(phone, matches_used=0)
            logger.info(f"Reset daily limit for user: {phone}")
            return {"status": "success", "message": "Daily limit reset"}
        except Exception as e:
            logger.error(f"Error resetting daily limit: {e}")
            raise HTTPException(status_code=500, detail="Failed to reset daily limit")

    @app.get("/system-stats")
    async def get_system_stats():
        """סטטיסטיקות מערכת כלליות"""
        try:
            if not GOOGLE_SHEET_ID or not GOOGLE_CREDENTIALS_JSON:
                return {"error": "Google Sheets not configured"}
            
            ws = await get_worksheet()
            if not ws:
                return {"error": "Failed to access database"}
            
            all_values = ws.get_all_values()
            total_users = len(all_values) - 1  # מינוס כותרת
            
            # חישוב משתמשים פעילים היום
            today = datetime.datetime.now().date()
            active_today = 0
            premium_users = 0
            
            for row in all_values[1:]:
                if len(row) > 4:
                    try:
                        last_activity = row[4]
                        if last_activity:
                            last_date = datetime.datetime.strptime(last_activity.split()[0], "%Y-%m-%d").date()
                            if last_date == today:
                                active_today += 1
                    except:
                        pass
                
                if len(row) > 8 and row[8]:
                    premium_users += 1
            
            return {
                "total_users": total_users,
                "active_today": active_today,
                "premium_users": premium_users,
                "daily_limit": DAILY_LIMIT,
                "system_health": "healthy",
                "database_connected": True
            }
            
        except Exception as e:
            logger.error(f"Error getting system stats: {e}")
            return {
                "error": str(e),
                "system_health": "degraded",
                "database_connected": False
            }

    @app.post("/batch-process")
    async def batch_process_guests(data: dict):
        """עיבוד אצווה של מוזמנים עם אופטימיזציה"""
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        phone = data.get("phone")
        guest_list = data.get("guests", [])
        contacts_data = data.get("contacts", [])
        
        if not guest_list or not contacts_data:
            raise HTTPException(status_code=400, detail="Missing guests or contacts data")
        
        if phone:
            limit_check = await handle_daily_limit_exceeded(phone)
            if not limit_check["allowed"]:
                raise HTTPException(
                    status_code=429, 
                    detail=f"Daily limit exceeded: {limit_check['reason']}"
                )
        
        try:
            # המרה ל-DataFrames
            guests_df = pd.DataFrame(guest_list)
            contacts_df = pd.DataFrame(contacts_data)
            
            # וידוא שיש עמודות נדרשות
            if NAME_COL not in guests_df.columns:
                guests_df[NAME_COL] = guests_df.iloc[:, 0]  # השתמש בעמודה הראשונה
            
            if NAME_COL not in contacts_df.columns:
                contacts_df[NAME_COL] = contacts_df.iloc[:, 0]
            
            if PHONE_COL not in contacts_df.columns:
                contacts_df[PHONE_COL] = contacts_df.iloc[:, 1] if len(contacts_df.columns) > 1 else ""
            
            # עיבוד התאמות
            results = process_matching_results(guests_df, contacts_df, "batch")
            
            logger.info(f"Batch processed {len(results)} guests for user {phone}")
            
            return {
                "status": "success",
                "results": results,
                "total_processed": len(results),
                "processing_time": time.time()
            }
            
        except Exception as e:
            logger.error(f"Batch processing error: {e}")
            raise HTTPException(status_code=500, detail=f"שגיאה בעיבוד אצווה: {str(e)}")

    @app.get("/download-report/{phone}")
    async def download_user_report(phone: str):
        """הורדת דוח שימוש למשתמש"""
        try:
            user_data = await get_user_data(phone)
            
            if not user_data:
                raise HTTPException(status_code=404, detail="User not found")
            
            # יצירת דוח
            report_df = pd.DataFrame([
                ["מספר טלפון", phone],
                ["סוג חשבון", "פרימיום" if user_data["is_premium"] else "חינמי"],
                ["שימוש יומי", f"{user_data['daily_matches_used']}/{DAILY_LIMIT}"],
                ["התקדמות נוכחית", user_data["current_progress"]],
                ["קובץ פעיל", "כן" if user_data["current_file_hash"] else "לא"],
                ["תאריך דוח", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")]
            ], columns=["פרמטר", "ערך"])
            
            excel_buffer = to_buf(report_df)
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename=user_report_{phone}.xlsx"}
            )
            
        except Exception as e:
            logger.error(f"Error generating user report: {e}")
            raise HTTPException(status_code=500, detail="Failed to generate user report")

    @app.post("/feedback")
    async def submit_feedback(data: dict):
        """קבלת משוב מהמשתמשים"""
        phone = data.get("phone", "")
        feedback_text = data.get("feedback", "")
        rating = data.get("rating", 0)
        
        try:
            # שמירת המשוב (ניתן להוסיף לגיליון נפרד)
            logger.info(f"Feedback received from {phone}: Rating {rating}/5 - {feedback_text}")
            
            return {
                "status": "success",
                "message": "תודה על המשוב!",
                "feedback_id": f"fb_{int(time.time())}"
            }
            
        except Exception as e:
            logger.error(f"Error saving feedback: {e}")
            return {"status": "error", "message": "Failed to save feedback"}

    logger.info("✅ All routes defined successfully")
    
    # קריאת הפעלת השרת
    if __name__ == "__main__":
        port = int(PORT)
        logger.info(f"🚀 Starting server on port {port}")
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=port,
            timeout_keep_alive=30,
            access_log=False  # מפחית לוגים מיותרים
        )
    else:
        # כשרץ בCloud Run
        logger.info("✅ FastAPI app configured for Cloud Run")

except ImportError as e:
    logger.error(f"💥 IMPORT ERROR: {e}")
    logger.error("Please check that all required packages are installed")
    sys.exit(1)
    
except Exception as e:
    logger.error(f"💥 CRITICAL ERROR during startup: {e}")
    import traceback
    logger.error(f"📍 Full traceback: {traceback.format_exc()}")
    sys.exit(1)