print("🚀 Starting application...")

try:
    print("📦 Importing FastAPI...")
    from fastapi import FastAPI, UploadFile, File, HTTPException, Request
    print("✅ FastAPI imported successfully")
    
    print("📦 Importing other libraries...")
    from io import BytesIO
    import pandas as pd
    from fastapi.middleware.cors import CORSMiddleware
    import random, time
    import requests
    import os
    import uvicorn
    import re
    import datetime
    print("✅ All basic libraries imported successfully")
    
    # בדיקה אם קובץ logic קיים
    try:
        print("📦 Trying to import logic...")
        from logic import load_excel_flexible, compute_best_scores, top_matches, NAME_COL, PHONE_COL, create_contacts_template
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

    async def log_user_to_sheets(phone: str):
    """שמירת משתמש חדש ב-Google Sheets"""
    try:
        print(f"Attempting to log user {phone} to Google Sheets")
        
        if not LOGIC_AVAILABLE:
            print("Logic not available, skipping Google Sheets logging")
            return
            
        # קבלת משתני סביבה - זה החלק שהיה חסר!
        sheet_id = os.environ.get('GOOGLE_SHEET_ID')
        sheet_name = os.environ.get('GOOGLE_SHEET_NAME', 'users1')
        
        if not sheet_id:
            print("❌ GOOGLE_SHEET_ID not found in environment variables")
            return
            
        print(f"📋 Using sheet ID: {sheet_id}, sheet name: {sheet_name}")
        
        # חיבור ל-Google Sheets
        import google.auth
        import gspread
        
        creds, _ = google.auth.default()
        gc = gspread.authorize(creds)
        
        # פתח את הגיליון עם המשתנים מהסביבה
        sh = gc.open_by_key(sheet_id)
        ws = sh.worksheet(sheet_name)
        
        # בדוק אם המשתמש כבר קיים
        phone_values = ws.col_values(3) if ws.col_values(3) else []
        if phone in phone_values:
            print(f"User {phone} already exists")
            return
        
        # מצא השורה הבאה
        all_values = ws.get_all_values()
        next_row = len(all_values) + 1
        next_id = next_row - 1
        
        # הוסף משתמש חדש
        current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        ws.update(f"A{next_row}:F{next_row}", [[
            next_id,          # A: id
            phone,            # B: full_name 
            phone,            # C: phone  
            current_time,     # D: join_date
            0,                # E: matches_count
            False             # F: is_premium
        ]])
        
        print(f"✅ User {phone} logged successfully with ID {next_id}")
        
    except Exception as e:
        print(f"❌ Failed to log user to sheets: {e}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
    
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
        
        if not phone or not code:
            print("❌ Phone or code missing")
            raise HTTPException(status_code=400, detail="Phone and code are required")
        
        if pending_codes.get(phone) == code:
            pending_codes.pop(phone, None)
            print("✅ Code verified successfully")
            
            # שמירה ב-Google Sheets
            await log_user_to_sheets(phone)
            
            return {
                "status": "success",
                "used_guests": 0,
                "is_premium": False
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
        return {"is_premium": False}
    
    @app.post("/update-match-count")
    async def update_match_count(match_data: dict):
        print(f"📊 Updating match count: {match_data}")
        return {"status": "success"}
    
    @app.post("/merge-files")
    async def merge_files(guests_file: UploadFile = File(...), contacts_file: UploadFile = File(...)):
        print("🔀 Merge files endpoint called")
        
        if not LOGIC_AVAILABLE:
            print("❌ Logic module not available")
            raise HTTPException(status_code=500, detail="Logic module not available")
        
        try:
            print("📖 Reading uploaded files...")
            guests_bytes = await guests_file.read()
            contacts_bytes = await contacts_file.read()
            print(f"✅ Files read - Guests: {len(guests_bytes)} bytes, Contacts: {len(contacts_bytes)} bytes")

            print("🔄 Processing files with improved logic...")
            
            # שימוש בפונקציה החדשה הגמישה
            guests_df = load_excel_flexible(BytesIO(guests_bytes))
            contacts_df = load_excel_flexible(BytesIO(contacts_bytes))
            
            print(f"✅ DataFrames created - Guests: {len(guests_df)}, Contacts: {len(contacts_df)}")

            # מציאת ההתאמות
            results = []
            for _, guest in guests_df.iterrows():
                guest_name = guest[NAME_COL]
                guest_norm = guest["norm_name"]
                
                # מציאת מועמדים
                candidates = top_matches(guest_norm, contacts_df)
                
                # חישוב ציון הטוב ביותר
                best_score = candidates["score"].max() if len(candidates) > 0 else 0
                
                results.append({
                    "guest": guest_name,
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
            
            print(f"✅ Processing complete - {len(results)} results")
            return {"results": results}
        
        except Exception as e:
            print(f"❌ Error in merge_files: {e}")
            import traceback
            print(f"📍 Full traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"שגיאה בעיבוד הקבצים: {str(e)}")

    @app.get("/download-contacts-template")
    async def download_contacts_template():
        """הורדת קובץ דוגמה לאנשי קשר"""
        try:
            if not LOGIC_AVAILABLE:
                raise HTTPException(status_code=500, detail="Logic module not available")
                
            template_df = create_contacts_template()
            
            # יצירת buffer
            from logic import to_buf
            excel_buffer = to_buf(template_df)
            
            from fastapi.responses import StreamingResponse
            
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
                ]
            }
            
            template_df = pd.DataFrame(template_data)
            
            # יצירת buffer
            from logic import to_buf
            excel_buffer = to_buf(template_df)
            
            from fastapi.responses import StreamingResponse
            
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