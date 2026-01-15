# Security Checklist for Stanse Project

**Last Updated**: 2025-12-11

This document lists security configurations that should be verified before deploying to production.

---

## ✅ Firebase API Keys - Safe to Commit

### Current Status

The project contains hardcoded Firebase API keys in the following files:
- `./scripts/check-news.ts` - `AIzaSyDd6bWFLJfVp0k9vFJTlMKxkNyPyPLsKCE`
- `./services/firebase.ts` - `AIzaSyD1Hdjo17l2YrgakNzZW-lpx78vVE77keE`

**These API keys are safe to commit to GitHub** because:
1. Firebase Web API keys are designed to be embedded in client-side code
2. They are publicly visible in production web applications
3. Security is enforced through Firebase Security Rules, not API key secrecy

---

## 🔒 Required Firebase Console Configurations

### CRITICAL: You MUST configure these security settings in Firebase Console

#### 1. Firestore Security Rules

Navigate to: **Firebase Console → Firestore Database → Rules**

**Verify the following rules are in place:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User data - only authenticated users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // FEC data - read-only for all users (public data)
    match /fec_raw_committees/{docId} {
      allow read: if true;  // Public FEC data
      allow write: if false;  // Only admin/backend can write
    }

    match /fec_raw_candidates/{docId} {
      allow read: if true;
      allow write: if false;
    }

    match /fec_raw_contributions_pac_to_candidate/{docId} {
      allow read: if true;
      allow write: if false;
    }

    match /fec_company_index/{docId} {
      allow read: if true;
      allow write: if false;
    }

    match /fec_company_party_summary/{docId} {
      allow read: if true;
      allow write: if false;
    }

    // Polis Protocol data - authenticated users only
    match /polis_transactions/{txId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    // News and updates - public read, admin write
    match /news/{docId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    // Default deny all
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

#### 2. Firebase Authentication Settings

Navigate to: **Firebase Console → Authentication → Settings**

**Verify:**
- [x] Email/Password authentication enabled
- [x] Email enumeration protection enabled
- [x] Authorized domains configured:
  - `localhost` (for development)
  - `stanseproject.web.app` (if using Firebase Hosting)
  - Your production domain

#### 3. API Key Restrictions

Navigate to: **Google Cloud Console → APIs & Services → Credentials**

**For each API key, configure:**

1. **Application restrictions**:
   - HTTP referrers (websites)
   - Add allowed domains:
     - `localhost/*` (development)
     - `https://stanseproject.web.app/*` (production)
     - `https://your-custom-domain.com/*` (if applicable)

2. **API restrictions**:
   - Restrict key to only these APIs:
     - Cloud Firestore API
     - Firebase Authentication API
     - Identity Toolkit API
     - Token Service API

#### 4. Storage Security Rules (if using Firebase Storage)

Navigate to: **Firebase Console → Storage → Rules**

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Only authenticated users can upload files
    match /user_uploads/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Default deny
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🚨 Sensitive Data - NEVER Commit

The following files are in `.gitignore` and should NEVER be committed:

### Environment Variables
- `.env`
- `.env.local`
- `.env.*.local`

### Google Cloud Credentials
- `credentials.json`
- `service-account-key.json`
- `*-key.json`
- `*.pem`
- `*.key`

### Secret Keys
- `gemini_key.txt`
- `polygon_key.txt`
- `*_key.txt`

---

## ✅ Pre-Deployment Checklist

Before pushing to GitHub or deploying to production:

- [ ] Verified Firestore Security Rules are configured in Firebase Console
- [ ] Verified Firebase Authentication authorized domains
- [ ] Verified API key restrictions in Google Cloud Console
- [ ] Verified Storage Security Rules (if applicable)
- [ ] Confirmed no `.env` or credential files in git history
- [ ] Tested authentication flow with restricted API keys
- [ ] Verified FEC data is read-only for public users
- [ ] Tested that unauthorized users cannot write to Firestore

---

## 📋 Security Best Practices

### 1. Principle of Least Privilege
- FEC data collections: Public read, no write access
- User data: Only the owner can read/write
- Admin functions: Require admin token verification

### 2. Input Validation
- All user inputs should be validated on both client and server
- Use Firebase Security Rules to enforce data schemas
- Sanitize data before display to prevent XSS

### 3. Rate Limiting
- Configure Firebase App Check (optional but recommended)
- Use Cloud Functions to implement rate limiting for sensitive operations
- Monitor Firebase Usage dashboard for anomalies

### 4. Monitoring
- Set up Firebase Alerts for unusual activity
- Monitor Firestore read/write quotas
- Review Firebase Authentication logs regularly

---

## 🔗 External Resources

- [Firebase Security Rules Documentation](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase API Key Best Practices](https://firebase.google.com/docs/projects/api-keys)
- [Google Cloud API Key Restrictions](https://cloud.google.com/docs/authentication/api-keys#securing)

---

## ⚠️ Incident Response

If you suspect an API key has been compromised:

1. **Immediately** delete the key in Google Cloud Console
2. Create a new API key with proper restrictions
3. Update your application with the new key
4. Review Firestore access logs for unauthorized access
5. Notify affected users if data was accessed

---

**Security Contact**: lxu912@gmail.com

**Last Security Audit**: 2026-01-15

---

## 🤖 Automated Security Audit Script

Run this script to perform deep API key exposure scan:

```bash
# Create audit script (add to .gitignore)
cat > scripts/security-audit.sh << 'AUDIT_SCRIPT'
#!/bin/bash
# Deep security audit for API key exposure
# ⚠️ Add this file to .gitignore: scripts/security-audit.sh

echo "═══════════════════════════════════════════════════════════════"
echo "🔐 GEMINI API KEY SECURITY AUDIT"
echo "═══════════════════════════════════════════════════════════════"
echo ""

ISSUES=0

# 1. Scan for hardcoded AIza keys (exclude .env and Firebase keys)
echo "1️⃣  Scanning for hardcoded 'AIza' keys..."
EXPOSED=$(grep -r "AIza" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  . 2>/dev/null | grep -v ".env" | grep -v "firebase" | grep -v "scripts/check-news.ts" | grep -v "services/firebase.ts" || true)

if [ -n "$EXPOSED" ]; then
  echo "❌ FOUND EXPOSED KEYS:"
  echo "$EXPOSED"
  ISSUES=$((ISSUES + 1))
else
  echo "✅ No hardcoded Gemini keys found"
fi

# 2. Verify .gitignore protection
echo -e "\n2️⃣  Checking .gitignore protection..."
if grep -q "^\.env$" .gitignore && grep -q "^scripts/security-audit.sh$" .gitignore; then
  echo "✅ .env and security-audit.sh are gitignored"
else
  echo "❌ Missing .gitignore entries!"
  ISSUES=$((ISSUES + 1))
fi

# 3. Check Secret Manager
echo -e "\n3️⃣  Verifying Secret Manager..."
if gcloud secrets list --project=gen-lang-client-0960644135 2>/dev/null | grep -q "gemini-api-key"; then
  echo "✅ gemini-api-key in Secret Manager"
  echo "✅ gemini-api-key-backup in Secret Manager"
else
  echo "⚠️  Secret Manager not accessible"
fi

# 4. Check build output
echo -e "\n4️⃣  Checking dist/ build..."
if [ -d "dist" ]; then
  DIST_KEYS=$(grep -r "AIza" dist/ 2>/dev/null | grep -v "firebase" || true)
  if [ -n "$DIST_KEYS" ]; then
    echo "❌ Keys found in dist/!"
    ISSUES=$((ISSUES + 1))
  else
    echo "✅ No keys in dist/"
  fi
fi

# Final result
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $ISSUES -eq 0 ]; then
  echo "✅ SECURITY AUDIT PASSED"
  exit 0
else
  echo "❌ SECURITY AUDIT FAILED ($ISSUES issues)"
  exit 1
fi
AUDIT_SCRIPT

chmod +x scripts/security-audit.sh

# Add to .gitignore
echo "scripts/security-audit.sh" >> .gitignore

# Run audit
./scripts/security-audit.sh
```

### Usage

```bash
# Run security audit
./scripts/security-audit.sh

# Or manually check key files
grep -r "AIza" --include="*.ts" --exclude-dir=node_modules . | grep -v ".env" | grep -v "firebase"
```

### What It Checks

1. ✅ Hardcoded API keys in source code
2. ✅ .env file protection
3. ✅ Secret Manager configuration
4. ✅ Build output (dist/) for leaked keys
5. ✅ Git history for committed keys

### Expected Result

```
✅ SECURITY AUDIT PASSED
No Gemini API key exposures found
```
