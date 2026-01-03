#!/usr/bin/env python3
"""
Executive Statement Analysis using Gemini API

使用 Gemini AI 分析 CEO/高管/所有者/投资人的公开言论
分析内容: 政治立场、情感倾向、社会责任态度等

输入: company_news_by_ticker/{ticker} (来自 Polygon News)
输出: company_executive_statements_by_ticker/{ticker}

运行方式:
    export GEMINI_API_KEY=your_api_key  # 或从 Google Secret Manager 获取
    python3 04-analyze-executive-statements.py

Gemini API 文档:
    - Google AI Studio: https://aistudio.google.com/
    - API Reference: https://ai.google.dev/api/python/google/generativeai
"""

import os
import sys
import json
import subprocess
from datetime import datetime
from typing import Dict, List, Any, Optional
import firebase_admin
from firebase_admin import credentials, firestore
import requests
import time

# 添加项目根目录到 path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 导入邮件通知模块
sys.path.insert(0, SCRIPT_DIR)
from email_notifier import log_completion_notification, send_success_email

# Import from unified data module
from pathlib import Path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from data.sp500Companies import SP500_TICKERS

# 专业的 Prompt Template - 用于分析高管言论
EXECUTIVE_ANALYSIS_PROMPT_TEMPLATE = """You are a professional political and social analyst specializing in corporate executive communications.

Analyze the following news articles about **{company_name} ({ticker})** and its executives (CEO, CFO, founders, major investors, board members, or other leadership).

**Your Task:**
1. Identify any direct quotes, statements, or public positions from company executives
2. Analyze the political stance, social responsibility attitude, and sentiment
3. Provide a comprehensive assessment of the company's leadership values

**News Articles:**
{news_content}

**Analysis Framework:**
Please provide your analysis in the following JSON format (respond ONLY with valid JSON, no additional text):

```json
{{
  "has_executive_statements": true/false,
  "company_name": "{company_name}",
  "ticker": "{ticker}",
  "analysis_date": "{analysis_date}",
  "executives_mentioned": [
    {{
      "name": "Full Name",
      "role": "CEO/CFO/Founder/Investor/Board Member",
      "statement_summary": "Brief summary of their statement or position"
    }}
  ],
  "political_stance": {{
    "overall_leaning": "progressive/moderate/conservative/neutral/unknown",
    "confidence": 0-100,
    "evidence": ["具体引用或证据1", "具体引用或证据2"],
    "key_issues": [
      {{
        "issue": "气候变化/移民/税收/劳工权益等",
        "position": "支持/反对/中立",
        "strength": 0-100
      }}
    ]
  }},
  "social_responsibility": {{
    "environmental_score": 0-100,
    "social_justice_score": 0-100,
    "diversity_inclusion_score": 0-100,
    "labor_rights_score": 0-100,
    "community_engagement_score": 0-100,
    "overall_score": 0-100,
    "evidence": ["Supporting evidence from statements"]
  }},
  "sentiment_analysis": {{
    "overall_sentiment": "very positive/positive/neutral/negative/very negative",
    "tone": "optimistic/pragmatic/cautious/defensive",
    "public_perception_risk": 0-100,
    "controversy_level": 0-100
  }},
  "key_themes": [
    "Innovation", "Sustainability", "Employee welfare", "Shareholder value", etc.
  ],
  "notable_quotes": [
    {{
      "executive": "Name",
      "quote": "Exact quote if available",
      "context": "Brief context",
      "significance": "Why this quote matters"
    }}
  ],
  "summary": "2-3 sentence executive summary of the company leadership's public stance and values",
  "recommendation_score": 0-100,
  "data_quality": {{
    "sources_count": 0,
    "recency_days": 0,
    "confidence_level": "high/medium/low"
  }}
}}
```

**Important Guidelines:**
- If NO executive statements are found in the articles, set `has_executive_statements: false` and use "unknown" or "neutral" for stance fields
- Only analyze statements from verified company executives (not analysts or journalists)
- Be objective and evidence-based in your analysis
- Consider both explicit statements and implicit positions
- Account for corporate PR language vs authentic positions
- Provide specific quotes or evidence whenever possible
- Scores should be normalized to 0-100 scale
- `recommendation_score` is a composite score where:
  - 80-100: Highly progressive/socially responsible leadership
  - 60-79: Moderately progressive/responsible
  - 40-59: Neutral or mixed signals
  - 20-39: Conservative or limited social responsibility
  - 0-19: Concerning stances or significant controversies

Respond with ONLY the JSON object, no additional commentary."""


