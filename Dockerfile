FROM python:3.11-slim

# עבודה בתיקייה הראשית
WORKDIR /app

# העתקת כל הקבצים הדרושים
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# העתקת תיקיית הבאקנד לתוך הקונטיינר
COPY my-backend/ ./my-backend

# מעבר לתיקיית הבאקנד (שם נמצא main.py)
WORKDIR /app/my-backend

# פתיחת פורט 8080
EXPOSE 8080

# הרצת האפליקציה
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
