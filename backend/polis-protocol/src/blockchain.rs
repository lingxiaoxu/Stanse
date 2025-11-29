use crate::types::*;
use chrono::Utc;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

/// 立场分片链 (Stance Shard Chain)
/// 每个分片代表一个特定的政治立场或议题
pub struct StanceShard {
    /// 分片ID（对应 MovementManifest 的 chain_id）
    pub shard_id: String,

    /// 该分片的政治立场向量范围
    pub ideology_range: IdeologyRange,

    /// 区块链状态
    pub state: DecentralizedPoliticianState,

    /// 待处理的行动池
    pub pending_actions: Vec<ImpactAction>,

    /// 节点状态映射（DID -> NodeStatus）
    pub nodes: HashMap<String, NodeStatus>,
}

/// 政治立场向量范围（用于确定用户是否属于这个分片）
#[derive(Debug, Clone)]
pub struct IdeologyRange {
    pub economic_min: f32,
    pub economic_max: f32,
    pub social_min: f32,
    pub social_max: f32,
    pub diplomatic_min: f32,
    pub diplomatic_max: f32,
}

impl IdeologyRange {
    /// 检查给定的立场向量是否在这个范围内
    pub fn contains(&self, vector: &[f32; 3]) -> bool {
        let [economic, social, diplomatic] = *vector;
        economic >= self.economic_min
            && economic <= self.economic_max
            && social >= self.social_min
            && social <= self.social_max
            && diplomatic >= self.diplomatic_min
            && diplomatic <= self.diplomatic_max
    }
}

impl StanceShard {
    /// 创建新的分片
    pub fn new(shard_id: String, ideology_range: IdeologyRange) -> Self {
        Self {
            shard_id,
            ideology_range,
            state: DecentralizedPoliticianState::new(),
            pending_actions: Vec::new(),
            nodes: HashMap::new(),
        }
    }

    /// 添加行动到待处理池
    pub fn add_pending_action(&mut self, action: ImpactAction) -> Result<(), String> {
        // 验证ZK证明
        if !action.verify_zk_proof() {
            return Err("Invalid ZK proof".to_string());
        }

        self.pending_actions.push(action);
        Ok(())
    }

    /// 生成新区块（区块生产者调用）
    pub fn produce_block(&mut self, validator: String) -> Result<PolisBlock, String> {
        if self.pending_actions.is_empty() {
            return Err("No pending actions to include in block".to_string());
        }

        let previous_block = self.state.latest_block();
        let index = self.state.height();
        let previous_hash = previous_block
            .map(|b| b.hash.clone())
            .unwrap_or_else(|| "0".repeat(64));

        // 计算Merkle根（简化版）
        let merkle_root = self.calculate_merkle_root(&self.pending_actions);

        // 创建区块
        let mut block = PolisBlock {
            index,
            timestamp: Utc::now().timestamp(),
            actions: self.pending_actions.clone(),
            previous_hash,
            union_strength: 0, // 待计算
            merkle_root,
            hash: String::new(), // 待计算
            validator,
        };

        // 计算联盟强度
        block.union_strength = block.calculate_strength();

        // 计算区块哈希
        block.hash = block.calculate_hash();

        // 清空待处理池
        self.pending_actions.clear();

        Ok(block)
    }

    /// 添加区块到链上
    pub fn add_block(&mut self, block: PolisBlock) -> Result<(), String> {
        self.state.add_block(block)
    }

    /// 计算Merkle根（简化版）
    fn calculate_merkle_root(&self, actions: &[ImpactAction]) -> String {
        if actions.is_empty() {
            return "0".repeat(64);
        }

        let mut hashes: Vec<String> = actions.iter().map(|a| a.hash()).collect();

        while hashes.len() > 1 {
            let mut next_level = Vec::new();
            for chunk in hashes.chunks(2) {
                let combined = if chunk.len() == 2 {
                    format!("{}{}", chunk[0], chunk[1])
                } else {
                    chunk[0].clone()
                };

                let mut hasher = Sha256::new();
                hasher.update(combined.as_bytes());
                next_level.push(format!("{:x}", hasher.finalize()));
            }
            hashes = next_level;
        }

        hashes[0].clone()
    }

