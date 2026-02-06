#!/usr/bin/env python3
"""
生成所有8种persona的enhanced company rankings

功能：
1. 为所有8种persona生成enhanced rankings
2. 使用AI-Data based (FEC + ESG + Executive + News) + LLM comprehensive方法
3. 每次运行更新主文档并保存历史记录到history subcollection
4. 可以定时运行（建议每12小时）

数据结构：
- enhanced_company_rankings/{stanceType}
  - opposeCompanies: [top 5 companies to oppose]
  - supportCompanies: [top 5 companies to support]
  - stanceType: string
  - updatedAt: timestamp
  - expiresAt: timestamp
  - version: "3.0"

- enhanced_company_rankings/{stanceType}/history/{YYYYmmdd_HHMMSS}
  - (相同结构的历史快照)

使用方法：
    # 生成所有8种persona的排名
    python3 05-generate-enhanced-rankings.py

    # 只生成特定persona
    python3 05-generate-enhanced-rankings.py --persona capitalist-globalist

    # 测试模式（只处理前10个公司）
    python3 05-generate-enhanced-rankings.py --test

作者: Claude Code
日期: 2026-01-01
"""

import os
import sys
import time
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

import firebase_admin
from firebase_admin import credentials, firestore
import google.generativeai as genai
import subprocess

# 导入邮件通知模块
try:
    from email_notifier import send_success_email, log_completion_notification
except ImportError:
    # Fallback if email_notifier not available
    def send_success_email(*args, **kwargs):
        return False
    def log_completion_notification(*args, **kwargs):
        pass

# ============================================================
# 配置
# ============================================================

