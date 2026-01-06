# Subscription Cloud Functions Setup

**Date**: 2026-01-06
**Version**: 1.0.0
**Status**: Ready for Deployment

---

## Overview

Firebase Cloud Functions for automated subscription billing with email notifications.

---

## Cloud Functions

### 1. `processTrialEndCharges`
- **Schedule**: Daily at midnight UTC (`0 0 * * *`)
- **Purpose**: Check for trials that ended and generate prorated charges
- **Email Alert**: Sends summary email after each run
- **Location**: `functions/src/index.ts`

### 2. `processMonthlyRenewals`
- **Schedule**: Monthly on 1st at midnight UTC (`0 0 1 * *`)
- **Purpose**: Charge $29.99 for all active subscriptions
- **Email Alert**: Sends revenue summary after each run
- **Location**: `functions/src/index.ts`

---

## Setup Instructions

### 1. Install Firebase CLI (if not installed)
```bash
npm install -g firebase-tools
firebase login
```

### 2. Initialize Firebase Functions
```bash
cd /Users/xuling/code/Stanse
firebase init functions

# Select:
# - Use existing project: gen-lang-client-0960644135
# - Language: TypeScript
# - ESLint: No
# - Install dependencies: Yes
```

### 3. Install Dependencies
```bash
cd functions
npm install
```

### 4. Build
```bash
npm run build
```

### 5. Deploy
```bash
firebase deploy --only functions
```

Or deploy specific function:
```bash
firebase deploy --only functions:processTrialEndCharges
firebase deploy --only functions:processMonthlyRenewals
```

---

## Email Configuration with SendGrid (Already Configured!)

### ✅ SendGrid Integration via Google Secret Manager

The code is already configured to:
1. Load SendGrid API key from Google Secret Manager
2. Send emails on every scheduled run
3. Fall back to logging if Secret Manager access fails

### Your Secret Manager Configuration

**Secret Name**: `sendgrid-api-key`
**Project**: `gen-lang-client-0960644135`
**Location**: `projects/gen-lang-client-0960644135/secrets/sendgrid-api-key/versions/latest`

### Verify SendGrid Secret Exists

```bash
# Check if secret exists
gcloud secrets describe sendgrid-api-key --project=gen-lang-client-0960644135

# View secret value (if you have permission)
gcloud secrets versions access latest --secret=sendgrid-api-key
```

### Grant Cloud Functions Access to Secret (Cross-Project)

**Important**: Your setup has Firebase (stanseproject) and Cloud Run (gen-lang-client-0960644135) in **different projects**.

The SendGrid secret is in `gen-lang-client-0960644135`, but Cloud Functions run in `stanseproject`.

```bash
# Get Firebase Functions service account
FIREBASE_PROJECT_NUMBER=$(gcloud projects describe stanseproject --format="value(projectNumber)")
FIREBASE_SERVICE_ACCOUNT="${FIREBASE_PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Firebase Service Account: ${FIREBASE_SERVICE_ACCOUNT}"

# Grant this service account access to Secret Manager in the OTHER project
gcloud secrets add-iam-policy-binding sendgrid-api-key \
  --member="serviceAccount:${FIREBASE_SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --project=gen-lang-client-0960644135

# Verify permission granted
gcloud secrets get-iam-policy sendgrid-api-key --project=gen-lang-client-0960644135
```

**Expected output**:
```yaml
bindings:
- members:
  - serviceAccount:626045766180-compute@developer.gserviceaccount.com
  role: roles/secretmanager.secretAccessor
```

### Verify Sender Email in SendGrid

**Important**: SendGrid requires sender email verification!

1. Login to https://app.sendgrid.com
2. Go to **Settings** → **Sender Authentication**
3. Click **Verify a Single Sender**
4. Enter email: `lxu912@gmail.com`
5. Check your inbox and click verification link
6. Once verified, emails will send successfully

#### Option 2: Gmail API
Use Firebase Extension: "Trigger Email from Firestore"
```bash
firebase ext:install firebase/firestore-send-email
```

#### Option 3: AWS SES
Integrate AWS SDK

