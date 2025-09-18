FROM python:3.11-slim
WORKDIR /app

# Debug - ראה מה יש בשורש
RUN ls -la /
COPY . /app
RUN echo "=== ROOT FILES ===" && ls -la
RUN echo "=== LOOKING FOR NEW_V1 ===" && find . -name "New_v1" -type d
RUN echo "=== PYTHON FILES ===" && find . -name "*.py"

CMD ["echo", "debug complete"]