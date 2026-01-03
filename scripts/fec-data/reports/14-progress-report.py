import json
from datetime import datetime

# Read progress
with open('/Users/xuling/code/Stanse/scripts/fec-data/reports/01-upload-progress.json', 'r') as f:
    progress = json.load(f)

current_line = progress['transfers_last_line']
uploaded = progress['transfers_uploaded']
last_updated = progress['last_updated']
total_lines = 18667266

# From previous check
prev_line = 10867350
prev_uploaded = 6025000

# Calculate progress
progress_pct = (current_line / total_lines) * 100
remaining_lines = total_lines - current_line
completed_lines = current_line - prev_line
completed_uploads = uploaded - prev_uploaded

print(f"📊 TRANSFERS 上传进度报告")
print(f"{'='*70}")
print(f"进程状态: ✅ 正在运行 (PID: 99656)")
print(f"运行时长: 4小时38分钟")
print(f"最后更新: {last_updated}")
print()

print(f"📈 当前进度")
print(f"{'='*70}")
print(f"当前行数:     {current_line:>12,} / {total_lines:,}")
print(f"已上传记录:   {uploaded:>12,}")
print(f"完成进度:     {progress_pct:>12.2f}%")
print(f"剩余行数:     {remaining_lines:>12,}")
print()

print(f"⚡ 自上次检查以来的进展 (约4小时前)")
print(f"{'='*70}")
print(f"处理行数:     {completed_lines:>12,}")
print(f"上传记录:     {completed_uploads:>12,}")
print(f"平均速度:     {completed_lines/3600/4:>12.1f} 行/秒")
print()

# Current speed from logs: 36 rows/sec
current_speed = 36
eta_hours = remaining_lines / current_speed / 3600

print(f"⏱️  预计完成时间")
print(f"{'='*70}")
print(f"当前速度:     {current_speed:>12} 行/秒")
print(f"剩余时间:     {eta_hours:>12.1f} 小时 ({eta_hours/24:.1f} 天)")
print()

# Progress milestones
print(f"🎯 进度里程碑")
print(f"{'='*70}")
milestones = [
    (4842350, 6024500, "上次会话开始"),
    (10867350, 6025000, "4小时前检查"),
    (current_line, uploaded, "当前"),
]
for line, upl, desc in milestones:
    pct = (line / total_lines) * 100
    print(f"{desc:20} {line:>12,} 行 ({pct:>5.1f}%) | {upl:>10,} 条记录")
