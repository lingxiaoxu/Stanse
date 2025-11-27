use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

/// 政治立场/议题的定义 (The Chain ID)
/// 不同的议题运行在不同的通道上，实现"多立场隔离"
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct MovementManifest {
    /// 链ID，例如: "green-energy-2025" 或 "fair-wages-initiative"
    pub chain_id: String,

    /// 政治立场向量 [经济(-100到100), 社会(-100到100), 外交(-100到100)]
    /// 用于确定用户是否属于这个分片
    pub ideology_vector: [f32; 3],

    /// 创世区块哈希
    pub genesis_block_hash: String,

    /// 战役描述
    pub description: String,

    /// 目标参与人数
    pub goal_participants: u64,

    /// 创建时间戳
    pub created_at: i64,
}

/// 行动类型枚举
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum ActionType {
    /// 抵制某个实体
    Boycott,
    /// 支持某个实体
    Buycott,
    /// 参与投票/签名
    Vote,
    /// 捐赠
    Donate,
    /// 参与集会
    Rally,
}

impl fmt::Display for ActionType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ActionType::Boycott => write!(f, "BOYCOTT"),
            ActionType::Buycott => write!(f, "BUYCOTT"),
            ActionType::Vote => write!(f, "VOTE"),
            ActionType::Donate => write!(f, "DONATE"),
            ActionType::Rally => write!(f, "RALLY"),
        }
    }
}

/// 影响力证明 (Proof of Impact)
/// 这不是转账，而是"政治行为"的上链记录
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImpactAction {
    /// 去中心化身份 (DID)，使用公钥哈希，保护隐私
    pub user_did: String,

    /// 行动类型
    pub action_type: ActionType,

    /// 目标实体（公司、政客、法案等）
    pub target_entity: String,

    /// 估算的资金转移量（单位：美分，避免浮点数）
    pub value_diverted: u64,

    /// 零知识证明（简化版，真实环境需要 zk-SNARKs）
    /// 证明："我执行了行动X，但不暴露我的身份或具体细节"
    pub zk_proof: String,

    /// 时间戳（Unix时间戳）
    pub timestamp: i64,

    /// 行动ID（唯一标识）
    pub action_id: String,
}

impl ImpactAction {
    /// 生成行动的哈希值（用于区块链验证）
    pub fn hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.user_did.as_bytes());
        hasher.update(self.action_type.to_string().as_bytes());
        hasher.update(self.target_entity.as_bytes());
        hasher.update(&self.value_diverted.to_le_bytes());
        hasher.update(&self.timestamp.to_le_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// 验证零知识证明（简化版）
    pub fn verify_zk_proof(&self) -> bool {
        // 真实实现需要 zk-SNARK 验证
        // 这里简化为检查proof不为空且格式正确
        // Firebase verified proofs格式: "firebase_verified_{uid}"
        !self.zk_proof.is_empty() &&
        (self.zk_proof.starts_with("firebase_verified_") || self.zk_proof.len() >= 32)
    }
}

/// Polis 区块结构
/// 每个区块记录一段时间内该"政治运动"的所有集体行为
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PolisBlock {
    /// 区块高度/索引
    pub index: u64,

    /// 区块时间戳
    pub timestamp: i64,

    /// 这个区块中的所有行动
    pub actions: Vec<ImpactAction>,

    /// 前一个区块的哈希（链式结构）
    pub previous_hash: String,

    /// 联盟强度（参与人数 × 活跃度）
    pub union_strength: u64,

    /// Merkle根（所有行动的默克尔树根，用于快速验证）
    pub merkle_root: String,

    /// 当前区块的哈希
    pub hash: String,

    /// 区块创建者（验证节点）
    pub validator: String,
}

impl PolisBlock {
    /// 计算当前区块的联盟强度
    pub fn calculate_strength(&self) -> u64 {
        // 简化算法：行动数量作为强度指标
        // 真实环境可以加权：Boycott权重高于Vote
        self.actions.len() as u64
    }