---

## Email Notifications

### Daily Trial Check Email
```
Subject: [Stanse] Daily Trial Check - X Processed

Body:
Trial End Charges Summary
========================

Run Date: 2026-01-06T00:00:00.000Z
Duration: 2.34s

Results:
- Total subscriptions checked: 10
- Trial end charges processed: 2
- Skipped (trial active): 8
- Errors: 0

Status: SUCCESS
```

### Monthly Renewal Email
```
Subject: [Stanse] Monthly Renewal - $299.90 Revenue

Body:
Monthly Renewal Summary
======================

Run Date: 2026-02-01T00:00:00.000Z
Period: 2026-02
Duration: 3.12s

Results:
- Active subscriptions: 10
- Successfully renewed: 10
- Errors: 0
- Total revenue: $299.90

Status: SUCCESS
```

### Error Email
```
Subject: [Stanse] Monthly Renewal - FAILED

Body:
Fatal error occurred:

Cannot read property 'id' of undefined

Stack trace:
...
```

---

## Monitoring

### View Function Logs
```bash
# All functions
firebase functions:log

# Specific function
firebase functions:log --only processTrialEndCharges

# Real-time logs
firebase functions:log --follow
```

### Google Cloud Console
https://console.cloud.google.com/functions/list

---

## Testing

### Local Emulation
```bash
cd functions
npm run serve
```

Then trigger via Firebase Emulator UI at http://localhost:4000

### Manual Trigger
```bash
# Using gcloud CLI
gcloud functions call processTrialEndCharges --region=us-central1

gcloud functions call processMonthlyRenewals --region=us-central1
```

### Test Scenarios

#### Scenario 1: User in trial
1. Subscribe user (trial ends in 7 days)
2. Wait or manually change `trialEndsAt` to yesterday
3. Run `processTrialEndCharges`
4. Verify billing record created

#### Scenario 2: Monthly renewal
1. Ensure user has active subscription
2. Run `processMonthlyRenewals`
3. Verify $29.99 charge added to history

---

## Deployment Checklist

- [ ] Functions code created in `functions/src/index.ts`
- [ ] Dependencies installed (`npm install` in functions/)
- [ ] Build successful (`npm run build`)
- [ ] Test locally with emulator
- [ ] Deploy to Firebase (`firebase deploy --only functions`)
- [ ] Verify functions appear in Firebase Console
- [ ] Test manual trigger
- [ ] Configure email service (SendGrid/SES)
- [ ] Update `ADMIN_EMAIL` in `functions/src/index.ts`
- [ ] Monitor first scheduled run

---

## Cost Estimates

Firebase Cloud Functions pricing:
- **Invocations**: First 2 million free, then $0.40 per million
- **Compute time**: First 400,000 GB-seconds free
- **Expected cost**: ~$0.00/month (well within free tier)

With 100 active subscribers:
- Daily trial check: 30 invocations/month
- Monthly renewal: 1 invocation/month
- Total: ~31 invocations/month (FREE)

---

## Troubleshooting

### Issue: Functions not deploying
- **Check**: Firebase project is selected (`firebase use`)
- **Check**: Billing enabled on Google Cloud project
- **Solution**: Enable Cloud Functions API

### Issue: Scheduled functions not running
- **Check**: Cloud Scheduler enabled
- **Check**: Service account permissions
- **Solution**: Grant `roles/cloudscheduler.admin` to service account

### Issue: Emails not sending
- **Check**: Email service configured (SendGrid/SES)
- **Check**: API keys set in Firebase config
- **Solution**: Test with `firebase functions:shell`

---

## Files

**Created**:
- `/Users/xuling/code/Stanse/functions/package.json`
- `/Users/xuling/code/Stanse/functions/tsconfig.json`
- `/Users/xuling/code/Stanse/functions/src/index.ts`

**Configuration needed**:
- Set admin email in `functions/src/index.ts` (line 9)
- Integrate email service (SendGrid recommended)

---

**Documentation Date**: 2026-01-06
**Status**: ✅ Ready for Deployment
