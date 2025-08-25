echo "Setting up Google Cloud for Conversation Parser..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Google Cloud CLI is not installed. Please install it first."
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Login to Google Cloud
echo "Logging in to Google Cloud..."
gcloud auth login

# Set project
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable speech.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Create service account
echo "Creating service account..."
gcloud iam service-accounts create conversation-parser \
    --display-name="Conversation Parser Service Account" \
    --description="Service account for the conversation parser backend"

# Grant necessary permissions
echo "Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:conversation-parser@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/speech.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:conversation-parser@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Create and download service account key
echo "Creating service account key..."
gcloud iam service-accounts keys create ./config/service-account.json \
    --iam-account=conversation-parser@$PROJECT_ID.iam.gserviceaccount.com

echo "✅ Google Cloud setup complete!"
echo "📝 Don't forget to:"
echo "   1. Update your .env file with PROJECT_ID=$PROJECT_ID"
echo "   2. Setup Firebase project"
echo "   3. Download Firebase service account key"

---

# LICENSE
MIT License

Copyright (c) 2025 Conversation Parser

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT
