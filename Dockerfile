# השתמש ב-Python 3.11
FROM python:3.11-slim

# הגדר את ספריית העבודה
WORKDIR /app

# העתק את קובץ requirements.txt
COPY requirements.txt .

# התקן dependencies
RUN pip install --no-cache-dir -r requirements.txt

# העתק את כל הקבצים
COPY . .

# חשוף את הפורט 8080 (Google Cloud Run default)
EXPOSE 8080

# הרץ את האפליקציה
CMD ["python", "main.py"]