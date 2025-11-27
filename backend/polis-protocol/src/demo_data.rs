/// Demo Data Module
///
/// This module provides dummy data for demonstration purposes.
/// Can be easily removed for production by:
/// 1. Removing this file
/// 2. Removing `mod demo_data;` from lib.rs
/// 3. Removing `use_demo_data()` call from main.rs

use crate::{
    blockchain::{IdeologyRange, PolisProtocol, StanceShard},
    ActionType, ImpactAction,
};

/// Initialize protocol with demo data
///
/// This creates:
/// - 3 active campaigns with realistic participant numbers
/// - 10 demo users across different shards
/// - User impact history for testing
pub fn initialize_demo_protocol() -> PolisProtocol {
    let mut protocol = PolisProtocol::new();

    println!("🎭 [DEMO MODE] Initializing with dummy data...");

    // ========== Shard 1: Fair Wages Campaign ==========
    println!("💼 Creating Fair Wages Shard...");
    let fair_wages_range = IdeologyRange {
        economic_min: -100.0,
        economic_max: 0.0,
        social_min: 50.0,
        social_max: 100.0,
        diplomatic_min: 0.0,
        diplomatic_max: 100.0,
    };
    let mut fair_wages_shard = StanceShard::new("fair-wages-shard".to_string(), fair_wages_range);

    // Create campaign with better data
    fair_wages_shard
        .create_campaign("fair-wages-initiative".to_string(), 15000, 10000)
        .expect("Failed to create fair wages campaign");

    // Add demo users and actions
    for i in 1..=5 {
        let user_did = format!("did:polis:demo_user_{}", i);
        fair_wages_shard.update_node_status(user_did.clone(), true);

        // Add some actions for participant count
        let action = ImpactAction {
            user_did: user_did.clone(),
            action_type: ActionType::Boycott,
            target_entity: "MEGA CORP".to_string(),
            value_diverted: 5000 + (i * 1000), // $50-$90
            zk_proof: format!(
                "zkproof_demo_{}_{}",
                i,
                "abc123def456789xyz0123456789abcdef"
            ),
            timestamp: chrono::Utc::now().timestamp() - (i as i64 * 86400), // Spread over days
            action_id: uuid::Uuid::new_v4().to_string(),
        };
        fair_wages_shard.add_pending_action(action).ok();
    }

    // Produce blocks to record actions
    let block = fair_wages_shard
        .produce_block("did:polis:validator1".to_string())
        .expect("Failed to produce block");
    fair_wages_shard.add_block(block).ok();

    protocol.register_shard(fair_wages_shard);
    println!("✅ Fair Wages Shard registered with demo data");

    // ========== Shard 2: Green Energy Support ==========
    println!("🌱 Creating Green Energy Shard...");
    let green_range = IdeologyRange {
        economic_min: -50.0,
        economic_max: 50.0,
        social_min: 0.0,
        social_max: 100.0,
        diplomatic_min: 50.0,
        diplomatic_max: 100.0,
    };
    let mut green_shard = StanceShard::new("green-energy-shard".to_string(), green_range);

    green_shard
        .create_campaign("green-energy-support".to_string(), 10000, 5000)
        .expect("Failed to create green energy campaign");

    for i in 6..=10 {
        let user_did = format!("did:polis:demo_user_{}", i);
        green_shard.update_node_status(user_did.clone(), true);

        let action = ImpactAction {
            user_did: user_did.clone(),
            action_type: ActionType::Buycott,
            target_entity: "SUNRISE POWER".to_string(),
            value_diverted: 3000 + (i * 500),
            zk_proof: format!(
                "zkproof_demo_{}_{}",
                i,
                "xyz789abc012def345ghi678jkl901mno"
            ),
            timestamp: chrono::Utc::now().timestamp() - (i as i64 * 43200),
            action_id: uuid::Uuid::new_v4().to_string(),
        };
        green_shard.add_pending_action(action).ok();
    }

    let block = green_shard
        .produce_block("did:polis:validator2".to_string())
        .expect("Failed to produce block");
    green_shard.add_block(block).ok();

    protocol.register_shard(green_shard);
    println!("✅ Green Energy Shard registered with demo data");

    // ========== Shard 3: Living Wage Campaign ==========
    println!("⚒️  Creating Living Wage Shard...");
    let living_wage_range = IdeologyRange {
        economic_min: -100.0,
        economic_max: -20.0,
        social_min: -50.0,
        social_max: 50.0,
        diplomatic_min: -50.0,
        diplomatic_max: 50.0,
    };
    let mut living_wage_shard =
        StanceShard::new("living-wage-shard".to_string(), living_wage_range);

    living_wage_shard
        .create_campaign("living-wage-campaign".to_string(), 20000, 15000)
        .expect("Failed to create living wage campaign");

    // Add extra nodes for this shard
    for i in 1..=3 {
        let user_did = format!("did:polis:demo_user_{}", i);
        living_wage_shard.update_node_status(user_did.clone(), true);
    }

    protocol.register_shard(living_wage_shard);
    println!("✅ Living Wage Shard registered");

    println!("🎭 [DEMO MODE] Protocol initialized with {} shards", protocol.shards.len());
    println!("⚠️  To remove demo data for production:");
    println!("   1. Delete src/demo_data.rs");
    println!("   2. Remove 'mod demo_data;' from src/lib.rs");
    println!("   3. Remove 'initialize_demo_protocol()' call from src/main.rs");
    println!();

    protocol
}

/// Create a demo user with pre-populated impact data
/// Returns (user_did, campaign_count, streak_days, diverted_cents)
pub fn create_demo_user(user_email: &str) -> (String, u64, u64, u64) {
    // Generate consistent DID from email (matches frontend logic)
    let mut hash = 0u32;
    for byte in user_email.bytes() {
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(byte as u32);
    }
    let hash_str = format!("{:016x}", hash as u64);
    let user_did = format!("did:polis:{}", hash_str);

    // Demo impact data
    let campaign_count = 3;
    let streak_days = 12;
    let diverted_cents = 42000; // $420

    (user_did, campaign_count, streak_days, diverted_cents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_demo_protocol_initialization() {
        let protocol = initialize_demo_protocol();
        assert!(protocol.shards.len() >= 3);
    }

    #[test]
    fn test_demo_user_generation() {
        let (did, campaigns, streak, diverted) = create_demo_user("test@example.com");
        assert!(did.starts_with("did:polis:"));
        assert_eq!(campaigns, 3);
        assert_eq!(streak, 12);
        assert_eq!(diverted, 42000);
    }
}
