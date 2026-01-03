# Python-TypeScript Synchronization Summary

**Date**: 2026-01-02
**Script**: `/Users/xuling/code/Stanse/scripts/company-ranking/05-generate-enhanced-rankings.py`

## Summary of Changes Required

The Python script needs to be synchronized with all TypeScript enhancements made to:
- `services/companyRankingService.ts`
- `services/personaAwareScoring.ts`
- `services/personaScoringConfig.ts`

## Changes Already Completed ✅

### 1. FEC Scoring (Lines 334-401) - COMPLETE
**What was fixed**:
- Changed from flat field access (`fec_data['total_amount']`, `fec_data['dem_amount']`) to nested `party_totals` structure
- Now accesses: `fec_data['party_totals']['DEM']['total_amount_usd']` and `fec_data['party_totals']['REP']['total_amount_usd']`
- Added `political_lean_score` integration (20% weight)
- Added donation distribution diversity bonus/penalty based on persona preferences
- Now perfectly matches TypeScript `calculateFECScorePersonaAware()` function

## Changes Still Required ❌

### 2. ESG Scoring (Lines 403-446) - NEEDS ENHANCEMENT
**Current state**: Basic implementation exists
**Required changes**:
```python
# NEED TO ADD:
# 1. progressive_lean_score integration for progressive/socialist personas
if esg_data.get('progressive_lean_score') is not None and \
   (stance_type.startswith('progressive') or stance_type.startswith('socialist')):
    final_score = final_score * 0.7 + esg_data['progressive_lean_score'] * 0.3

# 2. Industry-relative scoring
if esg_data.get('industrySectorAvg', {}).get('ESGScore') and esg_data.get('ESGScore'):
    industry_avg = esg_data['industrySectorAvg']['ESGScore']
    company_score = esg_data['ESGScore']
    relative_performance = ((company_score - industry_avg) / industry_avg) * 100
    relative_bonus = max(-5, min(5, relative_performance / 4))
    if config['preferHighESG']:
        final_score += relative_bonus
    else:
        final_score -= relative_bonus
```

### 3. Executive Scoring (Lines 448-488) - NEEDS MAJOR ENHANCEMENT
**Current state**: Basic implementation exists
**Required changes**:
```python
# NEED TO ADD:
# 1. sentiment_analysis fields
if exec_data.get('sentiment_analysis'):
    sentiment = exec_data['sentiment_analysis']

    # Controversy level
    if sentiment.get('controversy_level') is not None:
        controversy_level = sentiment['controversy_level']
        if 'socialist' in stance_type or 'nationalist' in stance_type:
            base_score += min(5, controversy_level * 0.5)
        elif stance_type == 'capitalist-globalist':
            base_score -= min(8, controversy_level * 0.8)

    # Public perception risk
    if sentiment.get('public_perception_risk'):
        risk_level = str(sentiment['public_perception_risk']).lower()
        if risk_level == 'high':
            base_score -= 5
        elif risk_level == 'medium':
            base_score -= 2

    # Overall sentiment
    if sentiment.get('overall_sentiment'):
        overall_sentiment = str(sentiment['overall_sentiment']).lower()
        if overall_sentiment == 'positive':
            base_score += 3
        elif overall_sentiment == 'negative':
            base_score -= 3

# 2. social_responsibility fields
if exec_data.get('social_responsibility'):
    social_resp = exec_data['social_responsibility']

    # Labor practices
    if social_resp.get('labor_practices_score') is not None:
        if 'progressive' in stance_type or 'socialist' in stance_type:
            labor_bonus = ((social_resp['labor_practices_score'] - 50) / 50) * 8
            base_score += labor_bonus

    # Community engagement
    if social_resp.get('community_engagement_score') is not None:
        if 'nationalist' in stance_type:
            comm_bonus = ((social_resp['community_engagement_score'] - 50) / 50) * 6
            base_score += comm_bonus

    # Diversity & inclusion
    if social_resp.get('diversity_inclusion_score') is not None:
        if 'progressive' in stance_type:
            di_bonus = ((social_resp['diversity_inclusion_score'] - 50) / 50) * 10
            base_score += di_bonus
        elif 'conservative' in stance_type:
            di_penalty = ((social_resp['diversity_inclusion_score'] - 50) / 50) * -2
            base_score += di_penalty
```

