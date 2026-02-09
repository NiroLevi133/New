# ---- שלב 1: התקנת סביבת העבודה ----
FROM python:3.11-slim

# יוצרים תיקייה לעבודה
WORKDIR /app

# מעתיקים את הקובץ requirements.txt (שנמצא בשורש)
COPY requirements.txt .

# מתקינים את הספריות הנדרשות
RUN pip install --no-cache-dir -r requirements.txt

# מעתיקים את תיקיית הבאקנד (שם יש את main.py וכל הקוד)
COPY my-backend/ ./my-backend

# נכנסים לתיקיית הבאקנד
WORKDIR /app/my-backend

# פותחים פורט 8080 (הנדרש על ידי Cloud Run)
EXPOSE 8080

# מפעילים את השרת - משתמשים ב-PORT environment variable
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
