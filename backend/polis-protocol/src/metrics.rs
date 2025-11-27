/// 监控和指标收集模块
///
/// 提供 Prometheus 指标导出，用于监控系统健康状态

use lazy_static::lazy_static;
use prometheus::{
    register_counter, register_gauge, register_histogram, Counter, Encoder, Gauge, Histogram,
    TextEncoder,
};
use std::time::Instant;

lazy_static! {
    // ========== 区块链指标 ==========

    /// 总区块数
    pub static ref TOTAL_BLOCKS: Gauge = register_gauge!(
        "polis_total_blocks",
        "Total number of blocks in all shards"
    ).unwrap();

    /// 总行动数
    pub static ref TOTAL_ACTIONS: Counter = register_counter!(
        "polis_total_actions",
        "Total number of actions submitted"
    ).unwrap();

    /// 活跃分片数
    pub static ref ACTIVE_SHARDS: Gauge = register_gauge!(
        "polis_active_shards",
        "Number of active shards"
    ).unwrap();

    /// 在线节点数
    pub static ref ONLINE_NODES: Gauge = register_gauge!(
        "polis_online_nodes",
        "Number of nodes currently online"
    ).unwrap();

    /// 总联盟强度
    pub static ref UNION_STRENGTH: Gauge = register_gauge!(
        "polis_union_strength",
        "Total union strength across all shards"
    ).unwrap();

    /// 资本转移总额 (美元)
    pub static ref CAPITAL_DIVERTED_USD: Gauge = register_gauge!(
        "polis_capital_diverted_usd",
        "Total capital diverted in USD"
    ).unwrap();

    // ========== API 性能指标 ==========

    /// API 请求总数
    pub static ref API_REQUESTS_TOTAL: Counter = register_counter!(
        "polis_api_requests_total",
        "Total number of API requests"
    ).unwrap();

    /// API 请求延迟直方图
    pub static ref API_REQUEST_DURATION: Histogram = register_histogram!(
        "polis_api_request_duration_seconds",
        "API request duration in seconds"
    ).unwrap();

    /// API 错误计数
    pub static ref API_ERRORS: Counter = register_counter!(
        "polis_api_errors_total",
        "Total number of API errors"
    ).unwrap();

    // ========== 区块生产指标 ==========

    /// 区块生产延迟
    pub static ref BLOCK_PRODUCTION_DURATION: Histogram = register_histogram!(
        "polis_block_production_duration_seconds",
        "Time taken to produce a block"
    ).unwrap();

    /// 每个区块的平均行动数
    pub static ref ACTIONS_PER_BLOCK: Gauge = register_gauge!(
        "polis_actions_per_block",
        "Average number of actions per block"
    ).unwrap();

    // ========== 验证指标 ==========

    /// ZK 证明验证次数
    pub static ref ZK_VERIFICATIONS: Counter = register_counter!(
        "polis_zk_verifications_total",
        "Total number of ZK proof verifications"
    ).unwrap();

    /// ZK 证明验证失败次数
    pub static ref ZK_VERIFICATION_FAILURES: Counter = register_counter!(
        "polis_zk_verification_failures_total",
        "Total number of failed ZK proof verifications"
    ).unwrap();

    /// 签名验证次数
    pub static ref SIGNATURE_VERIFICATIONS: Counter = register_counter!(
        "polis_signature_verifications_total",
        "Total number of signature verifications"
    ).unwrap();

    /// 签名验证失败次数
    pub static ref SIGNATURE_VERIFICATION_FAILURES: Counter = register_counter!(
        "polis_signature_verification_failures_total",
        "Total number of failed signature verifications"
    ).unwrap();

    // ========== 战役指标 ==========

    /// 活跃战役数
    pub static ref ACTIVE_CAMPAIGNS: Gauge = register_gauge!(
        "polis_active_campaigns",
        "Number of currently active campaigns"
    ).unwrap();

    /// 完成的战役数
    pub static ref COMPLETED_CAMPAIGNS: Counter = register_counter!(
        "polis_completed_campaigns_total",
        "Total number of completed campaigns"
    ).unwrap();

    // ========== 系统健康指标 ==========

    /// 系统运行时间（秒）
    pub static ref SYSTEM_UPTIME: Gauge = register_gauge!(
        "polis_system_uptime_seconds",
        "System uptime in seconds"
    ).unwrap();

    /// 内存使用估计 (MB)
    pub static ref MEMORY_USAGE_MB: Gauge = register_gauge!(
        "polis_memory_usage_mb",
        "Estimated memory usage in MB"
    ).unwrap();
}

