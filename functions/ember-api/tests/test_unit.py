"""
单元测试套件

测试所有服务的核心功能
"""

import sys
from pathlib import Path

# 添加路径
api_path = Path(__file__).parent.parent
sys.path.insert(0, str(api_path))
ember_path = api_path.parent.parent / "ember-main" / "src"
sys.path.insert(0, str(ember_path))


def test_cost_optimizer():
    """测试成本优化器"""
    from services.cost_optimizer_service import get_cost_optimizer

    optimizer = get_cost_optimizer()

    # 测试复杂度分析
    complexity, score = optimizer.analyze_complexity("什么是AI?")
    assert complexity in ["simple", "medium", "complex"]
    print(f"✓ 复杂度分析: {complexity} (score: {score:.2f})")

    # 测试模式优化
    mode, reason, savings = optimizer.optimize_mode_selection("ensemble", "你好", "free")
    print(f"✓ 模式优化: {mode} (节省: {savings:.1f}%)")

    # 测试缓存建议
    should_cache, reason = optimizer.suggest_cache_usage("什么是AI?", "default")
    print(f"✓ 缓存建议: {should_cache} ({reason})")

    print("✅ 成本优化器测试通过")


def test_model_selection():
    """测试智能模型选择"""
    from services.ember_service import EmberService

    service = EmberService()

    # 测试短问题
    model = service._select_model("你好", "auto")
    assert model == "gemini-2.5-flash"
    print(f"✓ 短问题选择: {model}")

    # 测试深度问题
    model = service._select_model("为什么AI很重要? 详细分析原因", "auto")
    assert model == "gpt-5"
    print(f"✓ 深度问题选择: {model}")

    # 测试用户偏好
    model = service._select_model("任意问题", "fast")
    assert model == "gemini-2.5-flash"
    print(f"✓ 用户偏好选择: {model}")

    print("✅ 模型选择测试通过")


def test_prompt_building():
    """测试 prompt 构建"""
    from services.ember_service import EmberService

    service = EmberService()

    # 测试无上下文
    prompt = service._build_prompt("你好", None, "ZH")
    assert prompt == "你好"
    print("✓ 无上下文 prompt 正确")

    # 测试有上下文
    context = {
        "economic": -2.5,
        "social": 3.1,
        "label": "Social Democrat"
    }
    prompt = service._build_prompt("问题", context, "ZH")
    assert "Social Democrat" in prompt
    assert "经济观点" in prompt
    print("✓ 上下文 prompt 正确")

    print("✅ Prompt 构建测试通过")


def test_cache_key_generation():
    """测试缓存键生成"""
    from services.cache_service import CacheService

    service = CacheService()

    # 测试相同输入生成相同键
    key1 = service.generate_cache_key("你好", "default", {"economic": -2.5})
    key2 = service.generate_cache_key("你好", "default", {"economic": -2.5})
    assert key1 == key2
    print("✓ 相同输入生成相同键")

    # 测试不同输入生成不同键
    key3 = service.generate_cache_key("你好", "multi", {"economic": -2.5})
    assert key1 != key3
    print("✓ 不同输入生成不同键")

    # 测试标准化（微小差异应生成相同键）
    key4 = service.generate_cache_key("你好", "default", {"economic": -2.52})
    assert key1 == key4  # -2.5 和 -2.52 应四舍五入为 -2.5
    print("✓ 标准化正确")

    print("✅ 缓存键生成测试通过")


if __name__ == '__main__':
    print("=" * 80)
    print(" " * 28 + "单元测试")
    print("=" * 80)
    print()

    print("📋 测试 1: 成本优化器")
    print("-" * 80)
    test_cost_optimizer()
    print()

    print("📋 测试 2: 智能模型选择")
    print("-" * 80)
    test_model_selection()
    print()

    print("📋 测试 3: Prompt 构建")
    print("-" * 80)
    test_prompt_building()
    print()

    print("📋 测试 4: 缓存键生成")
    print("-" * 80)
    test_cache_key_generation()
    print()

    print("=" * 80)
    print("✅ 所有单元测试通过！")
    print("=" * 80)
