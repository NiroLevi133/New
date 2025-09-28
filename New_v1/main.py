print("🚀 Starting application...")

try:
    print("📦 Importing FastAPI...")
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request
    print("✅ FastAPI imported successfully")
    
    print("📦 Importing other libraries...")
    from io import BytesIO
    import pandas as pd
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    import random, time
    import requests
    import os
    import uvicorn
    import re
    import datetime
    import hashlib
    print("✅ All basic libraries imported successfully")
    
    # בדיקה אם קובץ logic קיים
    try:
        print("📦 Trying to import logic...")
        from logic import load_excel_flexible, compute_best_scores, top_matches, NAME_COL, PHONE_COL, create_contacts_template, to_buf
        print("✅ Logic module imported successfully")
        LOGIC_AVAILABLE = True
    except ImportError as e:
        print(f"⚠️ Logic module not found: {e}")
        print("⚠️ Will continue without logic module")
        LOGIC_AVAILABLE = False
    
    print("🏗️ Creating FastAPI app...")
    app = FastAPI()
    print("✅ FastAPI app created")
    
    print("🔧 Adding CORS middleware...")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    print("✅ CORS middleware added")
    
    # פרטי Green API
    GREEN_API_ID = "7105248361"
    GREEN_API_TOKEN = "8b416b11358045f3bad816ffaf433454989a08cfb4d448ebae"
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"
    
    # אחסון זמני בקודים
    pending_codes = {}
    
    print("📋 Defining routes...")

    def format_phone_for_whatsapp(phone: str) -> str:
        """המרה לפורמט WhatsApp: 050X -> 972-50X"""
        digits = re.sub(r'\D', '', phone)  # רק ספרות
        if digits.startswith('0'):
            digits = '972' + digits[1:]  # 050 -> 97250
        return digits

    def calculate_daily_limit_reset():
        """מחשב מתי המגבלה היומית תתאפס"""
        now = datetime.datetime.now()
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)
        return tomorrow

    def create_file_hash(file_content: bytes) -> str:
        """יוצר hash עבור קובץ"""
        return hashlib.md5(file_content).hexdigest()

    async def log_user_to_sheets(phone: str, full_name: str = ""):
    """שמירת משתמש חדש ב-Google Sheets עם debugging מתקדם"""
    try:
        print(f"🔄 Starting log_user_to_sheets for {phone}")
        
        if not LOGIC_AVAILABLE:
            print("❌ Logic not available, skipping Google Sheets logging")
            return
            
        # בדיקת משתני סביבה
        sheet_id = os.environ.get('GOOGLE_SHEET_ID')
        sheet_name = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
        
        print(f"📋 Environment variables:")
        print(f"   GOOGLE_SHEET_ID: {sheet_id}")
        print(f"   GOOGLE_SHEET_NAME: {sheet_name}")
        
        if not sheet_id:
            print("❌ GOOGLE_SHEET_ID not found in environment variables")
            return
        
        # בדיקת הרשאות והתחברות
        print("🔑 Checking Google authentication...")
        
        import google.auth
        import gspread
        from google.auth.exceptions import DefaultCredentialsError
        
        try:
            # נסה קודם עם הרשאות קריאה בלבד
            READ_SCOPES = [
                "https://www.googleapis.com/auth/spreadsheets.readonly",
                "https://www.googleapis.com/auth/drive.readonly",
            ]
            
            creds, project_id = google.auth.default(scopes=READ_SCOPES)
            print(f"✅ Authentication successful!")
            print(f"   Project ID: {project_id}")
            print(f"   Service Account: {getattr(creds, 'service_account_email', 'Unknown')}")
            
        except DefaultCredentialsError as e:
            print(f"❌ Authentication failed: {e}")
            print("💡 Make sure you're running on Google Cloud with proper service account")
            return
        except Exception as e:
            print(f"❌ Unexpected auth error: {e}")
            return
        
        # נסה להתחבר ל-gspread
        try:
            gc = gspread.authorize(creds)
            print("✅ gspread authorization successful")
        except Exception as e:
            print(f"❌ gspread authorization failed: {e}")
            return
        
        # נסה לפתוח את הגיליון
        try:
            print(f"📖 Trying to open spreadsheet: {sheet_id}")
            sh = gc.open_by_key(sheet_id)
            print(f"✅ Spreadsheet opened: {sh.title}")
        except gspread.SpreadsheetNotFound:
            print(f"❌ Spreadsheet not found: {sheet_id}")
            print("💡 Make sure the spreadsheet exists and the service account has access")
            return
        except Exception as e:
            print(f"❌ Error opening spreadsheet: {e}")
            return
        
        # נסה לפתוח את הלשונית
        try:
            print(f"📄 Trying to open worksheet: {sheet_name}")
            ws = sh.worksheet(sheet_name)
            print(f"✅ Worksheet opened: {ws.title}")
        except gspread.WorksheetNotFound:
            print(f"❌ Worksheet '{sheet_name}' not found")
            print("📝 Available worksheets:")
            for worksheet in sh.worksheets():
                print(f"   - {worksheet.title}")
            print("💡 Creating new worksheet...")
            
            try:
                ws = sh.add_worksheet(title=sheet_name, rows="1000", cols="10")
                # הוסף כותרות
                headers = ['id', 'full_name', 'phone', 'join_date', 'last_activity', 
                          'daily_matches_used', 'current_file_hash', 'current_progress', 'is_premium']
                ws.update('A1:I1', [headers])
                print(f"✅ Created new worksheet: {sheet_name}")
            except Exception as e:
                print(f"❌ Error creating worksheet: {e}")
                return
        except Exception as e:
            print(f"❌ Error accessing worksheet: {e}")
            return
        
        # כאן אנחנו נתקלים בבעיה - אין הרשאות כתיבה
        print("⚠️  Current credentials are READ-ONLY. Need WRITE permissions for actual operations.")
        print("🔄 Trying with write permissions...")
        
        # נסה עם הרשאות כתיבה
        try:
            WRITE_SCOPES = [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive"
            ]
            
            creds_write, _ = google.auth.default(scopes=WRITE_SCOPES)
            gc_write = gspread.authorize(creds_write)
            sh_write = gc_write.open_by_key(sheet_id)
            ws_write = sh_write.worksheet(sheet_name)
            
            print("✅ Write permissions granted!")
            
        except Exception as e:
            print(f"❌ Write permissions denied: {e}")
            print("💡 Please ensure the service account has Editor permissions on the spreadsheet")
            print(f"   Service Account: {getattr(creds, 'service_account_email', 'Unknown')}")
            print(f"   Spreadsheet: https://docs.google.com/spreadsheets/d/{sheet_id}")
            return
        
        # כעת נסה לכתוב
        try:
            print("💾 Attempting to write data...")
            
            # בדוק אם המשתמש כבר קיים
            phone_values = ws_write.col_values(3) if ws_write.row_count > 1 else []
            existing_row = None
            
            for i, existing_phone in enumerate(phone_values[1:], 2):
                if existing_phone == phone:
                    existing_row = i
                    break
            
            current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            if existing_row:
                print(f"👤 User {phone} exists at row {existing_row}, updating...")
                ws_write.update(f"E{existing_row}", current_time)
                if full_name and full_name.strip():
                    ws_write.update(f"B{existing_row}", full_name)
                print("✅ User updated successfully")
            else:
                print(f"👤 Adding new user: {phone}")
                all_values = ws_write.get_all_values()
                next_row = len(all_values) + 1
                next_id = next_row - 1
                
                new_user_data = [
                    next_id, full_name or phone, phone, current_time, current_time,
                    0, "", 0, False
                ]
                
                ws_write.update(f"A{next_row}:I{next_row}", [new_user_data])
                print(f"✅ User {phone} added successfully with ID {next_id}")
            
        except Exception as e:
            print(f"❌ Error writing to spreadsheet: {e}")
            print(f"   Error type: {type(e).__name__}")
            print(f"   Error details: {str(e)}")
            return
            
    except Exception as e:
        print(f"💥 Unexpected error in log_user_to_sheets: {e}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")


