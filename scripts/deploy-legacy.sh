#!/bin/bash

# Configuration
PROJECT_ID="svc-demo-vertex"
REGION="us-central1"
SERVICE="storycraftv3"
IMAGE_URI="us-central1-docker.pkg.dev/$PROJECT_ID/vertexai/$SERVICE:v1"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

# 1. Build the container image using Cloud Build
# Using a config file for caching support.
echo "Building container image..."
gcloud builds submit --config "$SCRIPT_DIR/cloudbuild.yaml" --substitutions _IMAGE_NAME=$IMAGE_URI "$PROJECT_ROOT"

# 2. Deploy to Cloud Run
echo "Deploying to Cloud Run..."

# Reset the SECONDS variable to measure just the deploy step
SECONDS=0


gcloud run deploy $SERVICE \
  --image $IMAGE_URI \
  --cpu 1 \
  --memory 2G \
  --region $REGION \
  --timeout=5m \
  --set-env-vars PROJECT_ID="svc-demo-vertex",LOCATION="us-central1",USE_COSMO="false",FIRESTORE_DATABASE_ID="storycraft-db",GCS_VIDEOS_STORAGE_URI="gs://svc-demo-vertex-us/storycraft/",AUTH_TRUST_HOST='true',AUTH_URL='https://storycraftv3.mblanc.demo.altostrat.com' \
  --update-secrets=AUTH_SECRET=STORYCRAFT_AUTH_SECRET:1,AUTH_GOOGLE_ID=STORYCRAFT_AUTH_GOOGLE_ID:1,AUTH_GOOGLE_SECRET=STORYCRAFT_AUTH_GOOGLE_SECRET:1,NEXT_AUTH_URL=STORYCRAFT_NEXT_AUTH_URL:1

duration=$SECONDS
echo "----------------------------------------------------------------"
echo "Deployment complete."
echo "Time taken for deployment: $(($duration / 60)) minutes and $(($duration % 60)) seconds."
echo "----------------------------------------------------------------"
