from fastapi import FastAPI, UploadFile, File
from io import BytesIO
import pandas as pd
from logic import load_excel, compute_best_scores, top_matches, NAME_COL, PHONE_COL
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import random, time

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
GREEN_API_URL = f"https://api.green-api.com/waInstance{GREEN_API_ID}/sendMessage/{GREEN_API_TOKEN}

# אחסון זמני בקודים (אפשר להחליף ב-DB אמיתי)
pending_codes = {}

@app.post("/send-code")
def send_code(phone: str):
    """שליחת קוד אימות למספר WhatsApp"""
    code = str(random.randint(1000, 9999))
    pending_codes[phone] = code

    payload = {
        "chatId": f"{phone}@c.us",  # מספר בפורמט בינלאומי, לדוגמה 972501234567
        "message": f"🔐 קוד האימות שלך הוא: {code}"
    }

    res = requests.post(GREEN_API_URL, json=payload)
    return {"status": "sent", "code": code, "response": res.json()}

@app.post("/verify-code")
def verify_code(phone: str, code: str):
    """בדיקה אם הקוד נכון"""
    if pending_codes.get(phone) == code:
        return {"status": "success"}
    return {"status": "failed"}

@app.post("/merge-files")
async def merge_files(guests_file: UploadFile = File(...), contacts_file: UploadFile = File(...)):
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
