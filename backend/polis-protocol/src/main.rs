use polis_protocol::{
    api_server::{start_server, ApiState},
    initialize_demo_protocol, // DEMO MODE: Remove for production
    metrics::MetricsCollector,
};
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 初始化日志
    env_logger::init();

    println!("🌍 Initializing Polis Protocol - Decentralized Politics System");
    println!("📡 Based on Federated Sidechains Architecture (Polkadot/Cosmos-inspired)");
    println!();

    // ========== DEMO MODE TOGGLE ==========
    // Set USE_DEMO_DATA=false to disable demo data
    let use_demo = std::env::var("USE_DEMO_DATA")
        .unwrap_or_else(|_| "true".to_string())
        .parse::<bool>()
        .unwrap_or(true);

    // Initialize protocol with or without demo data
    let protocol = if use_demo {
        println!("🎭 [DEMO MODE ENABLED] Using demo data");
        println!("   To disable: export USE_DEMO_DATA=false");
        println!();
        // initialize_demo_protocol() creates all demo shards and data
        initialize_demo_protocol()
    } else {
        println!("🔒 [PRODUCTION MODE] Using real data only");
        println!("   Real user data will be tracked via Firebase integration");
        println!();
        // Empty protocol for production - will be populated with real user data
        polis_protocol::blockchain::PolisProtocol::new()
    };

    println!();
    println!("📊 Protocol Stats:");
    let stats = protocol.get_global_stats();
    println!("  Total Shards: {}", stats.total_shards);
    println!("  Online Nodes: {}", stats.total_online_nodes);
    println!("  Union Strength: {}", stats.total_union_strength);
    println!(
        "  Capital Diverted: ${:.2}",
        stats.total_capital_diverted as f64 / 100.0
    );
    println!("  Active Campaigns: {}", stats.total_active_campaigns);

    println!();
    println!("🚀 Starting API Server on port 8080...");
    println!("📡 API Endpoints:");
    println!("  GET  /api/v1/health");
    println!("  GET  /api/v1/stats/global");
    println!("  GET  /api/v1/campaigns");
    println!("  GET  /api/v1/campaigns/:id");
    println!("  GET  /api/v1/user/:did/stats");
    println!("  GET  /api/v1/user/:did/impact");
    println!("  POST /api/v1/actions/submit");
    println!("  GET  /api/v1/shards/:id/stats");
    println!();

    // 创建指标收集器
    let metrics = polis_protocol::MetricsCollector::new();

    // 创建API状态
    let api_state = ApiState {
        protocol: Arc::new(Mutex::new(protocol)),
        metrics: Arc::new(metrics),
    };

    // 启动服务器
    start_server(api_state, 8080).await?;

    Ok(())
}