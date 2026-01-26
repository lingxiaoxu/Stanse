#!/bin/bash

# Ember API 完整部署脚本（后端 + 前端）
#
# 项目架构:
#   - 所有服务部署到: gen-lang-client-0960644135
#   - Cloud Function (后端 API): ember_api
#   - Cloud Run (前端应用): stanse
#   - Secret Manager (API Keys): 同项目
#   - Firestore (数据存储): 同项目
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# 部署经验:
#   1. 所有服务在同一项目，简化权限配置
#   2. requirements.txt 必须包含完整 Ember 依赖（含 JAX, equinox）
#   3. ember 路径需要支持 Cloud Function (/workspace) 和本地
#   4. Flask 3.0 不支持 @app.before_first_request
#   5. ember_api 必须是函数，不能是 Flask app 对象
#   6. 使用项目根目录的 .gcloudignore 并追加 ember 规则

set -e

echo "🚀 开始部署 Ember API 到生产环境..."
echo ""

# ============================================================================
# 项目配置
# ============================================================================

# 所有服务都部署到同一个项目
PROJECT_ID="gen-lang-client-0960644135"

# Cloud Function、Secret Manager、前端都在这个项目
FUNCTION_PROJECT_ID="$PROJECT_ID"
SECRET_PROJECT_ID="$PROJECT_ID"
FRONTEND_PROJECT_ID="$PROJECT_ID"

# 其他配置
REGION="us-central1"
FUNCTION_NAME="ember_api"

echo "📋 配置信息:"
echo "   部署项目: $PROJECT_ID"
echo "   Cloud Function: $FUNCTION_NAME"
echo "   Secret Manager: 同项目"
echo "   前端 Cloud Run: 同项目"
echo "   区域: $REGION"
echo ""

# ============================================================================
# 步骤 1: 检查 gcloud 配置
# ============================================================================

echo "📋 步骤 1/6: 检查 gcloud 配置..."
gcloud auth list
echo "✅ gcloud 已登录"
echo ""

# ============================================================================
# 步骤 2: 配置跨项目 Secret Manager 访问权限
# ============================================================================

echo "🔑 步骤 2/6: 配置 Secret Manager 权限..."

# 同项目部署，Secret Manager 权限自动配置
echo "   ✅ 同项目部署，Secret Manager 自动可访问"
echo "   项目: $PROJECT_ID"
echo ""

# ============================================================================
# 步骤 3: 准备部署文件
# ============================================================================

echo "📂 步骤 3/6: 准备部署文件..."

# 检查 ember-main 目录
if [ ! -d "../../ember-main" ]; then
    echo "❌ 错误: ember-main 目录不存在"
    echo "   路径: $(pwd)/../../ember-main"
    exit 1
fi

# 创建临时部署目录
DEPLOY_DIR="/tmp/ember-api-deploy-$(date +%s)"
mkdir -p $DEPLOY_DIR

echo "   临时目录: $DEPLOY_DIR"

