/**
 * Ember API 浏览器 Console 测试工具
 *
 * 使用方法（在浏览器 Console 中）:
 *   window.testEmberAPI.health()
 *   window.testEmberAPI.defaultMode("你好")
 *   window.testEmberAPI.multiMode("AI是什么?")
 *   window.testEmberAPI.ensembleMode("AI的未来?")
 *   window.testEmberAPI.batchMode(["Q1", "Q2", "Q3"])
 *   window.testEmberAPI.costStats("user123")
 *   window.testEmberAPI.testAll()
 */

// 优先使用环境变量，如果没有则使用生产 URL
const EMBER_API_URL = process.env.NEXT_PUBLIC_EMBER_API_URL ||
                      import.meta.env.VITE_EMBER_API_URL ||
                      'https://ember-api-yfcontxnkq-uc.a.run.app'; // 生产默认值

interface EmberTestAPI {
  health: () => Promise<void>;
  defaultMode: (message: string) => Promise<void>;
  multiMode: (message: string) => Promise<void>;
  ensembleMode: (message: string) => Promise<void>;
  batchMode: (messages: string[]) => Promise<void>;
  costStats: (userId: string, period?: string) => Promise<void>;
  cacheStats: () => Promise<void>;
  optimize: (message: string, mode: string) => Promise<void>;
  testAll: () => Promise<void>;
}