    /// 更新节点状态（心跳）
    pub fn update_node_status(&mut self, node_id: String, is_online: bool) {
        let now = Utc::now().timestamp();
        self.nodes
            .entry(node_id.clone())
            .and_modify(|node| {
                node.is_online = is_online;
                node.last_heartbeat_block = self.state.height();
                node.last_updated = now;
            })
            .or_insert(NodeStatus {
                node_id,
                is_online,
                last_heartbeat_block: self.state.height(),
                active_shards: vec![self.shard_id.clone()],
                reputation_score: 0,
                last_updated: now,
            });

        // 更新在线节点数
        self.state.online_nodes_count = self.nodes.values().filter(|n| n.is_online).count() as u64;
    }

    /// 获取战役状态
    pub fn get_campaign_state(&self, campaign_id: &str) -> Option<&CampaignState> {
        self.state
            .active_campaigns
            .iter()
            .find(|c| c.campaign_id == campaign_id)
    }

    /// 更新战役状态
    pub fn update_campaign_state(&mut self, campaign_id: String, action: &ImpactAction) {
        // 查找或创建战役
        if let Some(campaign) = self
            .state
            .active_campaigns
            .iter_mut()
            .find(|c| c.campaign_id == campaign_id)
        {
            // 更新现有战役
            campaign.verified_participants_count += 1;
            campaign.total_capital_diverted += action.value_diverted;
            campaign.last_updated = Utc::now().timestamp();

            // 检查是否达成目标
            if campaign.is_goal_reached() && campaign.status == CampaignStatus::Active {
                campaign.status = CampaignStatus::Achieved;
            }
        }
    }

    /// 创建新战役
    pub fn create_campaign(
        &mut self,
        campaign_id: String,
        goal_participants: u64,
        duration_blocks: u64,
    ) -> Result<(), String> {
        // 检查是否已存在
        if self
            .state
            .active_campaigns
            .iter()
            .any(|c| c.campaign_id == campaign_id)
        {
            return Err("Campaign already exists".to_string());
        }

        let now = Utc::now().timestamp();
        let campaign = CampaignState {
            campaign_id,
            verified_participants_count: 0,
            goal_participants,
            total_capital_diverted: 0,
            end_block: self.state.height() + duration_blocks,
            action_proofs_root: String::new(),
            status: CampaignStatus::Active,
            created_at: now,
            last_updated: now,
        };

        self.state.active_campaigns.push(campaign);
        Ok(())
    }

    /// 获取分片统计信息
    pub fn get_stats(&self) -> ShardStats {
        ShardStats {
            shard_id: self.shard_id.clone(),
            block_height: self.state.height(),
            online_nodes: self.state.online_nodes_count,
            total_union_strength: self.state.total_union_strength,
            total_capital_diverted: self.state.total_capital_diverted,
            active_campaigns_count: self.state.active_campaigns.len() as u64,
            pending_actions_count: self.pending_actions.len() as u64,
        }
    }
}

/// 分片统计信息
#[derive(Debug, Clone)]
pub struct ShardStats {
    pub shard_id: String,
    pub block_height: u64,
    pub online_nodes: u64,
    pub total_union_strength: u64,
    pub total_capital_diverted: u64,
    pub active_campaigns_count: u64,
    pub pending_actions_count: u64,
}

/// Firebase用户信息
#[derive(Debug, Clone)]
pub struct FirebaseUserInfo {
    pub firebase_uid: String,
    pub polis_did: String,  // did:polis:firebase:{uid}
    pub display_name: String,
    pub coordinates: (f32, f32, f32),  // economic, social, diplomatic
    pub is_online: bool,
    pub last_activity: i64,
    pub total_actions: u64,
}