# הוסף endpoint לבדיקת חיבור
@app.get("/test-google-sheets")
async def test_google_sheets():
    """בדיקת חיבור ל-Google Sheets"""
    try:
        sheet_id = os.environ.get('GOOGLE_SHEET_ID')
        sheet_name = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
        
        if not sheet_id:
            return {"error": "GOOGLE_SHEET_ID not set"}
        
        import google.auth
        import gspread
        
        # בדיקת אימות
        creds, project_id = google.auth.default()
        service_account = getattr(creds, 'service_account_email', 'Unknown')
        
        # בדיקת גישה לגיליון
        gc = gspread.authorize(creds)
        sh = gc.open_by_key(sheet_id)
        ws = sh.worksheet(sheet_name)
        
        return {
            "status": "success",
            "project_id": project_id,
            "service_account": service_account,
            "spreadsheet_title": sh.title,
            "worksheet_title": ws.title,
            "row_count": ws.row_count,
            "col_count": ws.col_count,
            "spreadsheet_url": f"https://docs.google.com/spreadsheets/d/{sheet_id}"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "error_type": type(e).__name__
        }

    async def get_user_data(phone: str) -> dict:
        """קבלת נתוני משתמש מ-Google Sheets"""
        try:
            if not LOGIC_AVAILABLE:
                return {"daily_matches_used": 0, "is_premium": False, "current_file_hash": "", "current_progress": 0}
                
            sheet_id = os.environ.get('GOOGLE_SHEET_ID')
            sheet_name = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
            
            if not sheet_id:
                return {"daily_matches_used": 0, "is_premium": False, "current_file_hash": "", "current_progress": 0}
            
            import google.auth
            import gspread
            
            creds, _ = google.auth.default()
            gc = gspread.authorize(creds)
            sh = gc.open_by_key(sheet_id)
            ws = sh.worksheet(sheet_name)
            
            # חפש את המשתמש
            phone_values = ws.col_values(3)
            for i, existing_phone in enumerate(phone_values[1:], 2):
                if existing_phone == phone:
                    row_data = ws.row_values(i)
                    
                    # בדוק אם צריך לאפס מונה יומי
                    today = datetime.datetime.now().date()
                    last_activity = row_data[4] if len(row_data) > 4 else ""
                    
                    daily_matches_used = int(row_data[5]) if len(row_data) > 5 and row_data[5] else 0
                    
                    if last_activity:
                        try:
                            last_date = datetime.datetime.strptime(last_activity.split()[0], "%Y-%m-%d").date()
                            if last_date < today:
                                # יום חדש - אפס מונה
                                daily_matches_used = 0
                                ws.update(f"F{i}", 0)
                                ws.update(f"E{i}", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                        except:
                            pass
                    
                    return {
                        "daily_matches_used": daily_matches_used,
                        "is_premium": bool(row_data[8]) if len(row_data) > 8 and row_data[8] else False,
                        "current_file_hash": row_data[6] if len(row_data) > 6 else "",
                        "current_progress": int(row_data[7]) if len(row_data) > 7 and row_data[7] else 0
                    }
            
            return {"daily_matches_used": 0, "is_premium": False, "current_file_hash": "", "current_progress": 0}
            
        except Exception as e:
            print(f"❌ Error getting user data: {e}")
            return {"daily_matches_used": 0, "is_premium": False, "current_file_hash": "", "current_progress": 0}

    async def update_user_progress(phone: str, matches_used: int = None, file_hash: str = None, progress: int = None):
        """עדכון התקדמות משתמש"""
        try:
            if not LOGIC_AVAILABLE:
                return
                
            sheet_id = os.environ.get('GOOGLE_SHEET_ID')
            sheet_name = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
            
            if not sheet_id:
                return
            
            import google.auth
            import gspread
            
            creds, _ = google.auth.default()
            gc = gspread.authorize(creds)
            sh = gc.open_by_key(sheet_id)
            ws = sh.worksheet(sheet_name)
            
            # חפש את המשתמש
            phone_values = ws.col_values(3)
            for i, existing_phone in enumerate(phone_values[1:], 2):
                if existing_phone == phone:
                    # עדכן last_activity
                    ws.update(f"E{i}", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    
                    if matches_used is not None:
                        ws.update(f"F{i}", matches_used)
                    if file_hash is not None:
                        ws.update(f"G{i}", file_hash)
                    if progress is not None:
                        ws.update(f"H{i}", progress)
                    break
                    
        except Exception as e:
            print(f"❌ Error updating user progress: {e}")
    
    @app.get("/")
    async def root():
        print("🏠 Root endpoint called")
        return {"status": "healthy", "message": "Guest Matcher API is running", "logic_available": LOGIC_AVAILABLE}
    
    @app.get("/health")
    async def health():
        print("❤️ Health check called")
        return {"status": "ok", "logic_available": LOGIC_AVAILABLE}
    
    @app.post("/webhook")
    async def webhook_listener(request: Request):
        print("📩 Webhook received")
        try:
            data = await request.json()
            print(f"📩 Webhook data: {data}")
            return {"status": "ok"}
        except Exception as e:
            print(f"❌ Webhook error: {e}")
            return {"status": "error", "message": str(e)}
    
    @app.post("/send-code")
    async def send_code(data: dict):
        phone = data.get("phone")
        full_name = data.get("full_name", "")
        
        if not phone:
            raise HTTPException(status_code=400, detail="Phone number is required")
        
        # המרה לפורמט נכון
        formatted_phone = format_phone_for_whatsapp(phone)
        
        code = str(random.randint(1000, 9999))
        pending_codes[phone] = code  # שמור במקור
        
        payload = {
            "chatId": f"{formatted_phone}@c.us",  # השתמש בפורמט
            "message": f"🔐 קוד האימות שלך הוא: {code}"
        }

        try:
            print("📤 Sending WhatsApp message...")
            res = requests.post(GREEN_API_URL, json=payload, timeout=10)
            print(f"✅ WhatsApp response: {res.status_code}")
            return {"status": "success", "code": code, "response": res.json()}
        except Exception as e:
            print(f"⚠️ WhatsApp error: {e}")
            return {"status": "success", "code": code, "message": "Code generated (WhatsApp sending failed)"}
    
    @app.post("/verify-code")
    async def verify_code(data: dict):
        print(f"🔐 Verify code called for: {data.get('phone', 'unknown')}")
        phone = data.get("phone")
        code = data.get("code")
        full_name = data.get("full_name", "")
        
        if not phone or not code:
            print("❌ Phone or code missing")
            raise HTTPException(status_code=400, detail="Phone and code are required")
        
        if pending_codes.get(phone) == code:
            pending_codes.pop(phone, None)
            print("✅ Code verified successfully")
            
            # שמירה ב-Google Sheets עם שם מלא
            await log_user_to_sheets(phone, full_name)
            
            # קבל נתוני משתמש
            user_data = await get_user_data(phone)
            
            return {
                "status": "success",
                "daily_matches_used": user_data["daily_matches_used"],
                "is_premium": user_data["is_premium"],
                "current_file_hash": user_data["current_file_hash"],
                "current_progress": user_data["current_progress"]
            }
        
        print("❌ Code verification failed")
        return {"status": "failed"}
    
    @app.post("/log-user")
    async def log_user(user_data: dict):
        print(f"📝 Logging user: {user_data}")
        return {"status": "success"}
    
    @app.post("/upgrade-user") 
    async def upgrade_user(user_data: dict):
        print(f"⬆️ Upgrading user: {user_data}")
        return {"status": "success"}
    
    @app.get("/check-payment-status/{phone}")
    async def check_payment_status(phone: str):
        print(f"💳 Checking payment for: {phone}")
        user_data = await get_user_data(phone)
        return {"is_premium": user_data["is_premium"]}
    
    @app.post("/update-match-count")
    async def update_match_count(match_data: dict):
        phone = match_data.get("phone")
        matches_used = match_data.get("matches_used")
        progress = match_data.get("progress")
        
        if phone:
            await update_user_progress(phone, matches_used=matches_used, progress=progress)
        
        print(f"📊 Updated match count for {phone}: {matches_used} matches used, progress: {progress}")
        return {"status": "success"}
    
    @app.post("/merge-files")
    async def merge_files(
        guests_file: UploadFile = File(...), 
        contacts_file: UploadFile = File(...),
        phone: str = None
    ):
        print("🔀 Merge files endpoint called")
        
        if not LOGIC_AVAILABLE:
            print("❌ Logic module not available")
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        try:
            print("📖 Reading uploaded files...")
            guests_bytes = await guests_file.read()
            contacts_bytes = await contacts_file.read()
            print(f"✅ Files read - Guests: {len(guests_bytes)} bytes, Contacts: {len(contacts_bytes)} bytes")

            # יצירת hash עבור קובץ המוזמנים
            file_hash = create_file_hash(guests_bytes)
            
            # קבל נתוני משתמש אם סופק טלפון
            user_data = {"current_file_hash": "", "current_progress": 0}
            if phone:
                user_data = await get_user_data(phone)
            
            print("🔄 Processing files with improved logic...")
            
            # שימוש בפונקציה החדשה הגמישה
            guests_df = load_excel_flexible(BytesIO(guests_bytes))
            contacts_df = load_excel_flexible(BytesIO(contacts_bytes))
            
            print(f"✅ DataFrames created - Guests: {len(guests_df)}, Contacts: {len(contacts_df)}")

            # בדוק אם זה אותו קובץ והמשתמש הפסיק באמצע
            start_index = 0
            if phone and file_hash == user_data["current_file_hash"]:
                start_index = user_data["current_progress"]
                print(f"📍 Continuing from guest {start_index + 1}")

            # מציאת ההתאמות
            results = []
            for idx, (_, guest) in enumerate(guests_df.iterrows()):
                guest_name = guest[NAME_COL]
                guest_norm = guest["norm_name"]
                
                # הוסף את כל הפרטים המקוריים של המוזמן
                guest_details = {}
                for col in guests_df.columns:
                    if col not in ["norm_name"]:  # לא כולל עמודות פנימיות
                        guest_details[col] = guest[col] if pd.notna(guest[col]) else ""
                
                # מציאת מועמדים
                candidates = top_matches(guest_norm, contacts_df)
                
                # חישוב ציון הטוב ביותר
                best_score = candidates["score"].max() if len(candidates) > 0 else 0
                
                results.append({
                    "index": idx,
                    "guest": guest_name,
                    "guest_details": guest_details,  # כל הפרטים המקוריים
                    "best_score": int(best_score),
                    "candidates": [
                        {
                            "name": row[NAME_COL],
                            "phone": row[PHONE_COL],
                            "score": int(row["score"]),
                            "reason": row.get("reason", "")
                        }
                        for _, row in candidates.iterrows()
                    ]
                })
            
            # עדכן hash ואפס progress אם זה קובץ חדש
            if phone:
                if file_hash != user_data["current_file_hash"]:
                    await update_user_progress(phone, file_hash=file_hash, progress=0)
                    start_index = 0
            
            print(f"✅ Processing complete - {len(results)} results, starting from index {start_index}")
            return {
                "results": results,
                "start_index": start_index,
                "file_hash": file_hash
            }
        
        except Exception as e:
            print(f"❌ Error in merge_files: {e}")
            import traceback
            print(f"📍 Full traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"שגיאה בעיבוד הקבצים: {str(e)}")

    @app.post("/export-results")
    async def export_results(data: dict):
        """ייצוא תוצאות לקובץ Excel"""
        try:
            if not LOGIC_AVAILABLE:
                raise HTTPException(status_code=500, detail="Logic module not available")
            
            results = data.get("results", [])
            selected_contacts = data.get("selected_contacts", {})
            
            if not results:
                raise HTTPException(status_code=400, detail="No results provided")
            
            # יצירת DataFrame לייצוא
            export_data = []
            
            for result in results:
                guest_name = result["guest"]
                guest_details = result["guest_details"]
                
                # התחל עם הפרטים המקוריים
                row_data = guest_details.copy()
                
                # הוסף את הטלפון שנבחר
                selected_contact = selected_contacts.get(guest_name)
                if selected_contact and not selected_contact.get("isNotFound"):
                    row_data["טלפון נבחר"] = selected_contact.get("phone", "")
                    row_data["שם איש קשר"] = selected_contact.get("name", "")
                    row_data["ציון התאמה"] = selected_contact.get("score", "")
                else:
                    row_data["טלפון נבחר"] = ""
                    row_data["שם איש קשר"] = "לא נמצא"
                    row_data["ציון התאמה"] = ""
                
                export_data.append(row_data)
            
            # יצירת DataFrame
            export_df = pd.DataFrame(export_data)
            
            # יצירת buffer
            excel_buffer = to_buf(export_df)
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=guests_with_contacts.xlsx"}
            )
            
        except Exception as e:
            print(f"❌ Error in export_results: {e}")
            raise HTTPException(status_code=500, detail=f"שגיאה בייצוא הקובץ: {str(e)}")

    @app.get("/download-contacts-template")
    async def download_contacts_template():
        """הורדת קובץ דוגמה לאנשי קשר"""
        try:
            if not LOGIC_AVAILABLE:
                raise HTTPException(status_code=500, detail="Logic module not available")
                
            template_df = create_contacts_template()
            
            # יצירת buffer
            excel_buffer = to_buf(template_df)
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=contacts_template.xlsx"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"שגיאה ביצירת הקובץ: {str(e)}")

    @app.get("/download-guests-template")
    async def download_guests_template():
        """הורדת קובץ דוגמה למוזמנים"""
        try:
            # יצירת דוגמה למוזמנים
            template_data = {
                'שם מלא': [
                    'ישראל כהן',
                    'שרה לוי', 
                    'דוד אברהם',
                    'רחל גולד'
                ],
                'כמות מוזמנים': [2, 1, 3, 2],
                'צד': ['חתן', 'כלה', 'חתן', 'כלה'],
                'קבוצה': ['משפחה', 'חברות', 'עבודה', 'משפחה']
            }
            
            template_df = pd.DataFrame(template_data)
            
            # יצירת buffer
            excel_buffer = to_buf(template_df)
            
            return StreamingResponse(
                BytesIO(excel_buffer.getvalue()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": "attachment; filename=guests_template.xlsx"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"שגיאה ביצירת קובץ דוגמה: {str(e)}")
    
    print("✅ All routes defined successfully")
    
    if __name__ == "__main__":
        port = int(os.environ.get("PORT", 8080))
        print(f"🚀 Starting server on port {port}")
        uvicorn.run(app, host="0.0.0.0", port=port)

except Exception as e:
    print(f"💥 CRITICAL ERROR during startup: {e}")
    import traceback
    print(f"📍 Full traceback: {traceback.format_exc()}")
    exit(1)