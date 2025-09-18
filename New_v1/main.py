from fastapi import FastAPI, UploadFile, File
from io import BytesIO
import pandas as pd
from logic import load_excel, compute_best_scores, top_matches, NAME_COL, PHONE_COL
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import random, time
from fastapi import Request
import requests
import os
import uvicorn

# יצירת אפליקציה FastAPI
app = FastAPI()

# ✨ הוספת CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # אפשר לפתוח לכולם או לשים ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# פרטי Green API
GREEN_API_ID = "7105248361"
GREEN_API_TOKEN = "8b416b11358045f3bad816ffaf433454989a08cfb4d448ebae"
GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}"

# אחסון זמני בקודים (אפשר להחליף ב-DB אמיתי)
pending_codes = {}

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"status": "healthy", "message": "Guest Matcher API is running"}

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}

@app.post("/webhook")
async def webhook_listener(request: Request):
    data = await request.json()
    print("📩 התקבל Webhook:", data)
    return {"status": "ok"}

@app.post("/send-code")
async def send_code(data: dict):
    """שליחת קוד אימות למספר WhatsApp"""
    phone = data.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")
    
    code = str(random.randint(1000, 9999))
    pending_codes[phone] = code

    payload = {
        "chatId": f"{phone}@c.us",
        "message": f"🔐 קוד האימות שלך הוא: {code}"
    }

    try:
        res = requests.post(GREEN_API_URL, json=payload, timeout=10)
        return {"status": "success", "code": code, "response": res.json()}
    except Exception as e:
        print(f"Error sending WhatsApp message: {e}")
        return {"status": "success", "code": code, "message": "Code generated (WhatsApp sending failed)"}

@app.post("/verify-code")
async def verify_code(data: dict):
    """בדיקה אם הקוד נכון"""
    phone = data.get("phone")
    code = data.get("code")
    
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Phone and code are required")
    
    if pending_codes.get(phone) == code:
        # נקה את הקוד אחרי שימוש
        pending_codes.pop(phone, None)
        return {
            "status": "success",
            "used_guests": 0,
            "is_premium": False
        }
    return {"status": "failed"}

@app.post("/log-user")
async def log_user(user_data: dict):
    """שמירה בגוגל שיטס"""
    # כאן תוסיף את הקוד לחיבור לגוגל שיטס API
    print(f"Logging user: {user_data}")
    return {"status": "success"}

@app.post("/upgrade-user") 
async def upgrade_user(user_data: dict):
    """עדכון משתמש לפרימיום בגוגל שיטס"""
    print(f"Upgrading user: {user_data}")
    return {"status": "success"}

@app.get("/check-payment-status/{phone}")
async def check_payment_status(phone: str):
    """בדיקה בגוגל שיטס אם המשתמש שילם"""
    # כאן תוסיף את הלוגיקה לבדיקה בגוגל שיטס
    print(f"Checking payment status for: {phone}")
    return {"is_premium": False}

@app.post("/update-match-count")
async def update_match_count(match_data: dict):
    """עדכון מספר התאמות בגוגל שיטס"""
    print(f"Updating match count: {match_data}")
    return {"status": "success"}

@app.post("/merge-files")
async def merge_files(guests_file: UploadFile = File(...), contacts_file: UploadFile = File(...)):
    """מיזוג קבצי מוזמנים ואנשי קשר"""
    try:
        # קריאת הקבצים לתוך BytesIO
        guests_bytes = await guests_file.read()
        contacts_bytes = await contacts_file.read()

        # טעינת הקבצים עם הפונקציות שלך
        guests_df = load_excel(BytesIO(guests_bytes))
        contacts_df = load_excel(BytesIO(contacts_bytes))

        # מחשב את הציון הטוב ביותר לכל מוזמן
        guests_df["best_score"] = compute_best_scores(guests_df, contacts_df)

        results = []
        for _, guest in guests_df.iterrows():
            candidates = top_matches(guest["norm_name"], contacts_df)
            results.append({
                "guest": guest[NAME_COL],
                "best_score": int(guest["best_score"]),
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

        return {"results": results}
    
    except Exception as e:
        print(f"Error in merge_files: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing files: {str(e)}")

if __name__ == "__main__":
    # Cloud Run מעביר את הפורט דרך משתנה הסביבה
    port = int(os.environ.get("PORT", 8080))  # שונה ל-8080 כברירת מחדל
    print(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)