/// Polis Protocol 协调层 (Layer 0)
/// 管理所有分片的协调和用户路由
pub struct PolisProtocol {
    /// 所有立场分片的映射
    pub shards: HashMap<String, StanceShard>,

    /// 用户DID到分片ID的路由表
    pub user_routes: HashMap<String, Vec<String>>,

    /// Firebase用户映射 (Firebase UID → 用户信息)
    pub firebase_users: HashMap<String, FirebaseUserInfo>,
}

impl PolisProtocol {
    /// 创建新的协议实例
    pub fn new() -> Self {
        let mut protocol = Self {
            shards: HashMap::new(),
            user_routes: HashMap::new(),
            firebase_users: HashMap::new(),
        };

        // 初始化基础分片 - 覆盖所有政治立场空间
        // 这确保任何用户都能被正确路由到对应的shard

        // Shard 1: 左翼-自由派-鸽派（经济左，社会自由，外交温和）
        protocol.register_shard(StanceShard::new(
            "progressive-left".to_string(),
            IdeologyRange {
                economic_min: -100.0,
                economic_max: -20.0,
                social_min: 20.0,
                social_max: 100.0,
                diplomatic_min: -100.0,
                diplomatic_max: 100.0,
            },
        ));

        // Shard 2: 右翼-保守派-鹰派（经济右，社会保守，外交强硬）
        protocol.register_shard(StanceShard::new(
            "conservative-right".to_string(),
            IdeologyRange {
                economic_min: 20.0,
                economic_max: 100.0,
                social_min: -100.0,
                social_max: -20.0,
                diplomatic_min: -100.0,
                diplomatic_max: 100.0,
            },
        ));

        // Shard 3: 中立派（覆盖中间立场）
        protocol.register_shard(StanceShard::new(
            "centrist-moderate".to_string(),
            IdeologyRange {
                economic_min: -40.0,
                economic_max: 40.0,
                social_min: -40.0,
                social_max: 40.0,
                diplomatic_min: -100.0,
                diplomatic_max: 100.0,
            },
        ));

        // Shard 4: 经济左翼但社会保守（传统左派）
        protocol.register_shard(StanceShard::new(
            "traditional-left".to_string(),
            IdeologyRange {
                economic_min: -100.0,
                economic_max: -20.0,
                social_min: -100.0,
                social_max: 20.0,
                diplomatic_min: -100.0,
                diplomatic_max: 100.0,
            },
        ));

        // Shard 5: 经济右翼但社会自由（自由意志主义者）
        protocol.register_shard(StanceShard::new(
            "libertarian-right".to_string(),
            IdeologyRange {
                economic_min: 20.0,
                economic_max: 100.0,
                social_min: 20.0,
                social_max: 100.0,
                diplomatic_min: -100.0,
                diplomatic_max: 100.0,
            },
        ));

        protocol
    }

    /// 注册新分片
    pub fn register_shard(&mut self, shard: StanceShard) {
        self.shards.insert(shard.shard_id.clone(), shard);
    }

    /// 根据用户的政治立场向量路由到合适的分片
    pub fn route_user(&self, ideology_vector: &[f32; 3]) -> Vec<String> {
        self.shards
            .values()
            .filter(|shard| shard.ideology_range.contains(ideology_vector))
            .map(|shard| shard.shard_id.clone())
            .collect()
    }

    /// 提交行动到对应的分片
    pub fn submit_action(
        &mut self,
        shard_id: &str,
        action: ImpactAction,
    ) -> Result<(), String> {
        let shard = self
            .shards
            .get_mut(shard_id)
            .ok_or("Shard not found")?;

        shard.add_pending_action(action)
    }

