#!/bin/bash
# API Testing Script for Polis Protocol
# Make sure the server is running first: cargo run

API_BASE="http://localhost:8080/api/v1"

echo "=========================================="
echo "🧪 Testing Polis Protocol API"
echo "=========================================="
echo ""

# Test health endpoint
echo "1️⃣  Testing Health Check..."
curl -s "$API_BASE/health" | jq '.'
echo ""
echo ""

# Test global stats
echo "2️⃣  Testing Global Statistics..."
curl -s "$API_BASE/stats/global" | jq '.'
echo ""
echo ""

# Test campaigns
echo "3️⃣  Testing Campaign List..."
curl -s "$API_BASE/campaigns" | jq '.'
echo ""
echo ""

# Test specific campaign
echo "4️⃣  Testing Single Campaign (fair-wages-initiative)..."
curl -s "$API_BASE/campaigns/fair-wages-initiative" | jq '.'
echo ""
echo ""

# Test user impact
echo "5️⃣  Testing User Impact..."
curl -s "$API_BASE/user/did:polis:activist001/impact" | jq '.'
echo ""
echo ""

# Test action submission
echo "6️⃣  Testing Action Submission..."
curl -s -X POST "$API_BASE/actions/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "user_did": "did:polis:tester123",
    "action_type": "BOYCOTT",
    "target_entity": "TestCorp",
    "value_diverted": 10000,
    "zk_proof": "test_proof_xyz",
    "shard_id": "green-energy-2025"
  }' | jq '.'
echo ""
echo ""

# Test shard stats
echo "7️⃣  Testing Shard Statistics (green-energy-2025)..."
curl -s "$API_BASE/shards/green-energy-2025/stats" | jq '.'
echo ""
echo ""

echo "=========================================="
echo "✅ API Testing Complete!"
echo "=========================================="
echo ""
echo "💡 Tip: Install jq for pretty JSON output"
echo "   macOS: brew install jq"
echo "   Linux: sudo apt-get install jq"
echo ""