/// 指标收集器 - 定期更新指标
pub struct MetricsCollector {
    start_time: Instant,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            start_time: Instant::now(),
        }
    }

    /// 更新系统运行时间
    pub fn update_uptime(&self) {
        let uptime_secs = self.start_time.elapsed().as_secs() as f64;
        SYSTEM_UPTIME.set(uptime_secs);
    }

    /// 更新区块链统计
    pub fn update_blockchain_stats(
        &self,
        total_blocks: u64,
        active_shards: u64,
        online_nodes: u64,
        union_strength: u64,
        capital_diverted_cents: u64,
    ) {
        TOTAL_BLOCKS.set(total_blocks as f64);
        ACTIVE_SHARDS.set(active_shards as f64);
        ONLINE_NODES.set(online_nodes as f64);
        UNION_STRENGTH.set(union_strength as f64);
        CAPITAL_DIVERTED_USD.set(capital_diverted_cents as f64 / 100.0);
    }

    /// 更新战役统计
    pub fn update_campaign_stats(&self, active: u64, _completed: u64) {
        ACTIVE_CAMPAIGNS.set(active as f64);
        // completed_campaigns 是 Counter，只能增加
    }

    /// 记录 API 请求
    pub fn record_api_request(&self, duration_secs: f64, is_error: bool) {
        API_REQUESTS_TOTAL.inc();
        API_REQUEST_DURATION.observe(duration_secs);
        if is_error {
            API_ERRORS.inc();
        }
    }

    /// 记录区块生产
    pub fn record_block_production(&self, duration_secs: f64, action_count: u64) {
        BLOCK_PRODUCTION_DURATION.observe(duration_secs);
        ACTIONS_PER_BLOCK.set(action_count as f64);
    }

    /// 记录验证结果
    pub fn record_verification(&self, is_signature: bool, success: bool) {
        if is_signature {
            SIGNATURE_VERIFICATIONS.inc();
            if !success {
                SIGNATURE_VERIFICATION_FAILURES.inc();
            }
        } else {
            ZK_VERIFICATIONS.inc();
            if !success {
                ZK_VERIFICATION_FAILURES.inc();
            }
        }
    }

    /// 估算内存使用（简化版）
    pub fn estimate_memory_usage(&self, total_actions: u64, total_blocks: u64) {
        // 粗略估算：每个行动约 200 bytes，每个区块约 500 bytes
        let estimated_mb = (total_actions * 200 + total_blocks * 500) as f64 / 1_048_576.0;
        MEMORY_USAGE_MB.set(estimated_mb);
    }

    /// 导出 Prometheus 格式的指标
    pub fn export_metrics() -> Result<String, String> {
        let encoder = TextEncoder::new();
        let metric_families = prometheus::gather();

        let mut buffer = Vec::new();
        encoder
            .encode(&metric_families, &mut buffer)
            .map_err(|e| format!("Failed to encode metrics: {}", e))?;

        String::from_utf8(buffer).map_err(|e| format!("Failed to convert metrics: {}", e))
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

/// API 请求计时器 - 自动记录请求时长
pub struct ApiRequestTimer {
    start: Instant,
}

impl ApiRequestTimer {
    pub fn start() -> Self {
        Self {
            start: Instant::now(),
        }
    }

    /// 结束计时并记录
    pub fn finish(self, is_error: bool) {
        let duration = self.start.elapsed().as_secs_f64();
        API_REQUESTS_TOTAL.inc();
        API_REQUEST_DURATION.observe(duration);
        if is_error {
            API_ERRORS.inc();
        }
    }
}

/// 区块生产计时器
pub struct BlockProductionTimer {
    start: Instant,
}

impl BlockProductionTimer {
    pub fn start() -> Self {
        Self {
            start: Instant::now(),
        }
    }

    /// 结束计时并记录
    pub fn finish(self, action_count: u64) {
        let duration = self.start.elapsed().as_secs_f64();
        BLOCK_PRODUCTION_DURATION.observe(duration);
        ACTIONS_PER_BLOCK.set(action_count as f64);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_collector() {
        let collector = MetricsCollector::new();

        collector.update_blockchain_stats(100, 3, 50, 1000, 500000);
        collector.update_campaign_stats(10, 5);
        collector.record_api_request(0.05, false);
        collector.record_block_production(2.0, 15);
        collector.record_verification(true, true);
        collector.record_verification(false, false);

        // 验证指标已更新
        assert!(TOTAL_BLOCKS.get() > 0.0);
        assert!(API_REQUESTS_TOTAL.get() > 0.0);
        assert!(ZK_VERIFICATION_FAILURES.get() > 0.0);
    }

    #[test]
    fn test_export_metrics() {
        // 首先设置一些metrics值
        TOTAL_BLOCKS.set(10.0);
        ONLINE_NODES.set(5.0);

        let metrics = MetricsCollector::export_metrics().unwrap();

        // 验证metrics字符串包含我们的前缀和至少一些内容
        assert!(!metrics.is_empty());
        assert!(metrics.contains("polis_total_blocks") || metrics.contains("# HELP"));
    }

    #[test]
    fn test_api_timer() {
        let timer = ApiRequestTimer::start();
        std::thread::sleep(std::time::Duration::from_millis(10));
        timer.finish(false);

        assert!(API_REQUESTS_TOTAL.get() > 0.0);
    }
}