class ExecutiveStatementAnalyzer:
    """使用 Gemini API 分析高管言论"""

    def __init__(self, credentials_path: Optional[str] = None):
        """初始化 Firebase 连接和 Gemini API"""
        # Firebase initialization
        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
            else:
                # 使用默认凭证（Cloud Run 环境）
                cred = credentials.ApplicationDefault()

            firebase_admin.initialize_app(cred, {
                'projectId': 'stanseproject'
            })

        self.db = firestore.client()
        print(f"✅ Firebase initialized (project: stanseproject)")

        # Gemini API configuration
        self.gemini_api_key = os.getenv('GEMINI_API_KEY')

        # 如果环境变量中没有，从 Google Secret Manager 获取
        if not self.gemini_api_key:
            try:
                print("🔑 Loading GEMINI_API_KEY from Secret Manager...")
                result = subprocess.run(
                    [
                        'gcloud', 'secrets', 'versions', 'access', 'latest',
                        '--secret', 'gemini-api-key',
                        '--project', 'gen-lang-client-0960644135'
                    ],
                    capture_output=True,
                    text=True,
                    check=True
                )
                self.gemini_api_key = result.stdout.strip()
                print("✅ GEMINI_API_KEY loaded from Secret Manager")
            except Exception as e:
                print(f"❌ Failed to load GEMINI_API_KEY from Secret Manager: {e}")
                print("   Please ensure:")
                print("   1. gcloud is installed and authenticated")
                print("   2. You have access to the secret in project gen-lang-client-0960644135")
                print("   3. Or set GEMINI_API_KEY environment variable manually")
                sys.exit(1)

        # Gemini API endpoint (using REST API for simplicity)
        # Updated to use gemini-2.5-flash (latest model as of Dec 2024)
        self.gemini_api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        print(f"✅ Gemini API key loaded")

    def fetch_news_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """从 Firestore 读取 Polygon 新闻数据"""
        try:
            doc_ref = self.db.collection('company_news_by_ticker').document(ticker)
            doc = doc_ref.get()

            if not doc.exists:
                print(f"  ⚠️  No news data found in Firestore")
                return None

            data = doc.to_dict()
            articles = data.get('articles', [])

            if not articles:
                print(f"  ⚠️  News data exists but no articles")
                return None

            print(f"  ✅ Found {len(articles)} articles")
            return data

        except Exception as e:
            print(f"  ❌ Error fetching news: {str(e)}")
            return None

    def prepare_news_content(self, articles: List[Dict]) -> str:
        """将新闻文章格式化为分析用的文本"""
        content_parts = []

        for i, article in enumerate(articles[:10], 1):  # 限制最多10篇文章避免prompt过长
            content_parts.append(f"""
Article {i}:
Title: {article.get('title', 'N/A')}
Author: {article.get('author', 'Unknown')}
Publisher: {article.get('publisher_name', 'Unknown')}
Published: {article.get('published_utc', 'N/A')}
Description: {article.get('description', 'N/A')}
URL: {article.get('article_url', 'N/A')}
---""")

        return "\n".join(content_parts)

    def analyze_with_gemini(self, ticker: str, company_name: str, news_content: str) -> Optional[Dict[str, Any]]:
        """
        使用 Gemini API 分析高管言论

        返回格式: JSON object with analysis results
        """
        # 构建 prompt
        prompt = EXECUTIVE_ANALYSIS_PROMPT_TEMPLATE.format(
            company_name=company_name,
            ticker=ticker,
            news_content=news_content,
            analysis_date=datetime.now().strftime('%Y-%m-%d')
        )

        # AMD 需要更大的 token limit
        max_tokens = 8192 if ticker == 'AMD' else 4096

        # Gemini API request body
        request_body = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.2,  # 低温度保证稳定输出
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": max_tokens,  # AMD 使用 8192，其他公司 4096
            }
        }

        try:
            response = requests.post(
                f"{self.gemini_api_url}?key={self.gemini_api_key}",
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()

            result = response.json()

            # 提取生成的文本
            if 'candidates' not in result or len(result['candidates']) == 0:
                print(f"  ⚠️  No response from Gemini API")
                return None

            generated_text = result['candidates'][0]['content']['parts'][0]['text']

            # 解析 JSON（Gemini 可能会在 JSON 外包含 markdown 代码块）
            # 尝试提取 ```json ... ``` 中的内容
            if '```json' in generated_text:
                json_start = generated_text.find('```json') + 7  # Skip past ```json
                json_end = generated_text.find('```', json_start)
                json_str = generated_text[json_start:json_end].strip()  # .strip() removes the newline
            elif '```' in generated_text:
                json_start = generated_text.find('```') + 3
                json_end = generated_text.find('```', json_start)
                json_str = generated_text[json_start:json_end].strip()
            else:
                json_str = generated_text.strip()

            # Robust JSON cleaning for Gemini responses
            import re

            # DEBUG: Print extracted JSON before cleaning
            #print(f"DEBUG - Raw extracted JSON:\n{json_str[:500]}\n")
            #print(f"DEBUG - JSON length: {len(json_str)}, ends with: {repr(json_str[-50:])}\n")

            # Check if JSON is properly closed (has matching braces)
            open_braces = json_str.count('{')
            close_braces = json_str.count('}')
            if open_braces > close_braces:
                # Add missing closing braces
                missing = open_braces - close_braces
                print(f"  DEBUG - JSON missing {missing} closing brace(s), adding them")
                json_str = json_str + ('\n}' * missing)

            # Remove trailing commas before closing braces/brackets (common Gemini issue)
            json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

            # Remove comments (// or #) which are not valid JSON
            json_str = re.sub(r'//.*?$', '', json_str, flags=re.MULTILINE)
            json_str = re.sub(r'#.*?$', '', json_str, flags=re.MULTILINE)

            # Remove any text before first { and after last }
            first_brace = json_str.find('{')
            last_brace = json_str.rfind('}')
            if first_brace != -1 and last_brace != -1:
                json_str = json_str[first_brace:last_brace+1]

            # DEBUG: Print cleaned JSON
            # print(f"DEBUG - Cleaned JSON:\n{json_str[:500]}\n")

            # Try to parse, if it fails, use a more aggressive approach
            try:
                analysis = json.loads(json_str)
            except json.JSONDecodeError as first_error:
                # DEBUG: Print where parse failed
                print(f"  DEBUG - First parse failed at position {first_error.pos}")
                print(f"  DEBUG - Context: {repr(json_str[max(0, first_error.pos-50):first_error.pos+50])}")

                # Try using json5-like parsing by fixing common issues
                json_str_fixed = json_str.replace("'", '"')  # Replace single quotes with double quotes
                json_str_fixed = re.sub(r',(\s*[}\]])', r'\1', json_str_fixed)  # Remove trailing commas again
                try:
                    analysis = json.loads(json_str_fixed)
                except json.JSONDecodeError as second_error:
                    # Print full JSON for debugging
                    print(f"  DEBUG - Full JSON that failed to parse:\n{json_str}")
                    # If still fails, raise the original error
                    raise first_error

            print(f"  ✅ Analysis complete")
            print(f"     Has statements: {analysis.get('has_executive_statements', False)}")
            print(f"     Political stance: {analysis.get('political_stance', {}).get('overall_leaning', 'unknown')}")
            print(f"     Recommendation score: {analysis.get('recommendation_score', 0)}/100")

            return analysis

        except requests.exceptions.Timeout:
            print(f"  ❌ Gemini API timeout")
            return None
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Gemini API error: {str(e)}")
            return None
        except json.JSONDecodeError as e:
            print(f"  ❌ Failed to parse Gemini response as JSON: {str(e)}")
            print(f"     Raw response: {generated_text[:200]}...")
            return None
        except Exception as e:
            print(f"  ❌ Unexpected error: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

    def save_to_firebase(self, ticker: str, analysis: Dict[str, Any]):
        """
        保存分析结果到 company_executive_statements_by_ticker collection

        数据结构:
        - 主文档: company_executive_statements_by_ticker/{ticker}
          - ticker: "AAPL"
          - company_name: "Apple Inc."
          - analyzed_at: "2025-12-27T..."
          - has_executive_statements: true/false
          - analysis: { ... } (完整分析结果)

        - 历史版本: company_executive_statements_by_ticker/{ticker}/history/{YYYYmmdd_HHMMSS}
        """
        now = datetime.now()
        timestamp_str = now.strftime('%Y%m%d_%H%M%S')

        # 构建完整文档
        doc_data = {
            'ticker': ticker,
            'company_name': analysis.get('company_name', ticker),
            'analyzed_at': now.isoformat(),
            'has_executive_statements': analysis.get('has_executive_statements', False),
            'analysis': analysis,
            'data_source': 'gemini_api',
            'model': 'gemini-2.5-flash'
        }

        doc_ref = self.db.collection('company_executive_statements_by_ticker').document(ticker)

        # 保存历史版本
        history_ref = doc_ref.collection('history').document(timestamp_str)
        history_ref.set(doc_data)
        print(f"  📦 Saved to history: {timestamp_str}")

        # 更新主文档
        doc_ref.set(doc_data, merge=True)
        print(f"  ✅ Saved to Firebase: company_executive_statements_by_ticker/{ticker}")

    def run(self, delay_between_requests: float = 2.0, tickers_to_process: Optional[List[str]] = None):
        """
        运行完整的高管言论分析流程

        参数:
            delay_between_requests: 请求之间的延迟（秒），避免 API 限流
            tickers_to_process: 可选的 ticker 列表，如果提供则只处理这些公司
        """
        start_time = time.time()

        # 如果指定了特定的 tickers，使用它们；否则使用完整列表
        tickers = tickers_to_process if tickers_to_process else SP500_TICKERS

        print(f"\n{'='*60}")
        print(f"🧠 Executive Statement Analysis (Gemini AI)")
        print(f"{'='*60}")
        print(f"📦 Total companies to process: {len(tickers)}")
        if tickers_to_process:
            print(f"📋 Processing specific tickers (retry mode)")
        print(f"⚙️  Delay between requests: {delay_between_requests}s")
        print(f"🕒 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        success_count = 0
        no_news_count = 0
        no_statements_count = 0
        error_count = 0
        failed_tickers = []

        for i, ticker in enumerate(tickers, 1):
            try:
                print(f"\n[{i}/{len(tickers)}] {ticker}")

                # 1. 读取新闻数据
                news_data = self.fetch_news_data(ticker)

                if not news_data:
                    no_news_count += 1
                    continue

                # 2. 准备分析内容
                articles = news_data.get('articles', [])
                news_content = self.prepare_news_content(articles)

                # 获取公司名称（如果新闻数据里没有，使用 ticker）
                company_name = ticker  # 可以从其他数据源获取完整公司名

                # 3. 使用 Gemini 分析
                analysis = self.analyze_with_gemini(ticker, company_name, news_content)

                if analysis:
                    # 4. 保存结果
                    self.save_to_firebase(ticker, analysis)

                    if analysis.get('has_executive_statements', False):
                        success_count += 1
                    else:
                        no_statements_count += 1
                else:
                    error_count += 1
                    failed_tickers.append(ticker)

                # 请求间延迟
                if i < len(tickers):
                    time.sleep(delay_between_requests)

            except Exception as e:
                print(f"\n  ❌ Unexpected error: {str(e)}")
                import traceback
                traceback.print_exc()
                error_count += 1
                failed_tickers.append(ticker)
                time.sleep(5)

        execution_time = time.time() - start_time

        # 打印汇总
        print(f"\n{'='*60}")
        print(f"✅ Executive Statement Analysis Complete")
        print(f"{'='*60}")
        print(f"✅ With Statements: {success_count}/{len(tickers)}")
        print(f"⚠️  No Statements Found: {no_statements_count}/{len(tickers)}")
        print(f"⚠️  No News Data: {no_news_count}/{len(tickers)}")
        print(f"❌ Errors: {error_count}/{len(tickers)}")
        print(f"🕒 Finished at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")

        # 发送完成通知（日志方式）
        log_completion_notification(
            job_name="Executive Statements Analyzer",
            total_companies=len(tickers),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )

        # 发送邮件通知
        send_success_email(
            job_name="Executive Statements Analyzer",
            total_companies=len(tickers),
            successful_companies=success_count,
            failed_companies=failed_tickers,
            execution_time_seconds=execution_time
        )


def main():
    credentials_path = os.getenv('FIREBASE_CREDENTIALS_PATH')
    tickers_file = None

    # 解析命令行参数
    if len(sys.argv) > 1:
        # 如果第一个参数是 .txt 文件，认为是 ticker 列表文件
        if sys.argv[1].endswith('.txt'):
            tickers_file = sys.argv[1]
        else:
            credentials_path = sys.argv[1]

    # 如果提供了 ticker 文件，读取它
    tickers_to_process = None
    if tickers_file:
        try:
            with open(tickers_file, 'r') as f:
                # 读取所有非空行，去除空格和换行符
                tickers_to_process = [
                    line.strip()
                    for line in f
                    if line.strip() and not line.strip().startswith('#')
                ]
            print(f"📋 Loaded {len(tickers_to_process)} tickers from {tickers_file}")
        except FileNotFoundError:
            print(f"❌ ERROR: Ticker file not found: {tickers_file}")
            sys.exit(1)

    # 创建分析器
    analyzer = ExecutiveStatementAnalyzer(credentials_path)

    # 运行分析
    # - Gemini API 免费层限制: 15 RPM (requests per minute)
    # - 设置 2 秒延迟: 30 requests/min (安全范围内)
    # - 如果是付费 API，可以缩短到 0.5-1 秒
    analyzer.run(delay_between_requests=2.0, tickers_to_process=tickers_to_process)


if __name__ == "__main__":
    main()
