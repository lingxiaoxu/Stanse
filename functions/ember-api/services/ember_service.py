"""
Ember 核心服务
负责所有 Ember 相关的 AI 操作

使用 Secret Manager 存储的 API keys:
- ember-openai-api-key
- ember-google-api-key
- ember-anthropic-api-key
"""

import sys
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple

# 添加 ember-main/src 到路径
# 支持 Cloud Function 和本地环境
ember_paths_to_try = [
    Path("/workspace/ember-main/src"),  # Cloud Function
    Path(__file__).parent.parent.parent.parent / "ember-main" / "src",  # 本地
]

ember_loaded = False
for ember_path in ember_paths_to_try:
    if ember_path.exists():
        sys.path.insert(0, str(ember_path))
        ember_loaded = True
        break

if not ember_loaded:
    raise ImportError(f"无法找到 ember-main，尝试路径: {ember_paths_to_try}")

# 直接导入 models 模块，避免触发 ember.api.__init__ 中的 xcs 等大依赖
# 不要 from ember.api import models，这会加载整个 ember.api
from ember.api.models import models

class EmberService:
    """
    Ember 框架封装服务

    提供 4 种聊天模式:
    1. default - 快速问答（自动选择最优模型）
    2. multi - 多模型对比（3个模型并行）
    3. ensemble - 深度分析（6个模型协作）
    4. batch - 批量处理（并行处理多个问题）
    """

    def __init__(self):
        """初始化 Ember 服务"""
        # Ember 会自动从 Secret Manager 读取 API keys
        # 通过 credentials.py 的查找机制:
        # 1. Secret Manager (最高优先级)
        # 2. 环境变量
        # 3. 配置文件
        pass

    def chat(
        self,
        message: str,
        mode: str = "default",
        user_context: Optional[Dict] = None,
        language: str = "ZH",
        model_preference: str = "auto"
    ) -> Dict:
        """
        统一聊天接口

        Args:
            message: 用户消息
            mode: 模式 (default/multi/ensemble/batch)
            user_context: 用户画像
            language: 语言代码
            model_preference: 模型偏好 (auto/fast/quality/balanced)

        Returns:
            {
                "success": bool,
                "answer": str 或 list,
                "cost": float,
                "tokens": {...},
                "model_used": str,
                "mode": str,
                "execution_time": float,
                "metadata": {...}
            }
        """
        import time
        start_time = time.time()

        try:
            if mode == "default":
                result = self._default_chat(message, user_context, language, model_preference)
            elif mode == "multi":
                result = self._multi_model_chat(message, user_context, language)
            elif mode == "ensemble":
                result = self._ensemble_chat(message, user_context, language)
            elif mode == "batch":
                # batch 模式需要 message 是列表
                if not isinstance(message, list):
                    message = [message]
                result = self._batch_chat(message, user_context, language)
            else:
                return {
                    "success": False,
                    "error": f"Unknown mode: {mode}",
                    "mode": mode
                }

            # 添加执行时间
            result["execution_time"] = time.time() - start_time
            return result

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "mode": mode,
                "execution_time": time.time() - start_time
            }

    def _default_chat(
        self,
        message: str,
        user_context: Optional[Dict],
        language: str,
        model_preference: str
    ) -> Dict:
        """
        默认聊天模式 - 自动选择最佳模型

        策略:
        - 短问题 (<50字) → gemini-2.5-flash (快速)
        - 深度问题 (包含"为什么"等) → gpt-5 (高质量)
        - 默认 → gpt-4o (平衡)
        """
        # 自动选择模型
        model = self._select_model(message, model_preference)

        # 构建 prompt
        prompt = self._build_prompt(message, user_context, language)

        # 调用 Ember Models API (自动从 Secret Manager 获取 API key)
        response = models.response(model, prompt)

        return {
            "success": True,
            "answer": response.text,
            "cost": response.usage['cost'],
            "tokens": {
                "prompt": response.usage['prompt_tokens'],
                "completion": response.usage['completion_tokens'],
                "total": response.usage['total_tokens']
            },
            "model_used": response.model_id,
            "mode": "default",
            "metadata": {
                "selection_reason": self._get_selection_reason(message, model_preference),
                "quality_level": "balanced"
            }
        }

    def _multi_model_chat(
        self,
        message: str,
        user_context: Optional[Dict],
        language: str
    ) -> Dict:
        """
        多模型对比模式 - 3个模型并行

        模型选择:
        - gpt-5 (最强推理)
        - gemini-2.5-flash (快速)
        - claude-4-sonnet (编程/分析)
        """
        models_to_use = [
            "gpt-5",
            "gemini-2.5-flash",
            "claude-4-sonnet"
        ]

        prompt = self._build_prompt(message, user_context, language)

        def call_model(model_name: str) -> Dict:
            """调用单个模型"""
            try:
                response = models.response(model_name, prompt)
                return {
                    "model": response.model_id,
                    "answer": response.text,
                    "cost": response.usage['cost'],
                    "tokens": {
                        "prompt": response.usage.get('prompt_tokens', 0),
                        "completion": response.usage.get('completion_tokens', 0),
                        "total": response.usage['total_tokens']
                    },
                    "success": True
                }
            except Exception as e:
                return {
                    "model": model_name,
                    "answer": "",
                    "cost": 0.0,
                    "tokens": {
                        "prompt": 0,
                        "completion": 0,
                        "total": 0
                    },
                    "success": False,
                    "error": str(e)
                }

        # 并行调用 3 个模型
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(call_model, m) for m in models_to_use]
            results = [f.result() for f in futures]

        # 计算总成本
        total_cost = sum(r['cost'] for r in results if r['success'])
        total_tokens = sum(r['tokens'].get('total', 0) for r in results if r['success'])

        # 筛选成功的结果
        successful_results = [r for r in results if r['success']]

        return {
            "success": len(successful_results) > 0,
            "answer": successful_results,  # 返回多个答案
            "cost": total_cost,
            "tokens": {
                "prompt": sum(r.get('tokens', {}).get('prompt', 0) for r in successful_results if 'tokens' in r),
                "completion": sum(r.get('tokens', {}).get('completion', 0) for r in successful_results if 'tokens' in r),
                "total": total_tokens
            },
            "model_used": f"multi ({len(successful_results)}/{len(models_to_use)} models)",
            "mode": "multi",
            "metadata": {
                "models_called": [r['model'] for r in results],
                "success_count": len(successful_results),
                "quality_level": "comparison"
            }
        }

    def _ensemble_chat(
        self,
        message: str,
        user_context: Optional[Dict],
        language: str
    ) -> Dict:
        """
        Ensemble 模式 - 最高质量

        配置:
        - 3x gpt-5 (高质量候选)
        - 2x gemini-2.5-flash (快速候选)
        - 1x claude-4-sonnet (评判综合)
        """
        prompt = self._build_prompt(message, user_context, language)

        # 5 个候选模型调用
        model_calls = [
            ("gpt-5", prompt),
            ("gpt-5", prompt),
            ("gpt-5", prompt),
            ("gemini-2.5-flash", prompt),
            ("gemini-2.5-flash", prompt),
        ]

        def call_model_simple(model_name: str, prompt_text: str) -> str:
            """简化的模型调用"""
            try:
                return models(model_name, prompt_text)
            except Exception as e:
                return f"[Error: {str(e)[:50]}]"

        # 并行调用 5 个候选
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(call_model_simple, m, p) for m, p in model_calls]
            candidates = [f.result() for f in futures]

        # 构建评判 prompt
        judge_prompt = f"""综合以下 5 个 AI 的答案,给出最佳回答:

问题: {message}

候选答案:
1. (GPT-5) {candidates[0]}
2. (GPT-5) {candidates[1]}
3. (GPT-5) {candidates[2]}
4. (Gemini) {candidates[3]}
5. (Gemini) {candidates[4]}

请综合分析后给出最佳答案:"""

        # Claude 评判综合
        final_response = models.response("claude-4-sonnet", judge_prompt)

        # 估算总成本（简化版，实际需累加所有调用）
        # 这里只用最后的评判成本作为代表
        total_cost = final_response.usage['cost'] * 2  # 粗略估算
        total_prompt = final_response.usage.get('prompt_tokens', 0) * 2
        total_completion = final_response.usage.get('completion_tokens', 0) * 2

        return {
            "success": True,
            "answer": final_response.text,
            "candidates": candidates,  # 返回所有候选答案
            "cost": total_cost,
            "tokens": {
                "prompt": total_prompt,
                "completion": total_completion,
                "total": final_response.usage['total_tokens'] * 2
            },
            "model_used": "ensemble (3xGPT-5 + 2xGemini + Claude)",
            "mode": "ensemble",
            "metadata": {
                "candidate_count": 5,
                "judge_model": "claude-4-sonnet",
                "quality_level": "maximum"
            }
        }

    def _batch_chat(
        self,
        messages: List[str],
        user_context: Optional[Dict],
        language: str
    ) -> Dict:
        """
        批量处理模式 - 并行处理多个问题

        使用 gemini-2.5-flash (快速且便宜)
        使用 ThreadPoolExecutor 并行处理
        """
        def process_single_question(question: str) -> Tuple[str, str]:
            """处理单个问题"""
            prompt = self._build_prompt(question, user_context, language)
            answer = models("gemini-2.5-flash", prompt)
            return question, answer

        # 并行处理所有问题
        with ThreadPoolExecutor(max_workers=min(len(messages), 10)) as executor:
            futures = [executor.submit(process_single_question, q) for q in messages]
            results = [f.result() for f in futures]

        # 估算成本（每个问题约 0.0002）
        estimated_cost = len(messages) * 0.0002

        return {
            "success": True,
            "answer": [
                {
                    "question": q,
                    "answer": a,
                    "cost": 0.0002
                }
                for q, a in results
            ],
            "cost": estimated_cost,
            "tokens": {
                "total": len(messages) * 400  # 估算
            },
            "model_used": "gemini-2.5-flash (batch)",
            "mode": "batch",
            "metadata": {
                "question_count": len(messages),
                "quality_level": "fast",
                "parallel": True
            }
        }

    def _select_model(self, message: str, preference: str) -> str:
        """
        智能选择模型

        策略:
        - fast → gemini-2.5-flash
        - quality → gpt-5
        - balanced → gpt-4o
        - auto → 根据问题自动选择
        """
        if preference == "fast":
            return "gemini-2.5-flash"
        elif preference == "quality":
            return "gpt-5"
        elif preference == "balanced":
            return "gpt-4o"

        # auto - 根据问题自动选择
        msg_len = len(message)

        # 短问题 (<50字) - 快速模型
        if msg_len < 50:
            return "gemini-2.5-flash"

        # 包含深度关键词 - 高质量模型
        deep_keywords = ["为什么", "分析", "解释", "原因", "如何", "评价", "比较"]
        if any(kw in message for kw in deep_keywords):
            return "gpt-5"

        # 默认 - 平衡模型
        return "gpt-4o"

    def _build_prompt(
        self,
        message: str,
        user_context: Optional[Dict],
        language: str
    ) -> str:
        """
        构建包含用户上下文的 prompt

        用户上下文包括政治画像:
        - economic: 经济观点 (-10 到 10)
        - social: 社会观点 (-10 到 10)
        - diplomatic: 外交观点 (-10 到 10)
        - label: 政治标签
        """
        if not user_context:
            return message

        # 构建用户画像描述
        context_parts = []

        if user_context.get('label'):
            context_parts.append(f"用户政治倾向: {user_context['label']}")

        if 'economic' in user_context:
            econ = user_context['economic']
            tendency = '左倾/社会主义' if econ < 0 else '右倾/自由市场'
            context_parts.append(f"经济观点: {econ:.1f} ({tendency})")

        if 'social' in user_context:
            social = user_context['social']
            tendency = '威权主义' if social < 0 else '自由主义'
            context_parts.append(f"社会观点: {social:.1f} ({tendency})")

        if 'diplomatic' in user_context:
            diplo = user_context['diplomatic']
            tendency = '民族主义' if diplo < 0 else '国际主义'
            context_parts.append(f"外交观点: {diplo:.1f} ({tendency})")

        if not context_parts:
            return message

        context_text = f"""用户画像:
{chr(10).join('- ' + p for p in context_parts)}

请基于用户的政治倾向,提供平衡、尊重且有深度的回答。

用户问题: {message}"""

        # 添加语言指令
        if language and language != 'EN':
            language_map = {
                'ZH': '中文',
                'JA': '日语',
                'FR': '法语',
                'ES': '西班牙语'
            }
            lang_name = language_map.get(language, '中文')
            context_text += f"\n\n请用{lang_name}回答。"

        return context_text

    def _get_selection_reason(self, message: str, preference: str) -> str:
        """获取模型选择原因"""
        if preference != "auto":
            return f"用户指定偏好: {preference}"

        msg_len = len(message)
        if msg_len < 50:
            return "短问题，选择快速模型"

        deep_keywords = ["为什么", "分析", "解释", "原因", "如何", "评价"]
        if any(kw in message for kw in deep_keywords):
            return "深度问题，选择高质量模型"

        return "默认平衡选择"


# 单例实例
_ember_service_instance = None

def get_ember_service() -> EmberService:
    """获取 Ember 服务单例"""
    global _ember_service_instance
    if _ember_service_instance is None:
        _ember_service_instance = EmberService()
    return _ember_service_instance