    /// 获取全局统计信息（聚合所有分片）
    pub fn get_global_stats(&self) -> GlobalStats {
        let mut total_online_nodes = 0;
        let mut total_union_strength = 0;
        let mut total_capital_diverted = 0;
        let mut total_campaigns = 0;

        for shard in self.shards.values() {
            let stats = shard.get_stats();
            total_online_nodes += stats.online_nodes;
            total_union_strength += stats.total_union_strength;
            total_capital_diverted += stats.total_capital_diverted;
            total_campaigns += stats.active_campaigns_count;
        }

        GlobalStats {
            total_shards: self.shards.len() as u64,
            total_online_nodes,
            total_union_strength,
            total_capital_diverted,
            total_active_campaigns: total_campaigns,
        }
    }

    /// 获取特定用户的统计信息
    pub fn get_user_stats(&self, user_did: &str, shard_ids: &[String]) -> UserStats {
        let mut campaigns_joined = 0;
        let mut total_actions = 0;
        let mut total_diverted = 0;
        let mut last_action_timestamp = 0i64;
        let mut earliest_action_timestamp = i64::MAX;

        for shard_id in shard_ids {
            if let Some(shard) = self.shards.get(shard_id) {
                // 统计该用户在这个分片的所有行动
                for block in &shard.state.blockchain {
                    for action in &block.actions {
                        if action.user_did == user_did {
                            total_actions += 1;
                            total_diverted += action.value_diverted;
                            last_action_timestamp = last_action_timestamp.max(action.timestamp);
                            earliest_action_timestamp =
                                earliest_action_timestamp.min(action.timestamp);

                            // 统计参与的战役数（简化：每个不同的target_entity算一个战役）
                            campaigns_joined += 1;
                        }
                    }
                }
            }
        }

        // 计算连续活跃天数（简化版）
        let streak_days = if earliest_action_timestamp < i64::MAX {
            let duration_seconds = last_action_timestamp - earliest_action_timestamp;
            (duration_seconds / 86400) as u64 // 转换为天数
        } else {
            0
        };

        UserStats {
            campaigns_joined,
            streak_days,
            total_diverted,
            total_actions,
        }
    }

    /// 注册Firebase用户
    pub fn register_firebase_user(
        &mut self,
        firebase_uid: String,
        display_name: String,
        coordinates: (f32, f32, f32),
    ) -> Result<String, String> {
        let polis_did = format!("did:polis:firebase:{}", firebase_uid);
        let ideology_vector = [coordinates.0, coordinates.1, coordinates.2];

        // 路由到合适的shard
        let shard_ids = self.route_user(&ideology_vector);

        // 在每个shard中添加用户节点
        for shard_id in &shard_ids {
            if let Some(shard) = self.shards.get_mut(shard_id) {
                shard.update_node_status(polis_did.clone(), true);
            }
        }

        // 保存用户信息
        self.firebase_users.insert(
            firebase_uid.clone(),
            FirebaseUserInfo {
                firebase_uid: firebase_uid.clone(),
                polis_did: polis_did.clone(),
                display_name,
                coordinates,
                is_online: true,
                last_activity: Utc::now().timestamp(),
                total_actions: 0,
            },
        );

        self.user_routes.insert(polis_did.clone(), shard_ids);
        Ok(polis_did)
    }

    /// 更新用户活动状态
    pub fn update_user_activity(&mut self, firebase_uid: &str, is_online: bool) -> Result<(), String> {
        let user = self
            .firebase_users
            .get_mut(firebase_uid)
            .ok_or("User not found")?;

        user.is_online = is_online;
        user.last_activity = Utc::now().timestamp();

        // 更新所有相关shard的节点状态
        if let Some(shard_ids) = self.user_routes.get(&user.polis_did) {
            for shard_id in shard_ids {
                if let Some(shard) = self.shards.get_mut(shard_id) {
                    shard.update_node_status(user.polis_did.clone(), is_online);
                }
            }
        }

        Ok(())
    }

