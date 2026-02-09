# ---- שלב 1: התקנת סביבת העבודה ----
FROM python:3.11-slim

# יוצרים תיקייה לעבודה
WORKDIR /app

# מעתיקים את הקובץ requirements.txt
COPY requirements.txt .

# מתקינים את הספריות הנדרשות
RUN pip install --no-cache-dir -r requirements.txt

# מעתיקים את כל התוכן של תיקיית my-backend לתוך /app
COPY my-backend/ .

# פותחים פורט 8080
EXPOSE 8080

# מפעילים את השרת באמצעות uvicorn
# הנחה: בתוך main.py יש אובייקט בשם app (למשל app = FastAPI())
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]