def get_gemini_api_key() -> Optional[str]:
    """从环境变量或Google Secret Manager获取Gemini API key"""
    # 首先尝试环境变量 (Cloud Run Job会自动注入secret)
    api_key = os.environ.get('GEMINI_API_KEY')
    if api_key:
        return api_key

    # 如果环境变量不存在，尝试从Secret Manager获取 (本地运行时)
    try:
        result = subprocess.run(
            [
                'gcloud', 'secrets', 'versions', 'access', 'latest',
                '--secret=gemini-api-key',
                '--project=gen-lang-client-0960644135'
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            print(f"⚠️  gcloud command failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"⚠️  Failed to get API key from Secret Manager: {e}")
        return None

# 8种政治立场类型
STANCE_TYPES = [
    'progressive-globalist',
    'progressive-nationalist',
    'socialist-libertarian',
    'socialist-nationalist',
    'capitalist-globalist',
    'capitalist-nationalist',
    'conservative-globalist',
    'conservative-nationalist'
]

# ============================================================================
# SP500 DATA - Loaded from unified data source
# ============================================================================

# Import from unified data module (located 2 directories up from this script)
import sys
from pathlib import Path

# Add project root to path to import data module
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import (
    SP500_TICKERS,
    TICKER_TO_SECTOR,
    get_company_sector
)

# Persona配置（100%匹配TypeScript personaScoringConfig.ts）
PERSONA_CONFIGS = {
    'progressive-globalist': {
        'fec': {
            'partyPreference': 0.9,        # Strongly prefer Democratic donations
            'amountSensitivity': 0.5,      # Moderate concern about big money in politics
        },
        'esg': {
            'environmentalWeight': 0.4,    # High environmental focus
            'socialWeight': 0.4,           # High social justice focus
            'governanceWeight': 0.2,       # Moderate governance focus
            'preferHighESG': True,         # Strongly prefer high ESG
            'esgImportance': 0.9,          # ESG very important
        },
        'executive': {
            'preferredLeanings': ['progressive', 'liberal', 'moderate'],
            'confidenceThreshold': 60,
        },
        'news': {
            'sentimentPreference': 0.3,    # Slightly prefer positive news
            'newsImportance': 0.6,
        },
    },
    'progressive-nationalist': {
        'fec': {
            'partyPreference': 0.8,        # Prefer Democratic donations
            'amountSensitivity': 0.7,      # Higher concern about corporate influence
        },
        'esg': {
            'environmentalWeight': 0.35,   # Environmental focus
            'socialWeight': 0.35,          # Social focus (especially workers' rights)
            'governanceWeight': 0.3,       # Governance (domestic accountability)
            'preferHighESG': True,
            'esgImportance': 0.8,
        },
        'executive': {
            'preferredLeanings': ['progressive', 'liberal', 'moderate'],
            'confidenceThreshold': 65,
        },
        'news': {
            'sentimentPreference': 0.2,
            'newsImportance': 0.5,
        },
    },
    'socialist-libertarian': {
        'fec': {
            'partyPreference': 0.7,        # Left-leaning but skeptical of both parties
            'amountSensitivity': 0.8,      # High concern about money in politics
        },
        'esg': {
            'environmentalWeight': 0.3,
            'socialWeight': 0.4,           # Workers' rights focus
            'governanceWeight': 0.3,
            'preferHighESG': True,
            'esgImportance': 0.7,
        },
        'executive': {
            'preferredLeanings': ['progressive', 'liberal', 'moderate', 'libertarian'],
            'confidenceThreshold': 60,
        },
        'news': {
            'sentimentPreference': 0.0,    # Neutral
            'newsImportance': 0.4,
        },
    },
    'socialist-nationalist': {
        'fec': {
            'partyPreference': 0.6,        # Moderate left preference
            'amountSensitivity': 0.9,      # Very high concern about corporate money
        },
        'esg': {
            'environmentalWeight': 0.3,
            'socialWeight': 0.4,           # Workers' rights, domestic labor
            'governanceWeight': 0.3,
            'preferHighESG': True,
            'esgImportance': 0.6,
        },
        'executive': {
            'preferredLeanings': ['progressive', 'moderate', 'conservative'],
            'confidenceThreshold': 65,
        },
        'news': {
            'sentimentPreference': -0.2,   # Slightly prefer critical news
            'newsImportance': 0.5,
        },
    },
    'capitalist-globalist': {
        'fec': {
            'partyPreference': 0.3,        # Slight Democratic lean (socially progressive)
            'amountSensitivity': 0.2,      # Low concern about donations
        },
        'esg': {
            'environmentalWeight': 0.3,
            'socialWeight': 0.4,           # Social progressivism (diversity, inclusion)
            'governanceWeight': 0.3,
            'preferHighESG': True,
            'esgImportance': 0.7,
        },
        'executive': {
            'preferredLeanings': ['liberal', 'moderate', 'conservative'],
            'confidenceThreshold': 55,
        },
        'news': {
            'sentimentPreference': 0.4,    # Prefer positive news (innovation)
            'newsImportance': 0.6,
        },
    },
    'capitalist-nationalist': {
        'fec': {
            'partyPreference': 0.2,        # Slight Democratic lean (social issues)
            'amountSensitivity': 0.3,      # Low-moderate concern
        },
        'esg': {
            'environmentalWeight': 0.25,
            'socialWeight': 0.35,          # Domestic social issues
            'governanceWeight': 0.4,       # Corporate accountability
            'preferHighESG': True,
            'esgImportance': 0.5,
        },
        'executive': {
            'preferredLeanings': ['moderate', 'conservative', 'libertarian'],
            'confidenceThreshold': 60,
        },
        'news': {
            'sentimentPreference': 0.3,
            'newsImportance': 0.5,
        },
    },
    'conservative-globalist': {
        'fec': {
            'partyPreference': -0.8,       # Strongly prefer Republican donations
            'amountSensitivity': 0.2,      # Low concern about donations
        },
        'esg': {
            'environmentalWeight': 0.2,
            'socialWeight': 0.2,
            'governanceWeight': 0.6,       # Focus on corporate governance
            'preferHighESG': False,        # Skeptical of ESG regulations
            'esgImportance': 0.4,
        },
        'executive': {
            'preferredLeanings': ['conservative', 'moderate', 'libertarian'],
            'confidenceThreshold': 60,
        },
        'news': {
            'sentimentPreference': 0.2,
            'newsImportance': 0.5,
        },
    },
    'conservative-nationalist': {
        'fec': {
            'partyPreference': -0.9,       # Strongly prefer Republican donations
            'amountSensitivity': 0.4,      # Moderate concern (anti-establishment)
        },
        'esg': {
            'environmentalWeight': 0.15,
            'socialWeight': 0.25,
            'governanceWeight': 0.6,
            'preferHighESG': False,        # Against ESG mandates
            'esgImportance': 0.3,
        },
        'executive': {
            'preferredLeanings': ['conservative', 'moderate'],
            'confidenceThreshold': 65,
        },
        'news': {
            'sentimentPreference': 0.0,
            'newsImportance': 0.4,
        },
    },
}


# ============================================================
# 详细计算记录器
# ============================================================

class DetailedCalculationLogger:
    """
    详细计算记录器 - 记录每个公司的评分计算细节
    Track detailed scoring calculations for each company/persona combination
    """

    def __init__(self, log_dir: str):
        """初始化logger"""
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        self.all_calculations: Dict[str, Dict[str, Dict[str, Any]]] = {}  # persona -> ticker -> calculation details

    def log_ai_data_calculation(
        self,
        persona: str,
        ticker: str,
        fec_score: Optional[float],
        esg_score: Optional[float],
        exec_score: Optional[float],
        news_score: Optional[float],
        numerical_score: float,
        llm_score: Optional[float],
        final_score: float,
        llm_prompt: Optional[str] = None
    ):
        """记录AI-data based calculation"""
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
            'final_score': final_score,
            'llm_prompt': llm_prompt if llm_prompt else 'N/A'
        }

    def log_llm_only_calculation(
        self,
        persona: str,
        ticker: str,
        llm_score: float,
        llm_prompt: str
    ):
        """记录LLM-only calculation"""
        if persona not in self.all_calculations:
            self.all_calculations[persona] = {}

        self.all_calculations[persona][ticker] = {
            'mode': 'llm-only',
            'llm_score': llm_score,
            'llm_prompt': llm_prompt,
            'final_score': llm_score
        }

    def export_json(self, persona: str) -> str:
        """导出JSON格式 - 返回文件路径"""
        filename = os.path.join(self.log_dir, f'{persona}_detailed_calculations.json')
        with open(filename, 'w') as f:
            json.dump(self.all_calculations.get(persona, {}), f, indent=2)
        return filename

    def export_csv(self, persona: str) -> str:
        """导出CSV格式 - 返回文件路径"""
        import csv
        filename = os.path.join(self.log_dir, f'{persona}_detailed_calculations.csv')

        with open(filename, 'w', newline='') as f:
            writer = csv.writer(f)
            # CSV header
            writer.writerow([
                'Ticker', 'Mode', 'FEC Score', 'ESG Score', 'Executive Score',
                'News Score', 'Numerical Score', 'LLM Score', 'Final Score', 'LLM Prompt'
            ])

            # Write each company's data
            for ticker, data in self.all_calculations.get(persona, {}).items():
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


# ============================================================
# 主类
# ============================================================

class EnhancedRankingGenerator:
    """Enhanced company ranking生成器"""

    def __init__(self, test_mode: bool = False):
        """初始化"""
        # 初始化 Firebase
        if not firebase_admin._apps:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        self.test_mode = test_mode

        # 初始化 DetailedCalculationLogger
        # Go up 3 levels: script -> company-ranking -> scripts -> Stanse
        log_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'logs',
            'company-ranking'
        )
        self.logger = DetailedCalculationLogger(log_dir)
        print(f"✅ Detailed calculation logger initialized (log_dir: {log_dir})")

        # 初始化 Gemini API (从Secret Manager获取API key)
        print(f"✅ Firebase initialized (project: stanseproject)")
        print(f"🔑 Fetching Gemini API key from Secret Manager...")
        api_key = get_gemini_api_key()

        if api_key:
            try:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-2.5-flash')
                self.use_llm = True
                print(f"✅ Gemini API initialized (model: gemini-2.5-flash)")
            except Exception as e:
                print(f"⚠️  Gemini API initialization failed: {e}")
                print(f"⚠️  LLM enhancement disabled - using persona-aware numerical scoring only")
                self.use_llm = False
                self.model = None
        else:
            print(f"⚠️  Could not get API key - LLM enhancement disabled")
            print(f"⚠️  Using persona-aware numerical scoring only")
            self.use_llm = False
            self.model = None

        if test_mode:
            print(f"🧪 Test mode: will only process first 10 companies")

    def fetch_company_data(self, ticker: str) -> Dict[str, Any]:
        """获取单个公司的所有数据"""
        data = {
            'ticker': ticker,
            'fec_data': None,
            'esg_data': None,
            'executive_data': None,
            'news_data': None
        }

        try:
            # FEC data
            fec_ref = self.db.collection('company_rankings_by_ticker').document(ticker)
            fec_doc = fec_ref.get()
            if fec_doc.exists:
                data['fec_data'] = fec_doc.to_dict().get('fec_data')

            # ESG data
            esg_ref = self.db.collection('company_esg_by_ticker').document(ticker)
            esg_doc = esg_ref.get()
            if esg_doc.exists:
                data['esg_data'] = esg_doc.to_dict().get('summary')

            # Executive data
            exec_ref = self.db.collection('company_executive_statements_by_ticker').document(ticker)
            exec_doc = exec_ref.get()
            if exec_doc.exists:
                data['executive_data'] = exec_doc.to_dict().get('analysis')

            # News data
            news_ref = self.db.collection('company_news_by_ticker').document(ticker)
            news_doc = news_ref.get()
            if news_doc.exists:
                data['news_data'] = news_doc.to_dict().get('articles')

        except Exception as e:
            print(f"  ⚠️  Error fetching data for {ticker}: {e}")

        return data

    def calculate_fec_score_persona_aware(
        self,
        fec_data: Optional[Dict[str, Any]],
        stance_type: str
    ) -> Optional[float]:
        """
        计算FEC donation alignment score (100%匹配TypeScript)
        对应 personaAwareScoring.ts 的 calculateFECScorePersonaAware

        ENHANCED: Uses nested party_totals structure, political_lean_score, donation diversity
        """
        # ✓ FIXED: Check nested party_totals structure (matching TypeScript)
        if not fec_data or not fec_data.get('party_totals') or not fec_data.get('total_usd') or fec_data['total_usd'] == 0:
            return None

        config = PERSONA_CONFIGS[stance_type]['fec']

        # ✓ FIXED: Access nested party_totals fields (matching TypeScript)
        party_totals = fec_data.get('party_totals', {})
        dem_amount = party_totals.get('DEM', {}).get('total_amount_usd', 0)
        rep_amount = party_totals.get('REP', {}).get('total_amount_usd', 0)
        total_amount = fec_data.get('total_usd', 1)

        dem_ratio = dem_amount / total_amount if total_amount > 0 else 0
        rep_ratio = rep_amount / total_amount if total_amount > 0 else 0

        # Base score from party alignment
        if config['partyPreference'] > 0:
            # Prefer Democratic donations
            alignment_score = dem_ratio * 100 * config['partyPreference']
        elif config['partyPreference'] < 0:
            # Prefer Republican donations
            alignment_score = rep_ratio * 100 * abs(config['partyPreference'])
        else:
            # Neutral - prefer balance
            alignment_score = 50 + (abs(dem_ratio - 0.5)) * 100

        # Factor in total donation amount (anti-establishment adjustment)
        total_amount_usd = total_amount
        amount_penalty = min(20, (total_amount_usd / 1000000) * config['amountSensitivity'] * 10)

        # Final score: alignment - penalty + baseline
        final_score = alignment_score - amount_penalty + 20

        # ENHANCEMENT: Use political_lean_score if available (matching TypeScript)
        if fec_data.get('political_lean_score') is not None:
            lean_score = fec_data['political_lean_score']
            # lean_score ranges from -100 (very Republican) to +100 (very Democratic)
            if config['partyPreference'] > 0:
                # Democratic preference: normalize lean_score to 0-100 scale
                final_score = final_score * 0.8 + ((lean_score + 100) / 2) * 0.2
            elif config['partyPreference'] < 0:
                # Republican preference: invert lean_score
                final_score = final_score * 0.8 + ((100 - lean_score) / 2) * 0.2

        # ENHANCEMENT: Factor in donation distribution diversity (matching TypeScript)
        if party_totals and len(party_totals) > 0:
            party_count = len(party_totals)
            # Neutral personas like diversity
            if abs(config['partyPreference']) < 0.3:
                diversity_bonus = min(5, party_count * 2)
                final_score += diversity_bonus
            else:
                # Partisan personas penalize multi-party donations
                if party_count > 2:
                    final_score -= 3

        return min(100, max(0, final_score))

    def calculate_esg_score_persona_aware(
        self,
        esg_data: Optional[Dict[str, Any]],
        stance_type: str
    ) -> Optional[float]:
        """
        计算ESG alignment score (100%匹配TypeScript)
        对应 personaAwareScoring.ts 的 calculateESGScorePersonaAware

        ENHANCED: Uses progressive_lean_score, industry-relative scoring
        """
        if not esg_data or (
            esg_data.get('environmentalScore') is None and
            esg_data.get('socialScore') is None and
            esg_data.get('governanceScore') is None
        ):
            return None

        config = PERSONA_CONFIGS[stance_type]['esg']

        # Use default 50 for missing sub-scores
        env_score = esg_data.get('environmentalScore', 50)
        soc_score = esg_data.get('socialScore', 50)
        gov_score = esg_data.get('governanceScore', 50)

        # Calculate weighted ESG score based on persona preferences
        total_weight = (config['environmentalWeight'] +
                       config['socialWeight'] +
                       config['governanceWeight'])

        weighted_esg = (
            env_score * config['environmentalWeight'] +
            soc_score * config['socialWeight'] +
            gov_score * config['governanceWeight']
        ) / total_weight

        # Apply persona preference direction
        if config['preferHighESG']:
            # High ESG is good: directly use weighted score
            final_score = weighted_esg * config['esgImportance'] + 50 * (1 - config['esgImportance'])
        else:
            # High ESG is bad (anti-regulation stance): invert
            inverted_esg = 100 - weighted_esg
            final_score = inverted_esg * config['esgImportance'] + 50 * (1 - config['esgImportance'])

        # ENHANCEMENT 1: progressive_lean_score for progressive/socialist personas (matching TypeScript)
        if esg_data.get('progressive_lean_score') is not None:
            if stance_type.startswith('progressive') or stance_type.startswith('socialist'):
                final_score = final_score * 0.7 + esg_data['progressive_lean_score'] * 0.3

        # ENHANCEMENT 2: Industry-relative scoring (matching TypeScript)
        if esg_data.get('industrySectorAvg', {}).get('ESGScore') and esg_data.get('ESGScore'):
            industry_avg = esg_data['industrySectorAvg']['ESGScore']
            company_score = esg_data['ESGScore']
            relative_performance = ((company_score - industry_avg) / industry_avg) * 100
            relative_bonus = max(-5, min(5, relative_performance / 4))
            if config['preferHighESG']:
                final_score += relative_bonus
            else:
                final_score -= relative_bonus

        return min(100, max(0, final_score))

    def calculate_executive_score_persona_aware(
        self,
        exec_data: Optional[Dict[str, Any]],
        stance_type: str
    ) -> Optional[float]:
        """
        计算Executive statements alignment score (100%匹配TypeScript)
        对应 personaAwareScoring.ts 的 calculateExecutiveScorePersonaAware

        ENHANCED: sentiment_analysis + social_responsibility fields integration
        """
        if not exec_data or not exec_data.get('has_executive_statements'):
            return None

        config = PERSONA_CONFIGS[stance_type]['executive']

        # Check if we have a political stance analysis
        political_stance = exec_data.get('political_stance', {})
        confidence = political_stance.get('confidence', 0)

        # If confidence is too low, fall back to neutral
        if confidence < config['confidenceThreshold']:
            return 50.0  # Low confidence - neutral score

        # Check if executive's leaning matches persona's preferred leanings
        executive_leaning = (political_stance.get('overall_leaning') or '').lower()
        matches_preference = any(
            preferred.lower() in executive_leaning
            for preferred in config['preferredLeanings']
        )

        # Use recommendation_score if available, otherwise calculate from alignment
        base_score = exec_data.get('recommendation_score', 50)

        # Adjust based on alignment with persona
        if matches_preference:
            # Boost score if executive aligns with persona
            base_score = min(100, base_score + 15)
        elif executive_leaning and executive_leaning != 'moderate':
            # Penalize if executive clearly opposes persona
            base_score = max(0, base_score - 15)

        # ENHANCEMENT 1: sentiment_analysis fields (matching TypeScript)
        if exec_data.get('sentiment_analysis'):
            sentiment = exec_data['sentiment_analysis']

            # Controversy level
            if sentiment.get('controversy_level') is not None:
                controversy_level = sentiment['controversy_level']
                if 'socialist' in stance_type or 'nationalist' in stance_type:
                    # Socialist/nationalist personas may view controversy positively (anti-establishment)
                    base_score += min(5, controversy_level * 0.5)
                elif stance_type == 'capitalist-globalist':
                    # Capitalist-globalist penalizes controversy heavily
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

        # ENHANCEMENT 2: social_responsibility fields (matching TypeScript)
        if exec_data.get('social_responsibility'):
            social_resp = exec_data['social_responsibility']

            # Labor practices score
            if social_resp.get('labor_practices_score') is not None:
                if 'progressive' in stance_type or 'socialist' in stance_type:
                    # Progressive/socialist personas strongly value labor practices
                    labor_bonus = ((social_resp['labor_practices_score'] - 50) / 50) * 8
                    base_score += labor_bonus

            # Community engagement score
            if social_resp.get('community_engagement_score') is not None:
                if 'nationalist' in stance_type:
                    # Nationalist personas value community/local engagement
                    comm_bonus = ((social_resp['community_engagement_score'] - 50) / 50) * 6
                    base_score += comm_bonus

            # Diversity & inclusion score
            if social_resp.get('diversity_inclusion_score') is not None:
                if 'progressive' in stance_type:
                    # Progressive personas strongly value diversity
                    di_bonus = ((social_resp['diversity_inclusion_score'] - 50) / 50) * 10
                    base_score += di_bonus
                elif 'conservative' in stance_type:
                    # Conservative personas may penalize high D&I focus
                    di_penalty = ((social_resp['diversity_inclusion_score'] - 50) / 50) * -2
                    base_score += di_penalty

        return min(100, max(0, base_score))

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

        # Keyword lists (matching TypeScript)
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
                # Handle ISO format with 'Z' timezone
                if 'Z' in published_date_str:
                    published_date = datetime.fromisoformat(published_date_str.replace('Z', '+00:00')).timestamp() * 1000
                else:
                    published_date = datetime.fromisoformat(published_date_str).timestamp() * 1000
            except:
                published_date = 0

            if published_date > one_week_ago:
                recent_count += 1
            elif published_date > one_month_ago:
                month_count += 1
            else:
                older_count += 1

            # Analyze content for keywords
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

        # Calculate recency score (recent articles weighted highest)
        total_articles = len(news_data)
        recency_score = (recent_count * 100 + month_count * 60 + older_count * 30) / max(1, total_articles)

        # Calculate sentiment score with persona-specific adjustments
        total_keywords = controversial_keyword_count + positive_keyword_count + negative_keyword_count
        sentiment_score = 50

        if total_keywords > 0:
            positive_ratio = positive_keyword_count / total_keywords
            negative_ratio = negative_keyword_count / total_keywords
            controversial_ratio = controversial_keyword_count / total_keywords

            # Base sentiment from keyword ratios
            sentiment_score = 50 + (positive_ratio - negative_ratio) * 50

            # Persona-specific adjustments
            if config['sentimentPreference'] > 0:
                # Persona prefers positive news
                sentiment_score += positive_ratio * 20
                sentiment_score -= controversial_ratio * 10
            elif config['sentimentPreference'] < 0:
                # Persona prefers critical/controversial news
                sentiment_score += controversial_ratio * 15
                sentiment_score -= positive_ratio * 5
            else:
                # Neutral persona values balanced coverage
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

        # Persona-specific volume adjustments
        if 'globalist' in stance_type:
            volume_score *= 1.1  # Globalists value more news coverage
        elif 'nationalist' in stance_type:
            volume_score *= 0.95  # Nationalists slightly less concerned about volume

        # Combine: 40% recency + 40% sentiment + 20% volume
        final_score = (recency_score * 0.4 + sentiment_score * 0.4 + volume_score * 0.2)

        # Weight by importance (blend with neutral 50 based on newsImportance)
        final_score = final_score * config['newsImportance'] + 50 * (1 - config['newsImportance'])

        return min(100, max(0, final_score))

    def calculate_dynamic_weights(self, data_availability: Dict[str, bool]) -> Dict[str, float]:
        """
        计算动态权重 (100%匹配TypeScript)
        对应 personaAwareScoring.ts 的 calculateDynamicWeights
        """
        # Original target weights when all data is available
        TARGET_WEIGHTS = {
            'fec': 0.4,       # 40% FEC
            'esg': 0.3,       # 30% ESG
            'executive': 0.2, # 20% Executive
            'news': 0.1,      # 10% News
        }

        # Track which sources are available
        available_sources = []
        total_available_weight = 0

        if data_availability.get('hasFEC'):
            available_sources.append('fec')
            total_available_weight += TARGET_WEIGHTS['fec']
        if data_availability.get('hasESG'):
            available_sources.append('esg')
            total_available_weight += TARGET_WEIGHTS['esg']
        if data_availability.get('hasExecutive'):
            available_sources.append('executive')
            total_available_weight += TARGET_WEIGHTS['executive']
        if data_availability.get('hasNews'):
            available_sources.append('news')
            total_available_weight += TARGET_WEIGHTS['news']

        # No data available - return zeros
        if len(available_sources) == 0:
            return {'fec': 0, 'esg': 0, 'executive': 0, 'news': 0}

        # Redistribute weights proportionally
        weights = {'fec': 0, 'esg': 0, 'executive': 0, 'news': 0}

        for source in available_sources:
            # Normalize: (target_weight / total_available_weight)
            weights[source] = TARGET_WEIGHTS[source] / total_available_weight

        return weights

    def calculate_persona_aware_score(
        self,
        company_data: Dict[str, Any],
        stance_type: str
    ) -> Dict[str, Any]:
        """
        计算persona-aware分数 (100%匹配TypeScript)
        对应 personaAwareScoring.ts 的 calculatePersonaAwareScore

        返回：
        {
            'fec_score': float | None,
            'esg_score': float | None,
            'executive_score': float | None,
            'news_score': float | None,
            'numerical_score': float,  # 动态权重平均分
            'has_data': bool,
            'data_source_count': int,
            'used_weights': dict
        }
        """
        # Calculate individual scores (returns None if no data)
        fec_score = self.calculate_fec_score_persona_aware(
            company_data.get('fec_data'), stance_type
        )
        esg_score = self.calculate_esg_score_persona_aware(
            company_data.get('esg_data'), stance_type
        )
        executive_score = self.calculate_executive_score_persona_aware(
            company_data.get('executive_data'), stance_type
        )
        news_score = self.calculate_news_score_persona_aware(
            company_data.get('news_data'), stance_type
        )

        # Track data availability
        data_availability = {
            'hasFEC': fec_score is not None,
            'hasESG': esg_score is not None,
            'hasExecutive': executive_score is not None,
            'hasNews': news_score is not None,
        }

        data_source_count = sum(data_availability.values())
        has_any_data = data_source_count > 0

        # Calculate dynamic weights
        used_weights = self.calculate_dynamic_weights(data_availability)

        # Calculate weighted numerical score
        numerical_score = 0

        if fec_score is not None:
            numerical_score += fec_score * used_weights['fec']
        if esg_score is not None:
            numerical_score += esg_score * used_weights['esg']
        if executive_score is not None:
            numerical_score += executive_score * used_weights['executive']
        if news_score is not None:
            numerical_score += news_score * used_weights['news']

        # If no data at all, default to neutral 50
        if not has_any_data:
            numerical_score = 50

        return {
            'fec_score': fec_score,
            'esg_score': esg_score,
            'executive_score': executive_score,
            'news_score': news_score,
            'numerical_score': numerical_score,
            'has_data': has_any_data,
            'data_source_count': data_source_count,
            'used_weights': used_weights
        }

    def calculate_llm_comprehensive_score(
        self,
        ticker: str,
        company_name: str,
        company_data: Dict[str, Any],
        stance_type: str
    ) -> Tuple[float, str, str]:
        """使用LLM计算综合分数

        Returns:
            Tuple[float, str, str]: (score, reasoning, prompt)
        """

        # 检查是否有任何数据
        has_any_data = any([company_data.get('fec_data'), company_data.get('esg_data'),
                           company_data.get('executive_data'), company_data.get('news_data')])

        # 构建数据摘要
        fec_data = company_data.get('fec_data')
        esg_data = company_data.get('esg_data')
        exec_data = company_data.get('executive_data')
        news_data = company_data.get('news_data')

        fec_summary = f"FEC Donations: Total ${fec_data.get('total_amount', 0):,.0f}, Democrat: ${fec_data.get('dem_amount', 0):,.0f}, Republican: ${fec_data.get('rep_amount', 0):,.0f}" if fec_data else "FEC Donations: No data"

        esg_summary = f"ESG Scores: Environmental: {esg_data.get('environmentalScore', 'N/A')}, Social: {esg_data.get('socialScore', 'N/A')}, Governance: {esg_data.get('governanceScore', 'N/A')}" if esg_data else "ESG Scores: No data"

        exec_summary = f"Executive Analysis: Political stance: {exec_data.get('political_stance', {}).get('overall_leaning', 'unknown')}, Confidence: {exec_data.get('political_stance', {}).get('confidence', 0)}%" if exec_data and exec_data.get('has_executive_statements') else "Executive Analysis: No statements"

        news_summary = f"Recent News: {len(news_data)} articles available" if news_data else "Recent News: No data"

        # Stance描述
        stance_descriptions = {
            'progressive-globalist': 'Left-leaning economics, Progressive social values, Pro-international cooperation',
            'progressive-nationalist': 'Left-leaning economics, Progressive social values, Domestic focus',
            'socialist-libertarian': 'Left economics, Traditional social values, International cooperation',
            'socialist-nationalist': 'Left economics, Traditional social values, Strong nationalism',
            'capitalist-globalist': 'Free market, Progressive social values, Global trade',
            'capitalist-nationalist': 'Free market, Progressive social values, America First',
            'conservative-globalist': 'Free market, Traditional social values, International trade',
            'conservative-nationalist': 'Free market, Traditional social values, Domestic priority'
        }

        # 构建prompt (根据数据可用性调整)
        if has_any_data:
            # 有数据: 基于数据分析
            prompt = f"""
You are analyzing {company_name} ({ticker}) for alignment with this political/values profile:
{stance_descriptions[stance_type]}

Available Data:
- {fec_summary}
- {esg_summary}
- {exec_summary}
- {news_summary}

Based on ALL the data above, provide a comprehensive alignment score (0-100) where:
- 100 = Perfectly aligned with the values profile
- 50 = Neutral or mixed signals
- 0 = Completely opposed to the values profile

Respond in this EXACT format:
SCORE: [0-100]
REASONING: [Brief 1-sentence explanation combining insights from FEC, ESG, Executive, and News data]
"""
        else:
            # 无数据: 基于LLM训练知识评估
            prompt = f"""
You are analyzing {company_name} for alignment with this political/values profile:
{stance_descriptions[stance_type]}

NOTE: No structured data (FEC donations, ESG scores, executive statements, or recent news) is available for this company.
Please use your general knowledge about this company to provide an assessment.

Consider:
- The company's public reputation and known political/social stances
- Industry sector and typical practices
- Known controversies or positive initiatives
- Corporate culture and values (if publicly known)

Provide a comprehensive alignment score (0-100) where:
- 100 = Perfectly aligned with the values profile
- 50 = Neutral or unknown
- 0 = Completely opposed to the values profile

Respond in this EXACT format:
SCORE: [0-100]
REASONING: [Brief explanation based on general knowledge about this company]
"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3,
                )
            )

            raw_text = response.text

            # 解析分数和理由
            score_match = raw_text.find('SCORE:')
            reasoning_match = raw_text.find('REASONING:')

            if score_match != -1 and reasoning_match != -1:
                score_text = raw_text[score_match+6:reasoning_match].strip()
                reasoning_text = raw_text[reasoning_match+10:].strip().split('\n')[0]

                try:
                    score = float(score_text)
                    score = max(0, min(100, score))
                except:
                    score = 50.0

                reasoning = reasoning_text if reasoning_text else 'LLM analysis completed'
            else:
                score = 50.0
                reasoning = 'Could not parse LLM response'

            return score, reasoning, prompt

        except Exception as e:
            print(f"  ⚠️  LLM error for {ticker}: {e}")
            return 50.0, 'LLM analysis failed', prompt

    def _process_single_company(self, ticker: str, stance_type: str) -> Dict[str, Any]:
        """处理单个公司的评分计算 (用于并行处理)"""
        # 获取公司数据
        company_data = self.fetch_company_data(ticker)

        # Method A: Numerical scoring
        numerical_result = self.calculate_persona_aware_score(company_data, stance_type)

        # Method B: LLM comprehensive scoring (optional)
        llm_prompt = None
        if self.use_llm:
            llm_score, llm_reasoning, llm_prompt = self.calculate_llm_comprehensive_score(
                ticker,
                ticker,  # 使用ticker作为名称（实际应该查找公司全名）
                company_data,
                stance_type
            )
            # Combined score
            if numerical_result['has_data']:
                total_score = (numerical_result['numerical_score'] + llm_score) / 2
            else:
                total_score = llm_score
        else:
            # LLM disabled - use numerical scoring only
            llm_score = None
            llm_reasoning = "LLM disabled - using numerical scoring only"
            llm_prompt = "LLM disabled - no prompt generated"
            total_score = numerical_result['numerical_score'] if numerical_result['has_data'] else 50.0

        # 📊 Log detailed calculation to DetailedCalculationLogger
        if numerical_result['has_data']:
            # AI-data mode: log all component scores
            self.logger.log_ai_data_calculation(
                persona=stance_type,
                ticker=ticker,
                fec_score=numerical_result['fec_score'],
                esg_score=numerical_result['esg_score'],
                exec_score=numerical_result['executive_score'],
                news_score=numerical_result['news_score'],
                numerical_score=numerical_result['numerical_score'],
                llm_score=llm_score,
                final_score=total_score,
                llm_prompt=llm_prompt
            )
        else:
            # LLM-only mode: log prompt
            llm_prompt_summary = f"Stance: {stance_type}, Company: {ticker}, Reasoning: {llm_reasoning}"
            self.logger.log_llm_only_calculation(
                persona=stance_type,
                ticker=ticker,
                llm_score=llm_score,
                llm_prompt=llm_prompt if llm_prompt else llm_prompt_summary
            )

        return {
            'ticker': ticker,
            'name': ticker,  # 实际应该是公司全名
            'sector': get_company_sector(ticker),  # 从TICKER_TO_SECTOR获取
            'score': round(total_score, 1),
            'numerical_score': numerical_result['numerical_score'],
            'llm_score': llm_score,
            'llm_reasoning': llm_reasoning,
            'has_data': numerical_result['has_data']
        }

    def generate_ranking_for_persona(self, stance_type: str) -> Dict[str, Any]:
        """为单个persona生成排名 (使用并行处理)"""

        print(f"\n{'='*60}")
        print(f"🎯 Generating ranking for: {stance_type}")
        print(f"{'='*60}")

        # 确定要处理的公司列表
        tickers = SP500_TICKERS[:10] if self.test_mode else SP500_TICKERS

        # 使用ThreadPoolExecutor并行处理所有公司
        print(f"🚀 Processing {len(tickers)} companies in parallel...")
        company_scores = []

        with ThreadPoolExecutor(max_workers=20) as executor:
            # 提交所有任务
            future_to_ticker = {
                executor.submit(self._process_single_company, ticker, stance_type): ticker
                for ticker in tickers
            }

            # 收集结果
            completed = 0
            for future in as_completed(future_to_ticker):
                ticker = future_to_ticker[future]
                try:
                    result = future.result()
                    company_scores.append(result)
                    completed += 1
                    print(f"[{completed}/{len(tickers)}] ✓ {ticker}: {result['score']:.1f}")
                except Exception as e:
                    print(f"[{completed}/{len(tickers)}] ✗ {ticker}: Error - {e}")
                    completed += 1

        # 按分数排序
        company_scores.sort(key=lambda x: x['score'], reverse=True)

        # 获取top 5 support和bottom 5 oppose
        support_companies = company_scores[:5]
        oppose_companies = list(reversed(company_scores[-5:]))

        print(f"\n✅ Top 5 to Support:")
        for i, c in enumerate(support_companies, 1):
            print(f"  {i}. {c['ticker']} - Score: {c['score']}")

        print(f"\n❌ Top 5 to Oppose:")
        for i, c in enumerate(oppose_companies, 1):
            print(f"  {i}. {c['ticker']} - Score: {c['score']}")

        # 📊 Export detailed calculation logs for this persona
        try:
            json_file = self.logger.export_json(stance_type)
            csv_file = self.logger.export_csv(stance_type)
            print(f"\n📊 Detailed calculation logs exported:")
            print(f"  JSON: {json_file}")
            print(f"  CSV:  {csv_file}")
        except Exception as e:
            print(f"\n⚠️  Warning: Failed to export logs: {e}")

        return {
            'stanceType': stance_type,
            'supportCompanies': [
                {
                    'symbol': c['ticker'],
                    'name': c['name'],
                    'sector': c['sector'],
                    'score': int(c['score']),
                    'reasoning': f"[AI-Data] Numerical={c['numerical_score']:.1f}, LLM={'N/A' if c['llm_score'] is None else '{:.1f}'.format(c['llm_score'])} | {c['llm_reasoning']}"
                }
                for c in support_companies
            ],
            'opposeCompanies': [
                {
                    'symbol': c['ticker'],
                    'name': c['name'],
                    'sector': c['sector'],
                    'score': int(c['score']),
                    'reasoning': f"[AI-Data] Numerical={c['numerical_score']:.1f}, LLM={'N/A' if c['llm_score'] is None else '{:.1f}'.format(c['llm_score'])} | {c['llm_reasoning']}"
                }
                for c in oppose_companies
            ]
        }

    def calculate_single_company_score(
        self,
        company_identifier: str,
        stance_type: str
    ) -> Dict[str, Any]:
        """
        为单个公司（包括非S&P 500）计算persona-aware分数

        工作流程:
        1. 尝试从Firebase获取FEC/ESG/Executive/News数据
        2. 如果数据不足，更依赖LLM进行综合分析
        3. 返回评分结果（不保存到enhanced_company_rankings）

        Args:
            company_identifier: ticker符号或公司名称
            stance_type: 政治立场类型

        Returns:
            详细的评分结果字典
        """
        print(f"\n{'='*60}")
        print(f"🎯 Calculating score for: {company_identifier}")
        print(f"   Persona: {stance_type}")
        print(f"{'='*60}")

        # Step 1: 尝试获取Firebase数据
        print(f"\n📥 Fetching data from Firebase...")
        company_data = self.fetch_company_data(company_identifier)

        has_fec = company_data.get('fec_data') is not None
        has_esg = company_data.get('esg_data') is not None
        has_exec = company_data.get('executive_data') is not None
        has_news = company_data.get('news_data') is not None

        print(f"   FEC data: {'✅' if has_fec else '❌'}")
        print(f"   ESG data: {'✅' if has_esg else '❌'}")
        print(f"   Executive data: {'✅' if has_exec else '❌'}")
        print(f"   News data: {'✅' if has_news else '❌'}")

        # Step 2: 计算numerical score
        print(f"\n📊 Calculating persona-aware numerical score...")
        numerical_result = self.calculate_persona_aware_score(company_data, stance_type)

        # Step 3: LLM comprehensive scoring
        llm_score = None
        llm_reasoning = None
        llm_prompt = None

        if self.use_llm:
            print(f"🤖 Calling LLM for comprehensive analysis...")
            llm_score, llm_reasoning, llm_prompt = self.calculate_llm_comprehensive_score(
                company_identifier,
                company_identifier,
                company_data,
                stance_type
            )

            # ADAPTIVE WEIGHTING: 如果数据不足，LLM权重提高
            if numerical_result['has_data']:
                # 正常模式: 50% numerical + 50% LLM
                total_score = (numerical_result['numerical_score'] + llm_score) / 2
                calculation_mode = 'hybrid (50% numerical + 50% LLM)'
            else:
                # 数据不足模式: 100% LLM
                total_score = llm_score
                calculation_mode = 'LLM-only (100% LLM due to insufficient data)'
        else:
            print(f"⚠️  LLM disabled - using numerical scoring only")
            if numerical_result['has_data']:
                total_score = numerical_result['numerical_score']
                calculation_mode = 'numerical-only (no LLM)'
            else:
                total_score = 50.0
                calculation_mode = 'neutral (no data, no LLM)'
            llm_reasoning = "LLM disabled"
            llm_prompt = "LLM disabled - no prompt generated"

        # Step 4: 返回详细结果
        result = {
            'company_identifier': company_identifier,
            'stance_type': stance_type,
            'calculation_mode': calculation_mode,
            'data_availability': {
                'fec': has_fec,
                'esg': has_esg,
                'executive': has_exec,
                'news': has_news,
                'data_source_count': numerical_result['data_source_count']
            },
            'scores': {
                'fec_score': numerical_result['fec_score'],
                'esg_score': numerical_result['esg_score'],
                'executive_score': numerical_result['executive_score'],
                'news_score': numerical_result['news_score'],
                'numerical_score': numerical_result['numerical_score'],
                'llm_score': llm_score,
                'final_score': round(total_score, 1)
            },
            'llm_analysis': {
                'reasoning': llm_reasoning,
                'prompt': llm_prompt
            },
            'weights_used': numerical_result['used_weights']
        }

        # 打印结果
        print(f"\n{'='*60}")
        print(f"✅ Calculation Complete")
        print(f"{'='*60}")
        print(f"Final Score: {result['scores']['final_score']}")
        print(f"Calculation Mode: {calculation_mode}")
        print(f"Data Sources: {numerical_result['data_source_count']}/4")
        if llm_score:
            print(f"LLM Score: {llm_score:.1f}")
            print(f"LLM Reasoning: {llm_reasoning}")
        print(f"{'='*60}\n")

        return result

    def _send_ranking_generator_email(
        self,
        total_personas: int,
        successful_personas: int,
        failed_personas: List[str],
        duration: float,
        total_companies: int
    ):
        """发送ranking generator专用的email通知"""
        try:
            from email_notifier import get_sendgrid_api_key
            import requests

            sendgrid_api_key = get_sendgrid_api_key()
            if not sendgrid_api_key:
                print("⚠️  SENDGRID_API_KEY not found, skipping email")
                return

            recipient_email = "lxu912@gmail.com"
            sender_email = "lxu912@gmail.com"

            minutes = int(duration // 60)
            seconds = int(duration % 60)
            time_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"

            subject = f"✅ Enhanced Rankings Generator - 成功完成 ({successful_personas}/{total_personas} personas, {total_companies} companies)"

            failed_list_html = ""
            if failed_personas:
                failed_items = "".join([f"<li>{p}</li>" for p in failed_personas])
                failed_list_html = f"""
                <h3 style="color: #ff9800;">⚠️ 失败的Personas ({len(failed_personas)})</h3>
                <ul>{failed_items}</ul>
                """

            html_body = f"""
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }}
                    h2 {{ color: #4CAF50; }}
                    .summary {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; }}
                    .summary p {{ margin: 8px 0; }}
                    .label {{ font-weight: bold; color: #333; }}
                </style>
            </head>
            <body>
                <h2>✅ Enhanced Company Rankings Generator 完成</h2>

                <div class="summary">
                    <p><span class="label">执行时间:</span> {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
                    <p><span class="label">耗时:</span> {time_str}</p>
                    <p><span class="label">处理的Personas:</span> {total_personas} personas</p>
                    <p><span class="label">处理的公司:</span> {total_companies} S&P 500 companies</p>
                    <p><span class="label">成功:</span> <span style="color: #4CAF50;">{successful_personas}/{total_personas} personas</span></p>
                    <p><span class="label">失败:</span> <span style="color: #f44336;">{len(failed_personas)} personas</span></p>
                    <p><span class="label">总评估数:</span> {total_personas * total_companies} evaluations ({total_companies} companies × {total_personas} personas)</p>
                </div>

                {failed_list_html}

                <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
                <p style="color: #666; font-size: 12px;">
                    This is an automated notification from Stanse Enhanced Company Ranking System.<br>
                    Project: gen-lang-client-0960644135 (Cloud Run) → stanseproject (Firebase)<br>
                    Collection: enhanced_company_rankings (8 personas with top 5 support/oppose lists)
                </p>
            </body>
            </html>
            """

            payload = {
                "personalizations": [{"to": [{"email": recipient_email}], "subject": subject}],
                "from": {"email": sender_email, "name": "Stanse Rankings"},
                "content": [{"type": "text/html", "value": html_body}]
            }

            response = requests.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {sendgrid_api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=10
            )

            if response.status_code == 202:
                print(f"✅ Success email sent to {recipient_email}")
            else:
                print(f"❌ Failed to send email: {response.status_code}")

        except Exception as e:
            print(f"⚠️  Error sending custom email: {e}")

    def save_ranking_to_firebase(self, ranking: Dict[str, Any]):
        """保存排名到Firebase（主文档 + 历史记录）"""

        stance_type = ranking['stanceType']

        # 生成时间戳
        now = datetime.utcnow()
        timestamp_str = now.strftime('%Y%m%d_%H%M%S')

        # 准备排名数据
        ranking_data = {
            'stanceType': stance_type,
            'opposeCompanies': ranking['opposeCompanies'],
            'supportCompanies': ranking['supportCompanies'],
            'updatedAt': now.isoformat() + 'Z',
            'expiresAt': (now + timedelta(hours=12)).isoformat() + 'Z',
            'version': '3.0'
        }

        try:
            # 1. 保存到history subcollection
            history_ref = self.db.collection('enhanced_company_rankings').document(stance_type).collection('history').document(timestamp_str)
            history_ref.set(ranking_data)
            print(f"  📦 Saved to history: enhanced_company_rankings/{stance_type}/history/{timestamp_str}")

            # 2. 更新主文档
            main_ref = self.db.collection('enhanced_company_rankings').document(stance_type)
            main_ref.set(ranking_data, merge=True)
            print(f"  ✅ Updated main doc: enhanced_company_rankings/{stance_type}")

        except Exception as e:
            print(f"  ❌ Error saving to Firebase: {e}")
            raise

    def run(self, specific_persona: Optional[str] = None):
        """运行完整的排名生成流程"""

        start_time = time.time()

        print(f"\n{'#'*60}")
        print(f"# ENHANCED COMPANY RANKINGS GENERATION")
        print(f"# Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'#'*60}\n")

        # 确定要处理的persona列表
        if specific_persona:
            if specific_persona not in STANCE_TYPES:
                raise ValueError(f"Invalid persona: {specific_persona}")
            personas = [specific_persona]
        else:
            personas = STANCE_TYPES

        print(f"📋 Will generate rankings for {len(personas)} persona(s):")
        for p in personas:
            print(f"  - {p}")

        # 为每个persona生成排名
        results = {}
        for persona in personas:
            try:
                ranking = self.generate_ranking_for_persona(persona)
                self.save_ranking_to_firebase(ranking)
                results[persona] = 'SUCCESS'
            except Exception as e:
                print(f"\n❌ Failed for {persona}: {e}")
                results[persona] = f'FAILED: {str(e)}'

        # 打印总结
        duration = time.time() - start_time

        # 统计成功和失败
        successful_personas = [p for p, s in results.items() if s == 'SUCCESS']
        failed_personas = [p for p, s in results.items() if s != 'SUCCESS']

        print(f"\n{'='*60}")
        print(f"✅ Generation Complete")
        print(f"{'='*60}")
        print(f"Duration: {duration:.1f}s ({duration/60:.1f} minutes)")
        print(f"Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"\n📊 Results:")
        for persona, status in results.items():
            emoji = '✅' if status == 'SUCCESS' else '❌'
            print(f"  {emoji} {persona}: {status}")
        print(f"{'='*60}\n")

        # 发送邮件通知和日志记录
        # 注意: total_companies参数实际上是personas数量，email中会显示为"公司"
        # 为了准确性，这里需要自定义email内容

        # 结构化日志记录
        log_completion_notification(
            job_name="Enhanced Company Rankings Generator",
            total_companies=len(personas),
            successful_companies=len(successful_personas),
            failed_companies=failed_personas,
            execution_time_seconds=duration
        )

        # 如果是生产运行（全部8个personas），发送自定义email通知
        if not specific_persona:
            # 使用自定义的ranking generator email
            self._send_ranking_generator_email(
                total_personas=len(personas),
                successful_personas=len(successful_personas),
                failed_personas=failed_personas,
                duration=duration,
                total_companies=125 if not self.test_mode else 10
            )


# ============================================================
# 主函数
# ============================================================

def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description='Generate enhanced company rankings for all personas')
    parser.add_argument(
        '--persona',
        type=str,
        choices=STANCE_TYPES,
        help='Generate ranking for specific persona only'
    )
    parser.add_argument(
        '--test',
        action='store_true',
        help='Test mode: only process first 10 companies'
    )
    parser.add_argument(
        '--company',
        type=str,
        help='Calculate score for a single company (ticker or name). Requires --persona. Example: --company AAPL or --company "Chick-fil-A"'
    )

    args = parser.parse_args()

    # 创建生成器
    generator = EnhancedRankingGenerator(test_mode=args.test)

    # 单公司计算模式
    if args.company:
        if not args.persona:
            print("❌ Error: --company requires --persona to be specified")
            sys.exit(1)

        result = generator.calculate_single_company_score(
            company_identifier=args.company,
            stance_type=args.persona
        )

        # 输出JSON格式结果
        print("\n📋 Result (JSON):")
        print(json.dumps(result, indent=2))

    # 批量生成模式
    else:
        generator.run(specific_persona=args.persona)


if __name__ == "__main__":
    main()
