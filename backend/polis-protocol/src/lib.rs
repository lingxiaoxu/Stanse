pub mod api_server;
pub mod blockchain;
pub mod types;
pub mod crypto;
pub mod metrics;
pub mod p2p;
pub mod fec;

// ========== DEMO DATA MODULE ==========
// Remove this line for production:
pub mod demo_data;

// 重新导出主要类型
pub use blockchain::{PolisProtocol, StanceShard, IdeologyRange, GlobalStats, UserStats};
pub use types::{
    ActionType, CampaignState, CampaignStatus, DecentralizedPoliticianState,
    ImpactAction, MovementManifest, NodeStatus, PolisBlock, ZKActionProof,
};
pub use crypto::{PolisKeypair, PolisPublicKey, SignedAction, BlockSignature, DIDGenerator};
pub use metrics::{MetricsCollector, ApiRequestTimer, BlockProductionTimer};
pub use p2p::{P2PNode, P2PManager, P2PConfig, P2PMessage};
pub use demo_data::initialize_demo_protocol; // Remove for production