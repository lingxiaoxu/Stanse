#!/bin/bash

# 清理临时文件脚本
# 删除所有 *.txt 文件（除了 .gitkeep 和 README）

echo "🧹 Cleaning up temporary ticker files..."
echo "============================================"

# 当前目录
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Directory: $DIR"
echo ""

# 查找所有 .txt 文件
txt_files=$(find "$DIR" -maxdepth 1 -name "*.txt" -type f)

if [ -z "$txt_files" ]; then
    echo "✅ No temporary files found"
    exit 0
fi

echo "Found the following temporary files:"
echo "$txt_files" | while read -r file; do
    echo "  - $(basename "$file")"
done

echo ""
read -p "Delete these files? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "$txt_files" | while read -r file; do
        rm "$file"
        echo "  ✓ Deleted: $(basename "$file")"
    done
    echo ""
    echo "✅ Cleanup complete!"
else
    echo "❌ Cleanup cancelled"
fi