    /// 计算区块哈希
    pub fn calculate_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(&self.index.to_le_bytes());
        hasher.update(&self.timestamp.to_le_bytes());
        hasher.update(self.previous_hash.as_bytes());
        hasher.update(self.merkle_root.as_bytes());
        hasher.update(&self.union_strength.to_le_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// 验证区块的完整性
    pub fn verify(&self, previous_block: Option<&PolisBlock>) -> bool {
        // 1. 验证哈希是否正确
        if self.hash != self.calculate_hash() {
            return false;
        }

        // 2. 验证前一个区块的链接
        if let Some(prev) = previous_block {
            if self.previous_hash != prev.hash {
                return false;
            }
            if self.index != prev.index + 1 {
                return false;
            }
        }

        // 3. 验证所有行动的ZK证明
        for action in &self.actions {
            if !action.verify_zk_proof() {
                return false;
            }
        }

        true
    }
}

/// 战役状态（智能合约状态）
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CampaignState {
    /// 战役ID（对应 MovementManifest 的 chain_id）
    pub campaign_id: String,

    /// 已验证的参与人数
    pub verified_participants_count: u64,

    /// 目标人数
    pub goal_participants: u64,

    /// 总共转移/剥离的资本（美分）
    pub total_capital_diverted: u64,

    /// 战役结束区块高度
    pub end_block: u64,

    /// 行动证明的Merkle根
    pub action_proofs_root: String,

    /// 当前战役状态
    pub status: CampaignStatus,

    /// 创建时间
    pub created_at: i64,

    /// 最后更新时间
    pub last_updated: i64,
}

/// 战役状态枚举
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum CampaignStatus {
    /// 活跃中
    Active,
    /// 已完成目标
    Achieved,
    /// 已过期
    Expired,
    /// 暂停
    Paused,
}

impl CampaignState {
    /// 计算进度百分比
    pub fn progress_percentage(&self) -> f64 {
        if self.goal_participants == 0 {
            return 0.0;
        }
        (self.verified_participants_count as f64 / self.goal_participants as f64 * 100.0)
            .min(100.0)
    }

    /// 检查是否达成目标
    pub fn is_goal_reached(&self) -> bool {
        self.verified_participants_count >= self.goal_participants
    }

    /// 转换为美元显示（从美分转换）
    pub fn capital_diverted_usd(&self) -> f64 {
        self.total_capital_diverted as f64 / 100.0
    }
}

/// 节点状态（用于统计在线盟友数）
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NodeStatus {
    /// 节点ID（公钥哈希）
    pub node_id: String,

    /// 是否在线
    pub is_online: bool,

    /// 最后心跳区块高度
    pub last_heartbeat_block: u64,

    /// 该节点活跃的分片ID列表
    pub active_shards: Vec<String>,

    /// 节点声望分数（基于历史贡献）
    pub reputation_score: u64,

    /// 最后更新时间
    pub last_updated: i64,
}

/// 零知识行动证明（提交格式）
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ZKActionProof {
    /// 临时匿名标识符（ephemeral DID）
    pub ephemeral_id: String,

    /// 针对哪个战役
    pub campaign_target: String,

    /// zk-SNARK 证明的字节数组（Base64编码）
    pub zk_proof_bytes: String,

    /// 加密后的行动元数据（可选，仅供审计）
    pub encrypted_metadata: Option<String>,

    /// 证明生成时间
    pub generated_at: i64,
}

/// 去中心化政治家状态（整个Polis网络的状态）
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DecentralizedPoliticianState {
    /// 区块链（所有区块的链）
    pub blockchain: Vec<PolisBlock>,

    /// 国库（DAO treasury，捐赠资金池，以美分计）
    pub treasury: u64,

    /// 当前活跃的战役列表
    pub active_campaigns: Vec<CampaignState>,

    /// 在线节点数
    pub online_nodes_count: u64,

    /// 总联盟强度
    pub total_union_strength: u64,

    /// 总转移资本
    pub total_capital_diverted: u64,
}

impl DecentralizedPoliticianState {
    /// 创建新的状态（创世状态）
    pub fn new() -> Self {
        Self {
            blockchain: Vec::new(),
            treasury: 0,
            active_campaigns: Vec::new(),
            online_nodes_count: 0,
            total_union_strength: 0,
            total_capital_diverted: 0,
        }
    }

