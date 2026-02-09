# ---- שלב 1: התקנת סביבת העבודה ----
FROM python:3.11-slim

# הגדרת תיקיית העבודה הראשית בקונטיינר
WORKDIR /app

# העתקת קובץ הדרישות המעודכן (הכולל את packaging) מהשורש
COPY requirements.txt .

# התקנת הספריות - כאן יותקנו כל הספריות כולל אלו שחסרו קודם
RUN pip install --no-cache-dir -r requirements.txt

# העתקת כל תוכן תיקיית ה-backend ישירות לתיקיית העבודה (/app)
# זה מבטיח ש-main.py וקובץ ה-logic יהיו באותו מפלס
COPY my-backend/ .

# חשיפת הפורט ש-Cloud Run מצפה לו
EXPOSE 8080

# הרצת השרת
# אנחנו מוודאים שהמערכת מאזינה ל-0.0.0.0 ולפורט 8080 כפי שנדרש
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]