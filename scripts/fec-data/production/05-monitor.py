#!/usr/bin/env python3
"""
监控FEC数据上传进度
"""

import sys
import json
import time
from pathlib import Path
from datetime import datetime

PROGRESS_FILE = Path(__file__).parent.parent / 'reports' / '01-upload-progress.json'
TOTAL_CONTRIBUTIONS = 703789

def load_progress():
    """加载进度文件"""
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, 'r') as f:
            return json.load(f)
    return {}

def format_time(seconds):
    """格式化时间"""
    if seconds < 60:
        return f'{seconds:.0f}秒'
    elif seconds < 3600:
        return f'{seconds/60:.1f}分钟'
    else:
        hours = seconds / 3600
        return f'{hours:.1f}小时'

def calculate_eta(uploaded, total, speed_per_min):
    """计算预计完成时间"""
    if speed_per_min <= 0:
        return '未知'

    remaining = total - uploaded
    minutes_remaining = remaining / speed_per_min

    return format_time(minutes_remaining * 60)

def display_progress():
    """显示当前进度"""
    progress = load_progress()

    print('\n' + '='*70)
    print('📊 FEC数据上传进度监控')
    print('='*70)

    last_updated = progress.get('last_updated', 'N/A')
    if last_updated != 'N/A':
        try:
            dt = datetime.fromisoformat(last_updated)
            last_updated = dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            pass

    print(f'\n最后更新: {last_updated}\n')

    # Committees
    committees_uploaded = progress.get('committees_uploaded', 0)
    committees_total = 20934
    committees_pct = (committees_uploaded / committees_total * 100) if committees_total > 0 else 0
    committees_status = '✅' if progress.get('committees_completed') else '⏳'

    print(f'{committees_status} Committees:')
    print(f'   {committees_uploaded:,} / {committees_total:,} ({committees_pct:.1f}%)')

    # Candidates
    candidates_uploaded = progress.get('candidates_uploaded', 0)
    candidates_total = 9809
    candidates_pct = (candidates_uploaded / candidates_total * 100) if candidates_total > 0 else 0
    candidates_status = '✅' if progress.get('candidates_completed') else '⏳'

    print(f'\n{candidates_status} Candidates:')
    print(f'   {candidates_uploaded:,} / {candidates_total:,} ({candidates_pct:.1f}%)')

    # Contributions
    contributions_uploaded = progress.get('contributions_uploaded', 0)
    contributions_pct = (contributions_uploaded / TOTAL_CONTRIBUTIONS * 100) if TOTAL_CONTRIBUTIONS > 0 else 0
    contributions_status = '✅' if progress.get('contributions_completed') else '⏳'

    print(f'\n{contributions_status} Contributions:')
    print(f'   {contributions_uploaded:,} / {TOTAL_CONTRIBUTIONS:,} ({contributions_pct:.1f}%)')

    # 进度条
    bar_length = 50
    filled = int(bar_length * contributions_pct / 100)
    bar = '█' * filled + '░' * (bar_length - filled)
    print(f'   [{bar}]')

    # 估算速度和ETA（仅针对contributions）
    if not progress.get('contributions_completed') and contributions_uploaded > 0:
        print(f'\n⏱️  预估:')
        print(f'   剩余: {TOTAL_CONTRIBUTIONS - contributions_uploaded:,} 条')

        # 假设平均速度600条/分钟
        estimated_speed = 600
        eta = calculate_eta(contributions_uploaded, TOTAL_CONTRIBUTIONS, estimated_speed)
        print(f'   预计速度: ~{estimated_speed} 条/分钟')
        print(f'   预计完成时间: {eta}')

    # 总体状态
    print(f'\n{"="*70}')
    if progress.get('contributions_completed'):
        print('✅ 所有数据上传完成！')
        print('\n下一步:')
        print('  1. 运行: python3 build_indexes.py')
        print('  2. 运行: python3 test_query.py')
    else:
        print('⏳ 上传进行中...')
        print('\n提示:')
        print('  - 脚本在后台运行，可以安全关闭此监控')
        print('  - 进度会自动保存，可以随时中断后继续')

    print('='*70)
    print()

def monitor_loop(interval=30):
    """循环监控"""
    print('开始监控... (按 Ctrl+C 退出)')

    try:
        while True:
            display_progress()

            # 检查是否完成
            progress = load_progress()
            if progress.get('contributions_completed'):
                print('上传已完成！停止监控。')
                break

            print(f'等待 {interval} 秒后刷新...\n')
            time.sleep(interval)

    except KeyboardInterrupt:
        print('\n\n停止监控。')

def main():
    """主函数"""
    if len(sys.argv) > 1 and sys.argv[1] == '--watch':
        # 循环监控模式
        interval = 30
        if len(sys.argv) > 2:
            try:
                interval = int(sys.argv[2])
            except:
                pass
        monitor_loop(interval)
    else:
        # 单次显示模式
        display_progress()
        print('提示: 使用 --watch 参数进入循环监控模式')
        print('     例如: python3 monitor_progress.py --watch 30')
        print()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n退出。')
        sys.exit(0)