    /// 记录用户行动
    pub fn record_user_action(
        &mut self,
        firebase_uid: &str,
        action_type: ActionType,
        target: String,
        value_cents: u64,
    ) -> Result<(), String> {
        // 获取用户信息
        let user = self
            .firebase_users
            .get(firebase_uid)
            .ok_or("User not found")?;

        let polis_did = user.polis_did.clone();

        // 创建 ImpactAction
        let action = ImpactAction {
            user_did: polis_did.clone(),
            action_type,
            target_entity: target,
            value_diverted: value_cents,
            zk_proof: format!("firebase_verified_{}", firebase_uid), // 简化版ZK证明
            timestamp: Utc::now().timestamp(),
            action_id: uuid::Uuid::new_v4().to_string(),
        };

        // 将action添加到用户所属的所有shard
        if let Some(shard_ids) = self.user_routes.get(&polis_did) {
            for shard_id in shard_ids {
                if let Some(shard) = self.shards.get_mut(shard_id) {
                    // 自动创建或更新 campaign（以 target_entity 作为 campaign_id）
                    let campaign_id = action.target_entity.clone();

                    // 检查 campaign 是否存在，如果不存在则创建
                    if shard.get_campaign_state(&campaign_id).is_none() {
                        // 创建新 campaign，默认目标参与者数为 1000，持续时间为 10000 个区块
                        if let Err(e) = shard.create_campaign(campaign_id.clone(), 1000, 10000) {
                            eprintln!("Failed to create campaign {}: {}", campaign_id, e);
                        }
                    }

                    // 更新 campaign 状态
                    shard.update_campaign_state(campaign_id, &action);

                    shard.add_pending_action(action.clone())?;

                    // 如果待处理action数量达到阈值，自动生成区块
                    if shard.pending_actions.len() >= 1 {
                        match shard.produce_block(polis_did.clone()) {
                            Ok(block) => {
                                shard.add_block(block)?;
                            }
                            Err(e) => {
                                eprintln!("Failed to produce block: {}", e);
                            }
                        }
                    }
                }
            }
        }

        // 更新用户的行动计数
        if let Some(user) = self.firebase_users.get_mut(firebase_uid) {
            user.total_actions += 1;
        }

        Ok(())
    }

    /// 获取区块链统计信息
    pub fn get_blockchain_stats(&self) -> BlockchainStats {
        let mut total_blocks = 0u64;
        let mut total_pending_actions = 0u64;
        let mut latest_block_timestamp = 0i64;
        let mut total_transactions = 0u64;

        // 遍历所有shard统计区块链数据
        for shard in self.shards.values() {
            let shard_height = shard.state.height();
            total_blocks += shard_height;
            total_pending_actions += shard.pending_actions.len() as u64;

            // 获取最新区块的时间戳
            if shard_height > 0 {
                if let Some(latest_block) = shard.state.blockchain.last() {
                    if latest_block.timestamp > latest_block_timestamp {
                        latest_block_timestamp = latest_block.timestamp;
                    }
                }
            }

            // 统计区块中的总交易数
            for block in &shard.state.blockchain {
                total_transactions += block.actions.len() as u64;
            }
        }

        // 计算TPS（基于最近10秒的交易数）
        let current_time = chrono::Utc::now().timestamp();
        let tps = if latest_block_timestamp > 0 {
            let time_diff = (current_time - latest_block_timestamp).max(1);
            if time_diff <= 10 {
                (total_transactions as f64 / time_diff as f64) as u64
            } else {
                0
            }
        } else {
            0
        };

        BlockchainStats {
            total_blocks,
            total_shards: self.shards.len() as u64,
            total_pending_actions,
            latest_block_timestamp,
            transactions_per_second: tps,
        }
    }

    /// 获取所有分片信息
    pub fn get_shard_info(&self) -> Vec<ShardInfo> {
        self.shards
            .values()
            .map(|shard| ShardInfo {
                shard_id: shard.shard_id.clone(),
                block_height: shard.state.height(),
                pending_actions: shard.pending_actions.len() as u64,
                active_nodes: shard.state.online_nodes_count,
            })
            .collect()
    }

