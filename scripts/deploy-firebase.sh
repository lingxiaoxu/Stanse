#!/bin/bash
# Deploy Firebase Functions and Firestore Rules
# Handles cleanup policy warning gracefully

set -e  # Exit on error

echo "🚀 Deploying Firebase Functions and Firestore Rules..."
echo ""

cd "$(dirname "$0")/.."  # Go to project root

# Push to git
echo "📦 Pushing to GitHub..."
git push origin main
echo ""

# Build functions
echo "🔨 Building Cloud Functions..."
cd functions
npm run build
cd ..
echo ""

# Deploy
echo "☁️  Deploying to Firebase..."
firebase deploy --only functions,firestore:rules --project=stanseproject 2>&1 | tee /tmp/firebase-deploy.log

# Check deployment result
if grep -q "Successful update operation" /tmp/firebase-deploy.log && \
   grep -q "released rules" /tmp/firebase-deploy.log; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Deployment Successful!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Functions deployed:"
    echo "  - processTrialEndCharges (daily at midnight UTC)"
    echo "  - processMonthlyRenewals (monthly on 1st at midnight UTC)"
    echo ""
    echo "Firestore rules: Updated"
    echo ""
    echo "Note: Cleanup policy warning can be ignored (you have 2-year retention configured)"
    echo ""
    exit 0
else
    echo ""
    echo "❌ Deployment may have failed. Check logs above."
    exit 1
fi