### 4. News Scoring (Lines 490-517) - NEEDS COMPLETE REWRITE
**Current state**: Very simplistic (just article count)
**Required changes**: Complete rewrite to match TypeScript implementation
```python
# NEED TO COMPLETELY REWRITE:
def calculate_news_score_persona_aware(
    self,
    news_data: Optional[List[Dict[str, Any]]],
    stance_type: str
) -> Optional[float]:
    """
    计算News sentiment alignment score (100%匹配TypeScript)
    对应 personaAwareScoring.ts 的 calculateNewsScorePersonaAware

    ENHANCED: Article recency analysis, keyword-based sentiment, volume scoring
    """
    if not news_data or len(news_data) == 0:
        return None

    config = PERSONA_CONFIGS[stance_type]['news']

    # Analyze article recency
    from datetime import datetime, timedelta
    now = datetime.utcnow().timestamp() * 1000  # milliseconds
    one_week_ago = now - (7 * 24 * 60 * 60 * 1000)
    one_month_ago = now - (30 * 24 * 60 * 60 * 1000)

    recent_count = 0
    month_count = 0
    older_count = 0
    controversial_keyword_count = 0
    positive_keyword_count = 0
    negative_keyword_count = 0

    # Keyword lists
    controversial_keywords = [
        'lawsuit', 'investigation', 'scandal', 'controversy', 'violation',
        'fraud', 'breach', 'crisis', 'protest', 'strike', 'layoff',
        'regulatory', 'fine', 'penalty', 'allegation'
    ]

    positive_keywords = [
        'innovation', 'growth', 'expansion', 'profit', 'success',
        'award', 'breakthrough', 'partnership', 'achievement', 'milestone',
        'sustainable', 'ethical', 'responsible'
    ]

    negative_keywords = [
        'decline', 'loss', 'failure', 'downgrade', 'bankruptcy',
        'misconduct', 'corruption', 'harm', 'damage', 'risk'
    ]

    # Analyze each article
    for article in news_data:
        # Parse date
        published_date_str = article.get('published_utc') or article.get('published_at') or '0'
        try:
            published_date = datetime.fromisoformat(published_date_str.replace('Z', '+00:00')).timestamp() * 1000
        except:
            published_date = 0

        if published_date > one_week_ago:
            recent_count += 1
        elif published_date > one_month_ago:
            month_count += 1
        else:
            older_count += 1

        # Analyze content
        content = f"{article.get('title', '')} {article.get('description', '')}".lower()
        for keyword in controversial_keywords:
            if keyword in content:
                controversial_keyword_count += 1
        for keyword in positive_keywords:
            if keyword in content:
                positive_keyword_count += 1
        for keyword in negative_keywords:
            if keyword in content:
                negative_keyword_count += 1

    # Calculate recency score
    total_articles = len(news_data)
    recency_score = (recent_count * 100 + month_count * 60 + older_count * 30) / max(1, total_articles)

    # Calculate sentiment score with persona-specific adjustments
    total_keywords = controversial_keyword_count + positive_keyword_count + negative_keyword_count
    sentiment_score = 50

    if total_keywords > 0:
        positive_ratio = positive_keyword_count / total_keywords
        negative_ratio = negative_keyword_count / total_keywords
        controversial_ratio = controversial_keyword_count / total_keywords

        sentiment_score = 50 + (positive_ratio - negative_ratio) * 50

        if config['sentimentPreference'] > 0:
            sentiment_score += positive_ratio * 20
            sentiment_score -= controversial_ratio * 10
        elif config['sentimentPreference'] < 0:
            sentiment_score += controversial_ratio * 15
            sentiment_score -= positive_ratio * 5
        else:
            balance = 1 - abs(positive_ratio - negative_ratio)
            sentiment_score += balance * 10

    # Volume scoring with persona preferences
    volume_score = 50
    if total_articles < 5:
        volume_score = 30
    elif total_articles < 10:
        volume_score = 50
    elif total_articles < 20:
        volume_score = 70
    else:
        volume_score = 85

    if 'globalist' in stance_type:
        volume_score *= 1.1
    elif 'nationalist' in stance_type:
        volume_score *= 0.95

    # Combine: 40% recency, 40% sentiment, 20% volume
    final_score = (recency_score * 0.4 + sentiment_score * 0.4 + volume_score * 0.2)
    final_score = final_score * config['newsImportance'] + 50 * (1 - config['newsImportance'])

    return min(100, max(0, final_score))
```

