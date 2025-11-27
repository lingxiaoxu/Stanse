#!/bin/bash

# ================================
# POLIS PROTOCOL - UNION REPORT GENERATOR
# ================================
# Generates detailed Union statistics report
# Saves to logs/union-reports/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORT_DIR="$PROJECT_ROOT/logs/union-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$REPORT_DIR/union_report_$TIMESTAMP.txt"

# Create report directory if it doesn't exist
mkdir -p "$REPORT_DIR"

echo "═══════════════════════════════════════════════════════════════"
echo "  POLIS PROTOCOL - UNION STATISTICS REPORT"
echo "  Generated: $(date)"
echo "═══════════════════════════════════════════════════════════════"
echo "" | tee "$REPORT_FILE"

# Check if backend is running
if ! curl -s http://localhost:8080/api/v1/health > /dev/null 2>&1; then
    echo "❌ ERROR: Polis Protocol backend is not running on port 8080" | tee -a "$REPORT_FILE"
    echo "   Start it with: cd backend/polis-protocol && cargo run --release" | tee -a "$REPORT_FILE"
    exit 1
fi

echo "✅ Backend Status: Running" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Fetch all endpoints
HEALTH_DATA=$(curl -s http://localhost:8080/api/v1/health)
GLOBAL_STATS=$(curl -s http://localhost:8080/api/v1/stats/global)
CAMPAIGNS=$(curl -s http://localhost:8080/api/v1/campaigns)
SHARDS=$(curl -s http://localhost:8080/api/v1/shards)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "  1. SYSTEM HEALTH" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "$HEALTH_DATA" | jq '.' | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "  2. GLOBAL UNION STATISTICS" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "$GLOBAL_STATS" | jq '.' | tee -a "$REPORT_FILE"

# Extract and display key metrics
ACTIVE_ALLIES=$(echo "$GLOBAL_STATS" | jq -r '.data.active_allies_online // 0')
UNION_STRENGTH=$(echo "$GLOBAL_STATS" | jq -r '.data.total_union_strength // 0')
CAPITAL_DIVERTED=$(echo "$GLOBAL_STATS" | jq -r '.data.capital_diverted_usd // 0')
TOTAL_SHARDS=$(echo "$GLOBAL_STATS" | jq -r '.data.total_shards // 0')
ACTIVE_CAMPAIGNS=$(echo "$GLOBAL_STATS" | jq -r '.data.total_active_campaigns // 0')

echo "" | tee -a "$REPORT_FILE"
echo "📊 KEY METRICS:" | tee -a "$REPORT_FILE"
echo "  • Active Allies Online:  $ACTIVE_ALLIES users" | tee -a "$REPORT_FILE"
echo "  • Total Union Strength:  $UNION_STRENGTH" | tee -a "$REPORT_FILE"
echo "  • Capital Diverted:      \$$CAPITAL_DIVERTED USD" | tee -a "$REPORT_FILE"
echo "  • Total Shards:          $TOTAL_SHARDS" | tee -a "$REPORT_FILE"
echo "  • Active Campaigns:      $ACTIVE_CAMPAIGNS" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "  3. ACTIVE CAMPAIGNS" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "$CAMPAIGNS" | jq '.' | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# List campaigns
CAMPAIGN_COUNT=$(echo "$CAMPAIGNS" | jq '.data | length')
echo "📢 CAMPAIGN SUMMARY:" | tee -a "$REPORT_FILE"
echo "  Total Campaigns: $CAMPAIGN_COUNT" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

if [ "$CAMPAIGN_COUNT" -gt 0 ]; then
    echo "$CAMPAIGNS" | jq -r '.data[] | "  ├─ \(.name)\n     │  Target: $\(.target_amount/100) USD\n     │  Progress: $\(.progress/100) USD (\(.progress * 100 / .target_amount)%)\n     │  Days Active: \(.days_active)\n"' | tee -a "$REPORT_FILE"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "  4. STANCE SHARDS" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "$SHARDS" | jq '.' | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# List shards
SHARD_COUNT=$(echo "$SHARDS" | jq '.data | length')
echo "🔷 SHARD SUMMARY:" | tee -a "$REPORT_FILE"
echo "  Total Shards: $SHARD_COUNT" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

if [ "$SHARD_COUNT" -gt 0 ]; then
    echo "$SHARDS" | jq -r '.data[] | "  ├─ \(.shard_id)\n     │  Active Nodes: \(.active_nodes)\n     │  Block Height: \(.block_height)\n     │  Ideology Range:\n     │    Economic: [\(.ideology_range.economic_min), \(.ideology_range.economic_max)]\n     │    Social: [\(.ideology_range.social_min), \(.ideology_range.social_max)]\n     │    Diplomatic: [\(.ideology_range.diplomatic_min), \(.ideology_range.diplomatic_max)]\n"' | tee -a "$REPORT_FILE"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "  5. DATA SOURCE ANALYSIS" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

# Check if data appears to be demo data
if [ "$ACTIVE_ALLIES" -le 10 ] && [ "$CAPITAL_DIVERTED" == "50.0" ] || [ "$CAPITAL_DIVERTED" == "50" ]; then
    echo "⚠️  DATA SOURCE WARNING:" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  The current data appears to be TEST/DEMO data:" | tee -a "$REPORT_FILE"
    echo "  • Active Allies: $ACTIVE_ALLIES (low number)" | tee -a "$REPORT_FILE"
    echo "  • Capital Diverted: \$$CAPITAL_DIVERTED (typical test value)" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  This data is generated from hardcoded test users in:" | tee -a "$REPORT_FILE"
    echo "  backend/polis-protocol/src/main.rs (lines 37-124)" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  Test Users Identified:" | tee -a "$REPORT_FILE"
    echo "    - did:polis:user1" | tee -a "$REPORT_FILE"
    echo "    - did:polis:user2" | tee -a "$REPORT_FILE"
    echo "    - did:polis:user3" | tee -a "$REPORT_FILE"
    echo "    - did:polis:validator1" | tee -a "$REPORT_FILE"
    echo "" | tee -a "$REPORT_FILE"
    echo "  ❌ CONCLUSION: No real users are currently using the system." | tee -a "$REPORT_FILE"
else
    echo "✅ Data appears to contain real user activity" | tee -a "$REPORT_FILE"
    echo "  • Active Allies: $ACTIVE_ALLIES" | tee -a "$REPORT_FILE"
    echo "  • Capital Diverted: \$$CAPITAL_DIVERTED" | tee -a "$REPORT_FILE"
fi

echo "" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo "  REPORT SAVED TO:" | tee -a "$REPORT_FILE"
echo "  $REPORT_FILE" | tee -a "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$REPORT_FILE"
echo ""

# Summary of all reports
echo ""
echo "📁 All Union Reports:"
ls -lh "$REPORT_DIR" | tail -5