use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{Json, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};

use crate::blockchain::PolisProtocol;
use crate::types::*;
use crate::metrics::{MetricsCollector, ApiRequestTimer};

/// API服务器状态（共享状态）
pub struct ApiState {
    pub protocol: Arc<Mutex<PolisProtocol>>,
    pub metrics: Arc<MetricsCollector>,
}

/// API响应包装器
#[derive(Serialize)]
pub struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> ApiResponse<T> {
    fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

/// 全局统计信息响应
#[derive(Serialize)]
pub struct GlobalStatsResponse {
    pub active_allies_online: u64,
    pub total_union_strength: u64,
    pub capital_diverted_usd: f64,
    pub total_shards: u64,
    pub total_active_campaigns: u64,
}

/// 战役详情响应
#[derive(Serialize)]
pub struct CampaignResponse {
    pub id: String,
    pub title: String,
    pub target: String,
    pub campaign_type: String,
    pub participants: u64,
    pub goal: u64,
    pub progress_percentage: f64,
    pub days_active: u64,
    pub description: String,
}

/// 用户影响力响应
#[derive(Serialize)]
pub struct UserImpactResponse {
    pub campaigns: u64,
    pub streak: u64,
    pub redirected_usd: f64,
}

/// 提交行动请求
#[derive(Deserialize)]
pub struct SubmitActionRequest {
    pub user_did: String,
    pub action_type: String,
    pub target_entity: String,
    pub value_diverted: u64,
    pub zk_proof: String,
    pub shard_id: String,
}

/// 注册Firebase用户请求
#[derive(Deserialize)]
pub struct RegisterUserRequest {
    pub firebase_uid: String,
    pub display_name: String,
    pub economic: f32,
    pub social: f32,
    pub diplomatic: f32,
}

/// 记录用户行动请求
#[derive(Deserialize)]
pub struct RecordActionRequest {
    pub firebase_uid: String,
    pub action_type: String,
    pub target: String,
    pub value_cents: u64,
}

/// 用户心跳请求
#[derive(Deserialize)]
pub struct HeartbeatRequest {
    pub firebase_uid: String,
    pub is_online: bool,
}

/// 创建API路由
pub fn create_router(state: ApiState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/stats/global", get(get_global_stats))
        .route("/api/v1/campaigns", get(get_all_campaigns))
        .route("/api/v1/campaigns/:id", get(get_campaign))
        .route("/api/v1/user/:did/impact", get(get_user_impact))
        .route("/api/v1/actions/submit", post(submit_action))
        .route("/api/v1/users/register", post(register_user))
        .route("/api/v1/actions/record", post(record_action))
        .route("/api/v1/users/heartbeat", post(user_heartbeat))
        .route("/api/v1/blockchain/stats", get(get_blockchain_stats))
        .route("/api/v1/shards", get(get_all_shards))
        .route("/metrics", get(get_metrics))
        .layer(cors)
        .with_state(Arc::new(state))
}

/// 健康检查端点
async fn health_check(State(_state): State<Arc<ApiState>>) -> Json<ApiResponse<String>> {
    let timer = ApiRequestTimer::start();
    let result = Json(ApiResponse::success("Polis Protocol API is running".to_string()));
    timer.finish(false);
    result
}

/// Prometheus metrics endpoint
async fn get_metrics() -> Response {
    match MetricsCollector::export_metrics() {
        Ok(metrics) => (
            StatusCode::OK,
            [("Content-Type", "text/plain; version=0.0.4")],
            metrics,
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// 获取全局统计信息
async fn get_global_stats(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<GlobalStatsResponse>>, StatusCode> {
    let timer = ApiRequestTimer::start();

    let protocol = state.protocol.lock().unwrap();
    let stats = protocol.get_global_stats();

    // Update Prometheus metrics
    state.metrics.update_blockchain_stats(
        0, // total_blocks - will add later
        stats.total_shards,
        stats.total_online_nodes,
        stats.total_union_strength,
        stats.total_capital_diverted,
    );

    let response = GlobalStatsResponse {
        active_allies_online: stats.total_online_nodes,
        total_union_strength: stats.total_union_strength,
        capital_diverted_usd: stats.total_capital_diverted as f64 / 100.0,
        total_shards: stats.total_shards,
        total_active_campaigns: stats.total_active_campaigns,
    };

    timer.finish(false);
    Ok(Json(ApiResponse::success(response)))
}

/// 获取所有战役列表
async fn get_all_campaigns(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<Vec<CampaignResponse>>>, StatusCode> {
    let protocol = state.protocol.lock().unwrap();
    let mut campaigns = Vec::new();

    // 遍历所有分片，收集战役
    for shard in protocol.shards.values() {
        for campaign in &shard.state.active_campaigns {
            campaigns.push(CampaignResponse {
                id: campaign.campaign_id.clone(),
                title: format!("Campaign: {}", campaign.campaign_id),
                target: campaign.campaign_id.clone(),
                campaign_type: if campaign.verified_participants_count > campaign.goal_participants / 2 {
                    "BOYCOTT".to_string()
                } else {
                    "PETITION".to_string()
                },
                participants: campaign.verified_participants_count,
                goal: campaign.goal_participants,
                progress_percentage: campaign.progress_percentage(),
                days_active: calculate_days_active(campaign.created_at),
                description: format!("Join the movement for {}", campaign.campaign_id),
            });
        }
    }

    Ok(Json(ApiResponse::success(campaigns)))
}

/// 获取单个战役详情
async fn get_campaign(
    Path(id): Path<String>,
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<CampaignResponse>>, StatusCode> {
    let protocol = state.protocol.lock().unwrap();

    // 在所有分片中查找战役
    for shard in protocol.shards.values() {
        if let Some(campaign) = shard.get_campaign_state(&id) {
            let response = CampaignResponse {
                id: campaign.campaign_id.clone(),
                title: format!("Campaign: {}", campaign.campaign_id),
                target: campaign.campaign_id.clone(),
                campaign_type: "BOYCOTT".to_string(),
                participants: campaign.verified_participants_count,
                goal: campaign.goal_participants,
                progress_percentage: campaign.progress_percentage(),
                days_active: calculate_days_active(campaign.created_at),
                description: format!("Join the movement for {}", campaign.campaign_id),
            };

            return Ok(Json(ApiResponse::success(response)));
        }
    }

    Err(StatusCode::NOT_FOUND)
}

/// 获取用户影响力和统计信息
async fn get_user_impact(
    Path(did): Path<String>,
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<UserImpactResponse>>, StatusCode> {
    let protocol = state.protocol.lock().unwrap();

    let shard_ids: Vec<String> = protocol.shards.keys().cloned().collect();
    let stats = protocol.get_user_stats(&did, &shard_ids);

    let response = UserImpactResponse {
        campaigns: stats.campaigns_joined,
        streak: stats.streak_days,
        redirected_usd: stats.total_diverted as f64 / 100.0,
    };

    Ok(Json(ApiResponse::success(response)))
}

/// 提交行动
async fn submit_action(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<SubmitActionRequest>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    let mut protocol = state.protocol.lock().unwrap();

    // 解析行动类型
    let action_type = match request.action_type.as_str() {
        "BOYCOTT" => ActionType::Boycott,
        "BUYCOTT" => ActionType::Buycott,
        "VOTE" => ActionType::Vote,
        "DONATE" => ActionType::Donate,
        "RALLY" => ActionType::Rally,
        _ => return Err(StatusCode::BAD_REQUEST),
    };

    // 创建行动
    let action = ImpactAction {
        user_did: request.user_did,
        action_type,
        target_entity: request.target_entity,
        value_diverted: request.value_diverted,
        zk_proof: request.zk_proof,
        timestamp: chrono::Utc::now().timestamp(),
        action_id: uuid::Uuid::new_v4().to_string(),
    };

    // 提交到分片
    match protocol.submit_action(&request.shard_id, action) {
        Ok(_) => Ok(Json(ApiResponse::success(
            "Action submitted successfully".to_string(),
        ))),
        Err(e) => Ok(Json(ApiResponse::error(e))),
    }
}

/// 计算活跃天数
fn calculate_days_active(created_at: i64) -> u64 {
    let now = chrono::Utc::now().timestamp();
    let duration_seconds = now - created_at;
    (duration_seconds / 86400) as u64
}

/// 注册Firebase用户
async fn register_user(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<RegisterUserRequest>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    let mut protocol = state.protocol.lock().unwrap();

    match protocol.register_firebase_user(
        req.firebase_uid,
        req.display_name,
        (req.economic, req.social, req.diplomatic),
    ) {
        Ok(polis_did) => Ok(Json(ApiResponse::success(polis_did))),
        Err(e) => Ok(Json(ApiResponse::error(e))),
    }
}

/// 记录用户行动
async fn record_action(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<RecordActionRequest>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    let mut protocol = state.protocol.lock().unwrap();

    // 解析action type
    let action_type = match req.action_type.as_str() {
        "Buycott" => ActionType::Buycott,
        "Boycott" => ActionType::Boycott,
        _ => ActionType::Vote,
    };

    // 调用新的record_user_action，它会创建action并添加到blockchain
    match protocol.record_user_action(
        &req.firebase_uid,
        action_type,
        req.target,
        req.value_cents,
    ) {
        Ok(_) => Ok(Json(ApiResponse::success("Action recorded".to_string()))),
        Err(e) => Ok(Json(ApiResponse::error(e))),
    }
}

/// 用户心跳
async fn user_heartbeat(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<HeartbeatRequest>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    let mut protocol = state.protocol.lock().unwrap();

    match protocol.update_user_activity(&req.firebase_uid, req.is_online) {
        Ok(_) => Ok(Json(ApiResponse::success("Updated".to_string()))),
        Err(e) => Ok(Json(ApiResponse::error(e))),
    }
}

/// 获取区块链统计信息
async fn get_blockchain_stats(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<crate::blockchain::BlockchainStats>>, StatusCode> {
    let protocol = state.protocol.lock().unwrap();
    let stats = protocol.get_blockchain_stats();
    Ok(Json(ApiResponse::success(stats)))
}

/// 获取所有分片信息
async fn get_all_shards(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ApiResponse<Vec<crate::blockchain::ShardInfo>>>, StatusCode> {
    let protocol = state.protocol.lock().unwrap();
    let shards = protocol.get_shard_info();
    Ok(Json(ApiResponse::success(shards)))
}

/// 启动API服务器
pub async fn start_server(state: ApiState, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let app = create_router(state);
    let addr = format!("0.0.0.0:{}", port);

    println!("🚀 Polis Protocol API Server starting on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