    /// 添加新区块
    pub fn add_block(&mut self, block: PolisBlock) -> Result<(), String> {
        // 验证区块
        let previous_block = self.blockchain.last();
        if !block.verify(previous_block) {
            return Err("Block verification failed".to_string());
        }

        // 更新状态
        self.total_union_strength += block.union_strength;
        for action in &block.actions {
            self.total_capital_diverted += action.value_diverted;
        }

        // 添加区块
        self.blockchain.push(block);
        Ok(())
    }

    /// 获取最新区块
    pub fn latest_block(&self) -> Option<&PolisBlock> {
        self.blockchain.last()
    }

    /// 获取区块链高度
    pub fn height(&self) -> u64 {
        self.blockchain.len() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_impact_action_hash() {
        let action = ImpactAction {
            user_did: "did:polis:abc123".to_string(),
            action_type: ActionType::Boycott,
            target_entity: "MegaCorp".to_string(),
            value_diverted: 5000, // $50.00
            zk_proof: "proof_data_here_with_sufficient_length".to_string(),
            timestamp: 1700000000,
            action_id: "action_001".to_string(),
        };

        let hash1 = action.hash();
        let hash2 = action.hash();
        assert_eq!(hash1, hash2, "Same action should produce same hash");
        assert_eq!(hash1.len(), 64, "SHA256 hash should be 64 chars");
    }

    #[test]
    fn test_campaign_progress() {
        let campaign = CampaignState {
            campaign_id: "test_campaign".to_string(),
            verified_participants_count: 7500,
            goal_participants: 15000,
            total_capital_diverted: 124000, // $1240.00
            end_block: 1000,
            action_proofs_root: "merkle_root".to_string(),
            status: CampaignStatus::Active,
            created_at: 1700000000,
            last_updated: 1700001000,
        };

        assert_eq!(campaign.progress_percentage(), 50.0);
        assert!(!campaign.is_goal_reached());
        assert_eq!(campaign.capital_diverted_usd(), 1240.0);
    }

    #[test]
    fn test_zk_proof_validation() {
        // Test valid proof
        let valid_action = ImpactAction {
            user_did: "did:polis:user1".to_string(),
            action_type: ActionType::Boycott,
            target_entity: "MegaCorp".to_string(),
            value_diverted: 5000,
            zk_proof: "zkproof_simulated_abc123def456789xyz0123456789abcdef".to_string(),
            timestamp: 1700000000,
            action_id: "action_001".to_string(),
        };

        println!("Testing proof: '{}'", valid_action.zk_proof);
        println!("Proof length: {}", valid_action.zk_proof.len());
        println!("Proof is_empty: {}", valid_action.zk_proof.is_empty());
        println!("Proof >= 32: {}", valid_action.zk_proof.len() >= 32);

        assert!(valid_action.verify_zk_proof(), "Valid proof should pass");

        // Test invalid proof (too short)
        let invalid_action = ImpactAction {
            user_did: "did:polis:user1".to_string(),
            action_type: ActionType::Boycott,
            target_entity: "MegaCorp".to_string(),
            value_diverted: 5000,
            zk_proof: "short".to_string(),
            timestamp: 1700000000,
            action_id: "action_002".to_string(),
        };

        assert!(!invalid_action.verify_zk_proof(), "Too short proof should fail");

        // Test empty proof
        let empty_action = ImpactAction {
            user_did: "did:polis:user1".to_string(),
            action_type: ActionType::Boycott,
            target_entity: "MegaCorp".to_string(),
            value_diverted: 5000,
            zk_proof: "".to_string(),
            timestamp: 1700000000,
            action_id: "action_003".to_string(),
        };

        assert!(!empty_action.verify_zk_proof(), "Empty proof should fail");
    }
}
