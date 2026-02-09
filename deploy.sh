#!/bin/bash

# Script to deploy to Google Cloud Run with correct settings

echo "🚀 Deploying to Google Cloud Run..."

gcloud run deploy new \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --platform managed \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "PORT=8080"

echo "✅ Deployment complete!"