    /// 获取所有在线用户信息
    pub fn get_online_users(&self) -> Vec<OnlineUserInfo> {
        self.firebase_users
            .values()
            .filter(|user| user.is_online)
            .map(|user| {
                // 收集用户所在的所有分片信息
                let mut shard_memberships = Vec::new();

                // 从 user_routes 获取用户的分片列表
                if let Some(shard_ids) = self.user_routes.get(&user.polis_did) {
                    for shard_id in shard_ids {
                        // 检查分片中是否存在该用户的节点
                        if let Some(shard) = self.shards.get(shard_id) {
                            if let Some(node) = shard.nodes.get(&user.polis_did) {
                                shard_memberships.push(ShardMembership {
                                    shard_id: shard_id.clone(),
                                    joined_at: user.last_activity, // 简化版：使用last_activity作为joined_at
                                    left_at: if node.is_online { None } else { Some(user.last_activity) },
                                    is_active: node.is_online,
                                });
                            } else {
                                // 如果在路由表中但不在节点列表中，说明曾经活跃但现在不活跃
                                shard_memberships.push(ShardMembership {
                                    shard_id: shard_id.clone(),
                                    joined_at: user.last_activity,
                                    left_at: Some(user.last_activity),
                                    is_active: false,
                                });
                            }
                        }
                    }
                }

                OnlineUserInfo {
                    firebase_uid: user.firebase_uid.clone(),
                    polis_did: user.polis_did.clone(),
                    display_name: user.display_name.clone(),
                    last_activity: user.last_activity,
                    shards: shard_memberships,
                }
            })
            .collect()
    }
}

/// 区块链统计信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct BlockchainStats {
    pub total_blocks: u64,
    pub total_shards: u64,
    pub total_pending_actions: u64,
    pub latest_block_timestamp: i64,
    pub transactions_per_second: u64,
}

/// 分片信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct ShardInfo {
    pub shard_id: String,
    pub block_height: u64,
    pub pending_actions: u64,
    pub active_nodes: u64,
}

/// 用户在分片中的活动信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct ShardMembership {
    pub shard_id: String,
    pub joined_at: i64,        // 加入分片的时间戳
    pub left_at: Option<i64>,  // 离开分片的时间戳 (None = 仍在分片中)
    pub is_active: bool,       // 当前是否活跃在该分片
}

/// 在线用户信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct OnlineUserInfo {
    pub firebase_uid: String,
    pub polis_did: String,
    pub display_name: String,
    pub last_activity: i64,
    pub shards: Vec<ShardMembership>,  // 用户所在的所有分片
}

/// 全局统计信息
#[derive(Debug, Clone)]
pub struct GlobalStats {
    pub total_shards: u64,
    pub total_online_nodes: u64,
    pub total_union_strength: u64,
    pub total_capital_diverted: u64,
    pub total_active_campaigns: u64,
}

/// 用户统计信息
#[derive(Debug, Clone)]
pub struct UserStats {
    pub campaigns_joined: u64,
    pub streak_days: u64,
    pub total_diverted: u64,
    pub total_actions: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ideology_range() {
        let range = IdeologyRange {
            economic_min: -50.0,
            economic_max: 50.0,
            social_min: 0.0,
            social_max: 100.0,
            diplomatic_min: -100.0,
            diplomatic_max: 100.0,
        };

        assert!(range.contains(&[0.0, 50.0, 0.0]));
        assert!(!range.contains(&[-60.0, 50.0, 0.0]));
    }

    #[test]
    fn test_shard_creation() {
        let range = IdeologyRange {
            economic_min: -100.0,
            economic_max: -50.0,
            social_min: 50.0,
            social_max: 100.0,
            diplomatic_min: 0.0,
            diplomatic_max: 100.0,
        };

        let shard = StanceShard::new("green-energy-2025".to_string(), range);
        assert_eq!(shard.shard_id, "green-energy-2025");
        assert_eq!(shard.state.height(), 0);
    }
}
