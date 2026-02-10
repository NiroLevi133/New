# השתמש בתמונה רשמית של פייתון
FROM python:3.11-slim

# הגדרת תיקיית עבודה
WORKDIR /app

# העתקת קובץ הדרישות מהשורש (היכן שנמצא ה-Dockerfile)
COPY requirements.txt .

# התקנת הספריות - כולל packaging שמופיעה בקובץ
RUN pip install --no-cache-dir -r requirements.txt

# העתקת תוכן תיקיית ה-backend לתוך /app
# זה מבטיח ש-main.py ו-logic.py יהיו זמינים להרצה
COPY my-backend/ .

# חשיפת הפורט ש-Cloud Run מצפה לו
ENV PORT=8080
EXPOSE 8080

# הרצת השרת באמצעות uvicorn
# ודא ש-main.py נמצא ישירות תחת my-backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]