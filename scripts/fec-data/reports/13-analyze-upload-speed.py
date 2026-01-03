import json

# Read progress file
with open('/Users/xuling/code/Stanse/scripts/fec-data/reports/01-upload-progress.json', 'r') as f:
    progress = json.load(f)

current_line = progress['transfers_last_line']
uploaded = progress['transfers_uploaded']
total_lines = 18667266

# Calculate based on recent logs
# From logs: line 10,772,350 at 108 rows/sec, then slowed to 30 rows/sec at 10,777,350
# Current: 10,830,850

# Calculate progress
progress_pct = (current_line / total_lines) * 100
remaining_lines = total_lines - current_line

print(f"📊 最近10,000行上传分析")
print(f"{'='*60}")
print(f"当前行数: {current_line:,}")
print(f"已上传记录: {uploaded:,}")
print(f"总行数: {total_lines:,}")
print(f"完成进度: {progress_pct:.2f}%")
print(f"剩余行数: {remaining_lines:,}")
print()

# Analyze from logs (line 10,772,350 to 10,832,350 = 60,000 lines)
# This happened while experiencing rate limiting
sample_start = 10772350
sample_end = current_line
sample_lines = sample_end - sample_start

print(f"📈 样本分析 (最近上传的行数)")
print(f"{'='*60}")
print(f"起始行: {sample_start:,}")
print(f"结束行: {sample_end:,}")
print(f"样本大小: {sample_lines:,} 行")
print()

# Speed analysis
# Before rate limit: 108 rows/sec
# After rate limit: 30 rows/sec
print(f"⚡ 速度分析")
print(f"{'='*60}")
print(f"正常速度: 108 行/秒")
print(f"限流速度: 30 行/秒")
print()

# ETA calculation with mixed speed
# Assume 50% normal, 50% rate limited (conservative estimate)
avg_speed = (108 + 30) / 2
eta_hours = remaining_lines / avg_speed / 3600

print(f"预计完成时间 (混合速度 {avg_speed:.0f} 行/秒):")
print(f"  剩余时间: {eta_hours:.1f} 小时")
print()

# Best case (all 108 rows/sec)
best_eta = remaining_lines / 108 / 3600
print(f"最佳情况 (108 行/秒): {best_eta:.1f} 小时")

# Worst case (all 30 rows/sec)
worst_eta = remaining_lines / 30 / 3600
print(f"最差情况 (30 行/秒): {worst_eta:.1f} 小时")
