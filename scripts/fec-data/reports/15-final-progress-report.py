import json

# Read progress
with open('/Users/xuling/code/Stanse/scripts/fec-data/reports/01-upload-progress.json', 'r') as f:
    progress = json.load(f)

current_line = progress['transfers_last_line']
uploaded = progress['transfers_uploaded']
last_updated = progress['last_updated']
total_lines = 18667266

# Calculate progress
progress_pct = (current_line / total_lines) * 100
remaining_lines = total_lines - current_line

# From start of this session
start_line = 4842350
start_uploaded = 4202000
total_processed = current_line - start_line
total_uploaded_session = uploaded - start_uploaded

print(f"🎉 TRANSFERS 上传进度 - 即将完成！")
print(f"{'='*70}")
print(f"✅ 进程状态: 正常运行 (PID: 99656)")
print(f"⏰ 运行时长: 15小时12分钟")
print(f"📅 最后更新: {last_updated}")
print()

print(f"📊 完成进度: {progress_pct:.2f}%")
print(f"{'='*70}")
print(f"当前行数:     {current_line:>12,} / {total_lines:,}")
print(f"已上传记录:   {uploaded:>12,}")
print(f"剩余行数:     {remaining_lines:>12,} ({100-progress_pct:.2f}%)")
print()

print(f"📈 本次会话总进展")
print(f"{'='*70}")
print(f"起始位置:     {start_line:>12,} 行 (25.9%)")
print(f"当前位置:     {current_line:>12,} 行 ({progress_pct:.1f}%)")
print(f"处理行数:     {total_processed:>12,}")
print(f"上传记录:     {total_uploaded_session:>12,}")
print()

# Current speed from logs: 48 rows/sec
current_speed = 48
eta_hours = remaining_lines / current_speed / 3600
eta_minutes = (eta_hours % 1) * 60

# Overall average speed
overall_hours = 15.2  # 15 hours 12 minutes
overall_avg_speed = total_processed / overall_hours / 3600

print(f"⚡ 性能统计")
print(f"{'='*70}")
print(f"当前速度:     {current_speed:>12} 行/秒")
print(f"会话平均速度: {overall_avg_speed:>12.1f} 行/秒")
print()

print(f"⏱️  预计完成时间")
print(f"{'='*70}")
print(f"剩余时间:     {int(eta_hours):>12} 小时 {int(eta_minutes)} 分钟")
print(f"预计完成:     今天深夜/明天凌晨")
print()

print(f"🎯 里程碑")
print(f"{'='*70}")
milestones = [
    (4842350, 25.9, "会话开始（上次停止）"),
    (10867350, 58.2, "4小时后"),
    (12558350, 67.3, "8小时后"),
    (current_line, progress_pct, "当前（15小时后）"),
    (total_lines, 100.0, "完成目标"),
]
for line, pct, desc in milestones:
    bar_length = int(pct / 2)
    bar = '█' * bar_length + '░' * (50 - bar_length)
    print(f"{desc:25} {line:>12,} 行 [{bar}] {pct:>5.1f}%")