### 5. Detailed Calculation Logging - NEEDS TO BE ADDED
**Current state**: Minimal logging
**Required additions**:
```python
# Add a DetailedLogger class
class DetailedCalculationLogger:
    def __init__(self, log_dir: str):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self.all_calculations = {}  # persona -> ticker -> calculation details

    def log_ai_data_calculation(self, persona, ticker, fec_score, esg_score, exec_score, news_score, numerical_score, llm_score, final_score):
        if persona not in self.all_calculations:
            self.all_calculations[persona] = {}

        self.all_calculations[persona][ticker] = {
            'mode': 'ai-data',
            'fec_score': fec_score,
            'esg_score': esg_score,
            'executive_score': exec_score,
            'news_score': news_score,
            'numerical_score': numerical_score,
            'llm_score': llm_score,
            'final_score': final_score
        }

    def log_llm_only_calculation(self, persona, ticker, llm_score, llm_prompt):
        if persona not in self.all_calculations:
            self.all_calculations[persona] = {}

        self.all_calculations[persona][ticker] = {
            'mode': 'llm-only',
            'llm_score': llm_score,
            'llm_prompt': llm_prompt,
            'final_score': llm_score
        }

    def export_json(self, persona):
        filename = os.path.join(self.log_dir, f'{persona}_detailed_calculations.json')
        with open(filename, 'w') as f:
            json.dump(self.all_calculations[persona], f, indent=2)
        return filename

    def export_csv(self, persona):
        import csv
        filename = os.path.join(self.log_dir, f'{persona}_detailed_calculations.csv')

        with open(filename, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Ticker', 'Mode', 'FEC Score', 'ESG Score', 'Executive Score', 'News Score', 'Numerical Score', 'LLM Score', 'Final Score', 'LLM Prompt'])

            for ticker, data in self.all_calculations[persona].items():
                row = [
                    ticker,
                    data['mode'],
                    data.get('fec_score', 'N/A'),
                    data.get('esg_score', 'N/A'),
                    data.get('executive_score', 'N/A'),
                    data.get('news_score', 'N/A'),
                    data.get('numerical_score', 'N/A'),
                    data.get('llm_score', 'N/A'),
                    data['final_score'],
                    data.get('llm_prompt', 'N/A')
                ]
                writer.writerow(row)

        return filename
```

### 6. Integration in Main Script - NEEDS TO BE ADDED
**Current state**: No logger integration
**Required additions**:
```python
# In __init__ method:
self.logger = DetailedCalculationLogger('/Users/xuling/code/Stanse/logs/company-ranking')

# In generate_ranking_for_persona method:
# After calculating scores, log them:
if numerical_result['has_data']:
    self.logger.log_ai_data_calculation(
        stance_type,
        ticker,
        numerical_result['fec_score'],
        numerical_result['esg_score'],
        numerical_result['executive_score'],
        numerical_result['news_score'],
        numerical_result['numerical_score'],
        llm_score,
        total_score
    )
else:
    self.logger.log_llm_only_calculation(
        stance_type,
        ticker,
        llm_score,
        prompt  # Need to capture the LLM prompt
    )

# After persona completes:
json_file = self.logger.export_json(stance_type)
csv_file = self.logger.export_csv(stance_type)
print(f"  📊 Exported detailed logs: {json_file}, {csv_file}")
```

## Priority Order
1. **CRITICAL**: Complete ESG scoring enhancement (progressive_lean_score, industry-relative)
2. **CRITICAL**: Complete Executive scoring enhancement (sentiment_analysis, social_responsibility)
3. **CRITICAL**: Complete News scoring rewrite (keyword-based sentiment, recency, volume)
4. **HIGH**: Add DetailedCalculationLogger class
5. **HIGH**: Integrate logger into main generation loop
6. **MEDIUM**: Test all scoring functions match TypeScript output

## Testing Checklist
- [ ] FEC scores match TypeScript for all personas
- [ ] ESG scores match TypeScript for all personas
- [ ] Executive scores match TypeScript for all personas
- [ ] News scores match TypeScript for all personas (should NOT all be 64!)
- [ ] Detailed logs save to `/Users/xuling/code/Stanse/logs/company-ranking/`
- [ ] JSON export includes all calculation details
- [ ] CSV export includes all calculation details
- [ ] Different personas produce different scores for same company

## Next Steps
1. Apply ESG scoring enhancements
2. Apply Executive scoring enhancements
3. Apply News scoring complete rewrite
4. Add DetailedCalculationLogger
5. Integrate logging into generation loop
6. Run test with `--test` flag
7. Compare Python output with TypeScript output
8. If all matches, run full generation for all 8 personas