const EmberAPITester: EmberTestAPI = {
  /**
   * 测试健康检查
   */
  async health() {
    console.log('🏥 测试健康检查...');
    console.log(`📡 API URL: ${EMBER_API_URL}`);

    try {
      const response = await fetch(`${EMBER_API_URL}/health`);
      const data = await response.json();

      if (data.status === 'healthy') {
        console.log('✅ 健康检查通过');
        console.log('📊 详情:', data);
      } else {
        console.log('⚠️ 健康检查异常');
        console.log('📊 响应:', data);
      }
    } catch (error) {
      console.error('❌ 健康检查失败:', error);
    }
  },

  /**
   * 测试 Default 模式（快速问答）
   */
  async defaultMode(message: string = "你好") {
    console.log('⚡ 测试 Default 模式（快速问答）...');
    console.log(`💬 消息: "${message}"`);

    try {
      const startTime = Date.now();

      const response = await fetch(`${EMBER_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          mode: 'default',
          language: 'ZH'
          // 不传 user_id，避免在 Firestore 创建测试用户数据
        })
      });

      const data = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (data.success) {
        console.log('✅ Default 模式测试成功');
        console.log(`⏱️  响应时间: ${duration}秒`);
        console.log(`💰 成本: $${data.data.cost.toFixed(6)}`);
        console.log(`🤖 模型: ${data.data.model_used}`);
        console.log(`📊 Tokens: ${data.data.tokens.total}`);
        console.log(`💬 答案:\n${data.data.answer}`);
        console.log(`📦 完整响应:`, data);
      } else {
        console.log('❌ 测试失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 测试 Multi 模式（专家会诊）
   */
  async multiMode(message: string = "AI是什么? 简短回答") {
    console.log('👥 测试 Multi 模式（专家会诊）...');
    console.log(`💬 消息: "${message}"`);

    try {
      const startTime = Date.now();

      const response = await fetch(`${EMBER_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          mode: 'multi',
          language: 'ZH'
          // 不传 user_id，避免创建测试数据
        })
      });

      const data = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (data.success) {
        console.log('✅ Multi 模式测试成功');
        console.log(`⏱️  响应时间: ${duration}秒`);
        console.log(`💰 总成本: $${data.data.cost.toFixed(6)}`);
        console.log(`🤖 模式: ${data.data.model_used}`);

        if (Array.isArray(data.data.answer)) {
          console.log(`\n📝 收到 ${data.data.answer.length} 个 AI 的回答:\n`);

          data.data.answer.forEach((resp: any, idx: number) => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`答案 ${idx + 1}: ${resp.model}`);
            console.log(`成本: $${resp.cost.toFixed(6)}`);
            console.log(`内容:\n${resp.answer}`);
          });

          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        }

        console.log(`\n📦 完整响应:`, data);
      } else {
        console.log('❌ 测试失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 测试 Ensemble 模式（深度分析）
   */
  async ensembleMode(message: string = "AI最重要的特征是什么?") {
    console.log('🧠 测试 Ensemble 模式（深度分析）...');
    console.log(`💬 消息: "${message}"`);
    console.log('⏳ 预计需要 15-25 秒，请耐心等待...');

    try {
      const startTime = Date.now();

      const response = await fetch(`${EMBER_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          mode: 'ensemble',
          language: 'ZH'
          // 不传 user_id
        })
      });

      const data = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (data.success) {
        console.log('✅ Ensemble 模式测试成功');
        console.log(`⏱️  响应时间: ${duration}秒`);
        console.log(`💰 总成本: $${data.data.cost.toFixed(6)}`);
        console.log(`🤖 模式: ${data.data.model_used}`);

        console.log(`\n🎯 最终综合答案:\n${data.data.answer}\n`);

        if (data.data.candidates && Array.isArray(data.data.candidates)) {
          console.log(`\n📝 候选答案 (${data.data.candidates.length} 个):\n`);

          data.data.candidates.forEach((candidate: string, idx: number) => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`候选 ${idx + 1}:`);
            console.log(candidate);
          });

          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        }

        console.log(`\n📦 完整响应:`, data);
      } else {
        console.log('❌ 测试失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 测试 Batch 模式（批量处理）
   */
  async batchMode(messages: string[] = ["什么是Python?", "什么是JavaScript?", "什么是Rust?"]) {
    console.log('📋 测试 Batch 模式（批量处理）...');
    console.log(`💬 问题数量: ${messages.length}`);

    try {
      const startTime = Date.now();

      const response = await fetch(`${EMBER_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messages,
          mode: 'batch',
          language: 'ZH'
          // 不传 user_id
        })
      });

      const data = await response.json();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (data.success) {
        console.log('✅ Batch 模式测试成功');
        console.log(`⏱️  响应时间: ${duration}秒`);
        console.log(`💰 总成本: $${data.data.cost.toFixed(6)}`);
        console.log(`📊 平均: $${(data.data.cost / messages.length).toFixed(6)}/问题`);

        if (Array.isArray(data.data.answer)) {
          console.log(`\n📝 批量处理结果:\n`);

          data.data.answer.forEach((item: any, idx: number) => {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`问题 ${idx + 1}: ${item.question}`);
            console.log(`答案: ${item.answer}`);
          });

          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        }

        console.log(`\n📦 完整响应:`, data);
      } else {
        console.log('❌ 测试失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 查询成本统计
   */
  async costStats(userId: string, period: string = 'today') {
    console.log(`💰 查询成本统计...`);
    console.log(`👤 用户: ${userId}`);
    console.log(`📅 时间段: ${period}`);

    try {
      const response = await fetch(`${EMBER_API_URL}/cost/stats?user_id=${userId}&period=${period}`);
      const data = await response.json();

      if (data.success) {
        console.log('✅ 成本统计获取成功\n');

        const { summary, by_mode, by_model } = data.data;

        console.log('📊 总览:');
        console.log(`   总成本: $${summary.total_cost.toFixed(4)}`);
        console.log(`   总请求: ${summary.total_requests}`);
        console.log(`   总 Tokens: ${summary.total_tokens.toLocaleString()}`);
        console.log(`   平均成本: $${summary.avg_cost_per_request.toFixed(6)}/请求`);

        if (by_mode && Object.keys(by_mode).length > 0) {
          console.log('\n📋 按模式统计:');
          Object.entries(by_mode).forEach(([mode, stats]: [string, any]) => {
            console.log(`   ${mode}:`);
            console.log(`      请求: ${stats.requests}`);
            console.log(`      成本: $${stats.cost.toFixed(4)}`);
          });
        }

        if (by_model && Object.keys(by_model).length > 0) {
          console.log('\n🤖 按模型统计:');
          Object.entries(by_model).forEach(([model, stats]: [string, any]) => {
            console.log(`   ${model}:`);
            console.log(`      调用: ${stats.calls}`);
            console.log(`      成本: $${stats.cost.toFixed(4)}`);
          });
        }

        console.log('\n📦 完整数据:', data.data);
      } else {
        console.log('❌ 查询失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 查询缓存统计
   */
  async cacheStats() {
    console.log('🗄️  查询缓存统计...');

    try {
      const response = await fetch(`${EMBER_API_URL}/cache/stats`);
      const data = await response.json();

      if (data.success) {
        console.log('✅ 缓存统计获取成功');
        console.log('📊 统计:', data.data);
      } else {
        console.log('❌ 查询失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 获取成本优化建议
   */
  async optimize(message: string, mode: string = 'ensemble') {
    console.log('💡 获取成本优化建议...');
    console.log(`💬 消息: "${message}"`);
    console.log(`📋 当前模式: ${mode}`);

    try {
      const response = await fetch(`${EMBER_API_URL}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, mode })
      });

      const data = await response.json();

      if (data.success) {
        const { suggested_mode, reason, estimated_savings_percent } = data.data;

        if (suggested_mode !== mode) {
          console.log(`💡 建议优化:`);
          console.log(`   当前模式: ${mode}`);
          console.log(`   建议模式: ${suggested_mode}`);
          console.log(`   原因: ${reason}`);
          console.log(`   预计节省: ${estimated_savings_percent}%`);
        } else {
          console.log(`✅ 当前模式已是最优: ${mode}`);
        }

        console.log('\n📦 完整数据:', data.data);
      } else {
        console.log('❌ 查询失败');
        console.log('错误:', data.error);
      }
    } catch (error) {
      console.error('❌ 请求失败:', error);
    }
  },

  /**
   * 运行所有测试
   */
  async testAll() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('             Ember API 完整功能测试');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 测试 1: 健康检查
    console.log('【测试 1/6】健康检查');
    console.log('─────────────────────────────────────────────────────────────');
    await this.health();
    console.log('\n');

    // 等待 2 秒
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试 2: Default 模式
    console.log('【测试 2/6】Default 模式');
    console.log('─────────────────────────────────────────────────────────────');
    await this.defaultMode("什么是AI? 一句话");
    console.log('\n');

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试 3: 缓存统计
    console.log('【测试 3/6】缓存统计');
    console.log('─────────────────────────────────────────────────────────────');
    await this.cacheStats();
    console.log('\n');

    // 测试 4: 成本统计
    console.log('【测试 4/6】成本统计');
    console.log('─────────────────────────────────────────────────────────────');
    await this.costStats('console-test-user', 'today');
    console.log('\n');

    // 测试 5: 成本优化建议
    console.log('【测试 5/6】成本优化建议');
    console.log('─────────────────────────────────────────────────────────────');
    await this.optimize("你好", "ensemble");
    console.log('\n');

    // 测试 6: Multi 模式（可选，较慢）
    console.log('【测试 6/6】Multi 模式（较慢，约20秒）');
    console.log('─────────────────────────────────────────────────────────────');
    console.log('💡 提示: 此测试较慢，可以跳过');
    console.log('手动运行: window.testEmberAPI.multiMode("AI的未来?")');
    console.log('\n');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                   测试完成');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('💡 更多测试命令:');
    console.log('   window.testEmberAPI.multiMode("AI的未来?")');
    console.log('   window.testEmberAPI.ensembleMode("深度问题")');
    console.log('   window.testEmberAPI.batchMode(["Q1", "Q2", "Q3"])');
    console.log('');
  }
};

// 导出到 window 对象
if (typeof window !== 'undefined') {
  (window as any).testEmberAPI = EmberAPITester;

  console.log('🧪 Ember API 测试工具已加载');
  console.log('📡 API URL:', EMBER_API_URL);
  console.log('');
  console.log('可用命令:');
  console.log('  window.testEmberAPI.health()                    - 健康检查');
  console.log('  window.testEmberAPI.defaultMode("你好")          - 测试快速问答');
  console.log('  window.testEmberAPI.multiMode("AI是什么?")       - 测试专家会诊');
  console.log('  window.testEmberAPI.ensembleMode("AI的未来?")    - 测试深度分析');
  console.log('  window.testEmberAPI.batchMode(["Q1","Q2"])      - 测试批量处理');
  console.log('  window.testEmberAPI.costStats("userId")         - 查询成本统计');
  console.log('  window.testEmberAPI.cacheStats()                - 查询缓存统计');
  console.log('  window.testEmberAPI.optimize("消息", "模式")     - 优化建议');
  console.log('  window.testEmberAPI.testAll()                   - 运行所有测试');
  console.log('');
}

export default EmberAPITester;
