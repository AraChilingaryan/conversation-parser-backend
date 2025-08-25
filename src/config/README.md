# Configuration Files

Place your configuration files here:

- `service-account.json` - Google Cloud service account credentials
- `firebase-service-account.json` - Firebase service account credentials
- Any other sensitive configuration files

**Important**: These files are ignored by git. Never commit credentials to version control.

## Required Files

1. **service-account.json** - Download from Google Cloud Console
2. **firebase-service-account.json** - Download from Firebase Console

## Setup Commands

```bash
# Google Cloud service account
gcloud iam service-accounts keys create ./config/service-account.json \
  --iam-account=your-service@your-project.iam.gserviceaccount.com

# Firebase service account (download from Firebase Console)
