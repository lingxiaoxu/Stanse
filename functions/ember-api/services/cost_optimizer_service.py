"""
自动成本优化服务

分析用户使用模式并自动优化成本:
1. 分析问题复杂度
2. 建议最优模式
3. 智能降级
4. 缓存推荐
"""

from typing import Dict, Tuple


class CostOptimizer:
    """成本优化器"""

    def __init__(self):
        """初始化"""
        # 问题复杂度关键词
        self.complexity_keywords = {
            "simple": ["是什么", "哪个", "多少", "几个"],
            "medium": ["如何", "怎样", "方法", "步骤"],
            "complex": ["为什么", "分析", "评价", "比较", "深入", "详细"]
        }

    def analyze_complexity(self, message: str) -> Tuple[str, float]:
        """
        分析问题复杂度

        Args:
            message: 用户问题

        Returns:
            (complexity_level, score)
            complexity_level: simple | medium | complex
            score: 0-1
        """
        factors = []

        # 因素 1: 长度
        length_score = min(len(message) / 500, 1.0)
        factors.append(("length", length_score * 0.3))

        # 因素 2: 关键词
        keyword_counts = {level: 0 for level in self.complexity_keywords}

        for level, keywords in self.complexity_keywords.items():
            count = sum(1 for kw in keywords if kw in message)
            keyword_counts[level] = count

        if keyword_counts["complex"] > 0:
            complexity = "complex"
            keyword_score = 0.9
        elif keyword_counts["medium"] > 0:
            complexity = "medium"
            keyword_score = 0.5
        else:
            complexity = "simple"
            keyword_score = 0.2

        factors.append(("keywords", keyword_score * 0.4))

        # 因素 3: 专业词汇
        professional_terms = [
            "政治", "经济", "哲学", "科技", "量子", "AI",
            "社会", "外交", "国际", "分析"
        ]
        professional_count = sum(1 for term in professional_terms if term in message)
        professional_score = min(professional_count / 3, 1.0)
        factors.append(("professional", professional_score * 0.3))

        # 综合分数
        total_score = sum(score for _, score in factors)

        # 根据分数确定复杂度
        if total_score > 0.7:
            final_complexity = "complex"
        elif total_score > 0.4:
            final_complexity = "medium"
        else:
            final_complexity = "simple"

        return final_complexity, total_score

    def optimize_mode_selection(
        self,
        requested_mode: str,
        message: str,
        user_tier: str = "free"
    ) -> Tuple[str, str, float]:
        """
        优化模式选择

        Args:
            requested_mode: 用户请求的模式
            message: 用户问题
            user_tier: 用户等级

        Returns:
            (suggested_mode, reason, estimated_savings_percent)
        """
        # 分析复杂度
        complexity, score = self.analyze_complexity(message)

        # 模式-复杂度匹配
        mode_requirements = {
            "default": "simple",
            "multi": "medium",
            "ensemble": "complex",
            "batch": "simple"
        }

        # 如果模式过度（overkill）建议降级
        if requested_mode == "ensemble" and complexity == "simple":
            return (
                "default",
                "简单问题无需 Ensemble，建议使用 Default 模式",
                85.0  # 节省 85%
            )

        if requested_mode == "ensemble" and complexity == "medium":
            return (
                "multi",
                "中等复杂度问题，建议使用 Multi 模式",
                75.0  # 节省 75%
            )

        if requested_mode == "multi" and complexity == "simple":
            return (
                "default",
                "简单问题无需多模型对比",
                70.0  # 节省 70%
            )

        # 模式合适，无需优化
        return requested_mode, "当前模式最优", 0.0

    def suggest_cache_usage(
        self,
        message: str,
        mode: str
    ) -> Tuple[bool, str]:
        """
        建议是否使用缓存

        Args:
            message: 用户问题
            mode: 模式

        Returns:
            (should_use_cache, reason)
        """
        # 常见问题模式
        common_patterns = [
            "是什么", "什么是", "介绍", "定义",
            "怎么", "如何", "方法"
        ]

        is_common = any(pattern in message for pattern in common_patterns)

        # 判断是否应该缓存
        if is_common and mode in ["default", "multi"]:
            return True, "常见问题，建议使用缓存"

        if mode == "ensemble":
            return False, "Ensemble 模式结果动态性强，不建议缓存"

        return True, "默认启用缓存"

    def optimize_model_selection(
        self,
        message: str,
        quality_requirement: str = "balanced"
    ) -> Tuple[str, str]:
        """
        优化模型选择

        Args:
            message: 用户问题
            quality_requirement: minimum | balanced | maximum

        Returns:
            (model, reason)
        """
        complexity, score = self.analyze_complexity(message)

        # 质量需求映射
        quality_map = {
            "minimum": 0.70,
            "balanced": 0.85,
            "maximum": 0.95
        }
        required_quality = quality_map.get(quality_requirement, 0.85)

        # 模型选项（质量 vs 成本）
        model_options = [
            {
                "model": "gemini-2.5-flash",
                "quality": 0.80,
                "cost_per_token": 0.0000002,
                "good_for": ["simple", "medium"]
            },
            {
                "model": "gpt-4o",
                "quality": 0.90,
                "cost_per_token": 0.000006,
                "good_for": ["medium", "complex"]
            },
            {
                "model": "gpt-5",
                "quality": 0.95,
                "cost_per_token": 0.000014,
                "good_for": ["complex"]
            },
            {
                "model": "claude-4-sonnet",
                "quality": 0.92,
                "cost_per_token": 0.000009,
                "good_for": ["medium", "complex"]
            }
        ]

        # 筛选满足质量要求且适合当前复杂度的模型
        qualified = [
            m for m in model_options
            if m["quality"] >= required_quality and complexity in m["good_for"]
        ]

        if not qualified:
            # 如果无法满足，选择最高质量
            best = max(model_options, key=lambda x: x["quality"])
            return best["model"], f"问题较复杂，选择最高质量模型"

        # 在满足条件的模型中选择成本最低的
        best = min(qualified, key=lambda x: x["cost_per_token"])

        return best["model"], f"{complexity} 问题，选择性价比最优模型"

    def calculate_savings(
        self,
        original_mode: str,
        optimized_mode: str
    ) -> float:
        """
        计算节省百分比

        Args:
            original_mode: 原始模式
            optimized_mode: 优化后模式

        Returns:
            节省百分比 (0-100)
        """
        # 模式成本估算
        mode_costs = {
            "default": 0.0015,
            "multi": 0.0045,
            "ensemble": 0.018,
            "batch": 0.0002
        }

        original_cost = mode_costs.get(original_mode, 0.001)
        optimized_cost = mode_costs.get(optimized_mode, 0.001)

        if original_cost == 0:
            return 0.0

        savings = (original_cost - optimized_cost) / original_cost * 100
        return max(0.0, savings)


# 单例实例
_cost_optimizer_instance = None


def get_cost_optimizer() -> CostOptimizer:
    """获取成本优化器单例"""
    global _cost_optimizer_instance
    if _cost_optimizer_instance is None:
        _cost_optimizer_instance = CostOptimizer()
    return _cost_optimizer_instance
