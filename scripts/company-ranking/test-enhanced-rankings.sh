#!/bin/bash
# Test script for enhanced rankings generation

cd /Users/xuling/code/Stanse/scripts/company-ranking

# Get Gemini API key
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135)

# Run test
python3 05-generate-enhanced-rankings.py --test --persona capitalist-globalist
