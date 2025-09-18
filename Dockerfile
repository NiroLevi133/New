FROM python:3.11-slim
WORKDIR /app
COPY New_v1/requirements.txt .
RUN pip install -r requirements.txt
COPY New_v1/ .
EXPOSE 8080
CMD ["python", "main.py"]