# 复制文件
echo "   复制 ember-api 文件..."
cp -r ./* $DEPLOY_DIR/

echo "   复制 ember-main 框架..."
cp -r ../../ember-main $DEPLOY_DIR/

# 使用项目根目录的 .gcloudignore 并添加 ember-api 特定规则
echo "   配置 .gcloudignore..."
if [ -f "../../.gcloudignore" ]; then
    echo "   基于项目根目录的 .gcloudignore"
    cp ../../.gcloudignore $DEPLOY_DIR/.gcloudignore

    # 追加 ember-api 特定的排除规则
    cat >> $DEPLOY_DIR/.gcloudignore << 'EMBER_IGNORE_EOF'

# Ember API 特定排除
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.so
*.egg
*.egg-info/
tests/
service-account-key.json
.venv
venv/
ember-main/.venv
ember-main/uv.lock
EMBER_IGNORE_EOF
else
    echo "   项目 .gcloudignore 不存在，创建新的"
    cat > $DEPLOY_DIR/.gcloudignore << 'GCLOUDIGNORE_EOF'
.git
.gitignore
__pycache__/
*.pyc
tests/
.DS_Store
.venv
venv/
service-account-key.json
GCLOUDIGNORE_EOF
fi

echo "✅ 文件准备完成"
echo ""

# ============================================================================
# 步骤 4: 切换项目并部署
# ============================================================================

echo "🚀 步骤 4/6: 部署 Cloud Function..."

# 切换到部署项目
gcloud config set project $PROJECT_ID

# 进入部署目录
cd $DEPLOY_DIR

# 部署 Cloud Function (Gen 2)
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime python312 \
  --region $REGION \
  --entry-point ember_api \
  --trigger-http \
  --allow-unauthenticated \
  --memory 2GiB \
  --timeout 300s \
  --max-instances 10 \
  --min-instances 0 \
  --project $PROJECT_ID

echo "✅ 部署完成!"
echo ""

# ============================================================================
# 步骤 5: 获取函数 URL
# ============================================================================

echo "📌 步骤 5/6: 获取函数信息..."

FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME \
  --region $REGION \
  --gen2 \
  --project $PROJECT_ID \
  --format="value(serviceConfig.uri)")

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                     部署成功！"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📌 函数 URL:"
echo "   $FUNCTION_URL"
echo ""
echo "📋 测试命令:"
echo "   curl $FUNCTION_URL/health"
echo ""
echo "   curl -X POST $FUNCTION_URL/chat \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"message\": \"你好\", \"mode\": \"default\"}'"
echo ""
echo "🔧 前端配置:"
echo "   在 .env.local 添加:"
echo "   NEXT_PUBLIC_EMBER_API_URL=$FUNCTION_URL"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# 步骤 6: 验证部署
# ============================================================================

echo "🧪 步骤 6/6: 验证部署..."

# 等待函数就绪
echo "   等待函数启动..."
sleep 5

# 健康检查
echo "   执行健康检查..."
HEALTH_RESPONSE=$(curl -s $FUNCTION_URL/health)

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo "   ✅ 健康检查通过"
    echo "   响应: $HEALTH_RESPONSE"
else
    echo "   ⚠️  健康检查异常"
    echo "   响应: $HEALTH_RESPONSE"
fi

echo ""

# 返回原目录
cd - > /dev/null

# 清理临时目录
rm -rf $DEPLOY_DIR
echo "✅ 临时文件已清理"
echo ""

# ============================================================================
# 步骤 7: 部署前端到 Cloud Run
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "              第二部分：部署前端 Cloud Run"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# 询问是否部署前端
read -p "是否同时部署前端到 Cloud Run? (y/n): " DEPLOY_FRONTEND

if [ "$DEPLOY_FRONTEND" = "y" ] || [ "$DEPLOY_FRONTEND" = "Y" ]; then
    echo ""
    echo "📦 步骤 7/8: 部署前端..."
    echo ""

    # 前端和后端在同一个项目，无需切换
    echo "   项目: $PROJECT_ID (前后端同项目)"

    # 回到项目根目录
    cd /Users/xuling/code/Stanse

    # 备份 cloudbuild.yaml
    echo "💾 备份 cloudbuild.yaml..."
    cp cloudbuild.yaml cloudbuild.yaml.backup

    # 更新 cloudbuild.yaml 中的 Ember API URL
    echo "📝 更新 cloudbuild.yaml 中的 Ember API URL..."
    sed -i.tmp "s|--build-arg NEXT_PUBLIC_EMBER_API_URL=.*|--build-arg NEXT_PUBLIC_EMBER_API_URL=${FUNCTION_URL} \\\\|" cloudbuild.yaml

    echo "✅ cloudbuild.yaml 已更新"
    echo ""

    # 触发 Cloud Build
    echo "🚀 触发 Cloud Build 部署前端..."
    echo "   这将构建 Docker 镜像并部署到 Cloud Run"
    echo "   预计需要 3-5 分钟..."
    echo ""

    gcloud builds submit \
      --config=cloudbuild.yaml \
      --project=$PROJECT_ID

    # 恢复原 cloudbuild.yaml
    echo ""
    echo "🔄 恢复 cloudbuild.yaml..."
    mv cloudbuild.yaml.backup cloudbuild.yaml
    rm -f cloudbuild.yaml.tmp

    # ========================================================================
    # 步骤 8: 获取前端 URL
    # ========================================================================

    echo ""
    echo "📌 步骤 8/8: 获取前端信息..."

    FRONTEND_URL=$(gcloud run services describe stanse \
      --region us-central1 \
      --project $PROJECT_ID \
      --format="value(status.url)" 2>/dev/null)

    if [ -n "$FRONTEND_URL" ]; then
        echo "   ✅ 前端 URL: $FRONTEND_URL"
    else
        echo "   ℹ️  前端 URL 获取失败，请手动查看"
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                  前后端部署全部完成！"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "✅ 后端 Cloud Function:"
    echo "   $FUNCTION_URL"
    echo ""
    echo "✅ 前端 Cloud Run:"
    echo "   $FRONTEND_URL"
    echo ""
    echo "📦 项目: $PROJECT_ID"
    echo ""
    echo "🧪 验证步骤:"
    echo "   1. 访问前端: $FRONTEND_URL"
    echo "   2. 登录并打开 AI 聊天"
    echo "   3. 在 Console 运行: window.testEmberAPI.testAll()"
    echo "   4. 测试所有 4 种聊天模式"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

else
    echo ""
    echo "⏭️  跳过前端部署"
    echo ""
    echo "🎉 后端部署完成！"
    echo ""
    echo "⚠️  注意: 需要手动部署前端"
    echo ""
    echo "手动部署前端:"
    echo "  1. 更新 cloudbuild.yaml 中的 EMBER_API_URL:"
    echo "     NEXT_PUBLIC_EMBER_API_URL=$FUNCTION_URL"
    echo ""
    echo "  2. 运行 Cloud Build:"
    echo "     cd /Users/xuling/code/Stanse"
    echo "     gcloud builds submit --config=cloudbuild.yaml --project=gen-lang-client-0960644135"
    echo ""
    echo "或本地开发测试:"
    echo "  1. 更新 .env.local:"
    echo "     echo \"NEXT_PUBLIC_EMBER_API_URL=$FUNCTION_URL\" > .env.local"
    echo "  2. 启动开发服务器:"
    echo "     npm run dev"
    echo ""
fi

echo "📚 相关文档:"
echo "   - 部署指南: documentation/backend/61_ember_production_deployment_guide.md"
echo "   - 快速开始: documentation/frontend/22_ember_api_quickstart_guide.md"
echo ""
