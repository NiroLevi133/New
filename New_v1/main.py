print("🚀 Starting application...")

try:
    print("📦 Importing libraries...")
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    import pandas as pd
    import random, time, requests, os, uvicorn, json, re, datetime, hashlib
    from google.oauth2 import service_account
    print("✅ All libraries imported successfully")
    
    # בדיקה אם קובץ logic קיים
    try:
        from logic import load_excel_flexible, top_matches, NAME_COL, PHONE_COL, create_contacts_template, to_buf
        LOGIC_AVAILABLE = True
        print("✅ Logic module available")
    except ImportError as e:
        LOGIC_AVAILABLE = False
        print(f"⚠️ Logic module not found: {e}")
    
    app = FastAPI()
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # קבועים
    DAILY_LIMIT = 30
    
    # משתני סביבה
    GREEN_API_ID = os.environ.get('GREEN_API_ID')
    GREEN_API_TOKEN = os.environ.get('GREEN_API_TOKEN')
    GOOGLE_SHEET_ID = os.environ.get('GOOGLE_SHEET_ID')
    GOOGLE_SHEET_NAME = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
    GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    
    # בדיקת משתנים חיוניים
    if not GREEN_API_ID or not GREEN_API_TOKEN:
        print("❌ GREEN API credentials missing")
    if not GOOGLE_SHEET_ID or not GOOGLE_CREDENTIALS_JSON:
        print("❌ Google Sheets configuration missing")
    
    GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"
    
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
            return _google_client
            
        except Exception as e:
            print(f"❌ Google Sheets connection failed: {e}")
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
                
            return ws
        except Exception as e:
            print(f"❌ Worksheet access failed: {e}")
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
            else:
                # הוסף משתמש חדש
                next_row = len(all_values) + 1
                next_id = next_row - 1
                
                new_user_data = [
                    next_id, full_name or phone, phone, current_time, current_time,
                    0, "", 0, False
                ]
                
                ws.update(f"A{next_row}:I{next_row}", [new_user_data])
                
        except Exception as e:
            print(f"❌ Failed to log user: {e}")

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
            print(f"❌ Error getting user data: {e}")
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
            print(f"❌ Error updating progress: {e}")
    
    @app.get("/")
    async def root():
        return {"status": "healthy", "message": "Guest Matcher API is running", "logic_available": LOGIC_AVAILABLE}
    
    @app.get("/health")
    async def health():
        return {"status": "ok", "logic_available": LOGIC_AVAILABLE}
    
    @app.post("/webhook")
    async def webhook_listener(request: Request):
        try:
            data = await request.json()
            return {"status": "ok"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    @app.post("/send-code")
    async def send_code(data: dict):
        phone = data.get("phone")
        full_name = data.get("full_name", "")
        
        if not phone:
            raise HTTPException(status_code=400, detail="Phone number is required")
        
        if not GREEN_API_ID or not GREEN_API_TOKEN:
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
            return {"status": "success", "code": code, "response": res.json()}
        except Exception as e:
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
            
            return {
                "status": "success",
                "daily_matches_used": user_data["daily_matches_used"],
                "is_premium": user_data["is_premium"],
                "current_file_hash": user_data["current_file_hash"],
                "current_progress": user_data["current_progress"]
            }
        
        return {"status": "failed"}
    
    @app.post("/log-user")
    async def log_user(user_data: dict):
        return {"status": "success"}
    
    @app.post("/upgrade-user") 
    async def upgrade_user(user_data: dict):
        return {"status": "success"}
    
    @app.get("/check-payment-status/{phone}")
    async def check_payment_status(phone: str):
        user_data = await get_user_data(phone)
        return {"is_premium": user_data["is_premium"]}
    
    @app.post("/update-match-count")
    async def update_match_count(match_data: dict):
        phone = match_data.get("phone")
        matches_used = match_data.get("matches_used")
        progress = match_data.get("progress")
        
        if phone:
            await update_user_progress(phone, matches_used=matches_used, progress=progress)
        
        return {"status": "success"}
    
    @app.post("/merge-files")
    async def merge_files(
        guests_file: UploadFile = File(...), 
        contacts_file: UploadFile = File(...),
        phone: str = None,
        contacts_source: str = "file"
    ):
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        try:
            guests_bytes = await guests_file.read()
            contacts_bytes = await contacts_file.read()

            file_hash = create_file_hash(guests_bytes)
            
            user_data = {"current_file_hash": "", "current_progress": 0}
            if phone:
                user_data = await get_user_data(phone)
            
            # עיבוד קבצים
            guests_df = load_excel_flexible(BytesIO(guests_bytes))
            
            if contacts_source == "mobile":
                contacts_data = json.loads(contacts_bytes.decode('utf-8'))
                contacts_df = pd.DataFrame(contacts_data)
            else:
                contacts_df = load_excel_flexible(BytesIO(contacts_bytes))

            # בדוק המשכה מקובץ קיים
            start_index = 0
            if phone and file_hash == user_data["current_file_hash"]:
                start_index = user_data["current_progress"]

            # מציאת התאמות
            results = []
            for idx, (_, guest) in enumerate(guests_df.iterrows()):
                guest_name = guest[NAME_COL]
                guest_norm = guest["norm_name"]
                
                guest_details = {}
                for col in guests_df.columns:
                    if col not in ["norm_name"]:
                        guest_details[col] = guest[col] if pd.notna(guest[col]) else ""
                
                candidates = top_matches(guest_norm, contacts_df)
                best_score = candidates["score"].max() if len(candidates) > 0 else 0
                
                results.append({
                    "index": idx,
                    "guest": guest_name,
                    "guest_details": guest_details,
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
            
            # עדכן hash אם קובץ חדש
            if phone and file_hash != user_data["current_file_hash"]:
                await update_user_progress(phone, file_hash=file_hash, progress=0)
                start_index = 0
            
            return {
                "results": results,
                "start_index": start_index,
                "file_hash": file_hash,
                "contacts_source": contacts_source
            }
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"שגיאה בעיבוד הקבצים: {str(e)}")

    @app.post("/export-results")
    async def export_results(data: dict):
        """ייצוא תוצאות לקובץ Excel"""
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        results = data.get("results", [])
        selected_contacts = data.get("selected_contacts", {})
        
        if not results:
            raise HTTPException(status_code=400, detail="No results provided")
        
        export_data = []
        
        for result in results:
            guest_name = result["guest"]
            guest_details = result["guest_details"]
            
            row_data = guest_details.copy()
            
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
        
        export_df = pd.DataFrame(export_data)
        excel_buffer = to_buf(export_df)
        
        return StreamingResponse(
            BytesIO(excel_buffer.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=guests_with_contacts.xlsx"}
        )

    @app.get("/download-contacts-template")
    async def download_contacts_template():
        """הורדת קובץ דוגמה לאנשי קשר"""
        if not LOGIC_AVAILABLE:
            raise HTTPException(status_code=500, detail="Logic module not available")
            
        template_df = create_contacts_template()
        excel_buffer = to_buf(template_df)
        
        return StreamingResponse(
            BytesIO(excel_buffer.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=contacts_template.xlsx"}
        )

    @app.get("/download-guests-template")
    async def download_guests_template():
        """הורדת קובץ דוגמה למוזמנים"""
        template_data = {
            'שם מלא': ['ישראל כהן', 'שרה לוי', 'דוד אברהם', 'רחל גולד'],
            'כמות מוזמנים': [2, 1, 3, 2],
            'צד': ['חתן', 'כלה', 'חתן', 'כלה'],
            'קבוצה': ['משפחה', 'חברות', 'עבודה', 'משפחה']
        }
        
        template_df = pd.DataFrame(template_data)
        excel_buffer = to_buf(template_df)
        
        return StreamingResponse(
            BytesIO(excel_buffer.getvalue()),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=guests_template.xlsx"}
        )

    @app.get("/check-mobile-support")
    async def check_mobile_support(request: Request):
        """בדיקת תמיכה במכשיר מובייל"""
        user_agent = request.headers.get("user-agent", "").lower()
        
        is_mobile = any(device in user_agent for device in 
                       ["android", "iphone", "ipad", "mobile", "webos", "blackberry"])
        
        is_chrome = "chrome" in user_agent and "edg" not in user_agent
        
        return {
            "is_mobile": is_mobile,
            "supports_contacts_api": is_chrome,
            "user_agent": user_agent
        }

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
            return {
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    print("✅ All routes defined successfully")
    
    if __name__ == "__main__":
        port = int(os.environ.get("PORT", 8080))
        uvicorn.run(app, host="0.0.0.0", port=port)

except Exception as e:
    print(f"💥 CRITICAL ERROR during startup: {e}")
    import traceback
    print(f"📍 Full traceback: {traceback.format_exc()}")
    exit(1)