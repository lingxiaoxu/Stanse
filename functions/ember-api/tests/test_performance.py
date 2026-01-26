"""
性能测试套件

测试各种场景下的性能指标
"""

import sys
from pathlib import Path
import time
from concurrent.futures import ThreadPoolExecutor

# 添加路径
api_path = Path(__file__).parent.parent
sys.path.insert(0, str(api_path))
ember_path = api_path.parent.parent / "ember-main" / "src"
sys.path.insert(0, str(ember_path))

from services.ember_service import get_ember_service


def test_default_mode_latency():
    """测试 Default 模式延迟"""
    service = get_ember_service()

    print("测试 Default 模式性能...")

    start = time.time()
    result = service.chat(
        message="你好",
        mode="default",
        language="ZH"
    )
    latency = time.time() - start

    print(f"  响应时间: {latency:.2f}秒")
    print(f"  目标: < 3秒")

    if latency < 3.0:
        print(f"  ✅ 通过")
    else:
        print(f"  ⚠️  超过目标")

    return latency


def test_multi_mode_latency():
    """测试 Multi 模式延迟"""
    service = get_ember_service()

    print("测试 Multi 模式性能...")

    start = time.time()
    result = service.chat(
        message="AI是什么? 简短回答",
        mode="multi",
        language="ZH"
    )
    latency = time.time() - start

    print(f"  响应时间: {latency:.2f}秒")
    print(f"  目标: < 6秒")

    if latency < 6.0:
        print(f"  ✅ 通过")
    else:
        print(f"  ⚠️  超过目标")

    return latency


def test_concurrent_requests():
    """测试并发处理能力"""
    service = get_ember_service()

    print("测试并发处理能力...")

    questions = [
        "什么是Python?",
        "什么是JavaScript?",
        "什么是Rust?",
        "什么是Go?",
        "什么是TypeScript?"
    ]

    def process_question(q):
        return service.chat(message=q, mode="default")

    start = time.time()

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(process_question, questions))

    total_time = time.time() - start

    print(f"  处理 {len(questions)} 个请求")
    print(f"  总时间: {total_time:.2f}秒")
    print(f"  平均: {total_time/len(questions):.2f}秒/请求")
    print(f"  吞吐量: {len(questions)/total_time:.2f} req/s")

    successful = sum(1 for r in results if r['success'])
    print(f"  成功率: {successful}/{len(questions)} ({successful/len(questions)*100:.1f}%)")

    if total_time / len(questions) < 3.0:
        print(f"  ✅ 性能达标")
    else:
        print(f"  ⚠️  性能待优化")

    return total_time / len(questions)


if __name__ == '__main__':
    print("=" * 80)
    print(" " * 26 + "性能压测")
    print("=" * 80)
    print()

    print("📊 测试 1: Default 模式延迟")
    print("-" * 80)
    default_latency = test_default_mode_latency()
    print()

    print("📊 测试 2: Multi 模式延迟")
    print("-" * 80)
    multi_latency = test_multi_mode_latency()
    print()

    print("📊 测试 3: 并发处理能力")
    print("-" * 80)
    concurrent_latency = test_concurrent_requests()
    print()

    print("=" * 80)
    print(" " * 28 + "性能总结")
    print("=" * 80)
    print()
    print(f"  Default 延迟:  {default_latency:.2f}s (目标: <3s)")
    print(f"  Multi 延迟:    {multi_latency:.2f}s (目标: <6s)")
    print(f"  并发平均:      {concurrent_latency:.2f}s (目标: <3s)")
    print()

    all_passed = (
        default_latency < 3.0 and
        multi_latency < 6.0 and
        concurrent_latency < 3.0
    )

    if all_passed:
        print("✅ 所有性能测试通过！")
    else:
        print("⚠️  部分性能测试未达标，需要优化")

    print("=" * 80)
