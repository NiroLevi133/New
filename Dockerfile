FROM python:3.11-slim

WORKDIR /app

# העתק requirements
COPY New_v1/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# העתק הכל
COPY New_v1/ .

# 🔍 Debug - הראה מה יש בתיקייה
RUN echo "=== ROOT DIRECTORY STRUCTURE ===" && ls -la /
RUN echo "=== APP DIRECTORY STRUCTURE ===" && ls -la /app
RUN echo "=== LOOKING FOR PYTHON FILES ===" && find /app -name "*.py"
RUN echo "=== CHECKING IF MAIN.PY EXISTS ===" && ls -la /app/main.py || echo "main.py NOT FOUND!"

CMD ["python", "main.py"]