# Polis Protocol - Decentralized Politics System

## 🌍 The Agora Protocol

A **Rust-based blockchain system** for decentralized political coordination, inspired by:
- **Polkadot** (Parachains architecture)
- **Cosmos** (IBC inter-blockchain communication)
- **Zcash** (Zero-knowledge proofs for privacy)

### Core Philosophy

**"DePol" (Decentralized Politics)** - A trustless, censorship-resistant system where:
- Political movements are recorded on **immutable ledgers**
- Different ideologies operate on **isolated shards** (no conflict)
- Actions are verified by **zero-knowledge proofs** (privacy-preserving)
- Collective power is measured by **Proof of Impact** (not money or mining)

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────┐
│         Layer 0: Polis Protocol             │
│         (Coordination & Routing)            │
└────────────┬────────────────────────────────┘
             │
       ┌─────┴─────┬─────────────┬─────────────┐
       │           │             │             │
  ┌────▼────┐ ┌───▼────┐   ┌───▼────┐   ┌───▼────┐
  │ Shard A │ │ Shard B│   │ Shard C│   │ Shard N│
  │ (Green) │ │ (Labor)│   │(Market)│   │  ...   │
  └─────────┘ └────────┘   └────────┘   └────────┘
      ↓            ↓             ↓            ↓
  Blockchain   Blockchain   Blockchain   Blockchain
```

### Key Innovations

1. **Stance Shards**: Each political ideology runs on its own blockchain
   - Left-wing environmentalists never see right-wing data
   - Privacy-preserving isolation without censorship

2. **Proof of Impact (PoI)**: Consensus mechanism based on verified actions
   - Boycotts, donations, votes all create "blocks"
   - Mathematically proven via zk-SNARKs

3. **Zero-Knowledge Actions**: Users prove they acted without revealing identity
   - "I boycotted Company X" without showing who/when/where

---

## 🚀 Quick Start

### Prerequisites

- **Rust** 1.75+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Cargo** (comes with Rust)

### Build & Run

```bash
# Clone the repository (if not already)
cd backend/polis-protocol

# Build the project
cargo build --release

# Run the server
cargo run --release

# Or run in development mode with logs
RUST_LOG=info cargo run
```

### Expected Output

```
🌍 Initializing Polis Protocol - Decentralized Politics System
📡 Based on Federated Sidechains Architecture (Polkadot/Cosmos-inspired)

🌱 Creating Green Energy Shard...
✅ Green Energy Shard registered with 1 campaign
⚒️  Creating Labor Rights Shard...
✅ Labor Rights Shard registered with 1 campaign
💼 Creating Free Market Shard...
✅ Free Market Shard registered

📊 Protocol Stats:
  Total Shards: 3
  Online Nodes: 5
  Union Strength: 1
  Capital Diverted: $50.00
  Active Campaigns: 2

🚀 Starting API Server on port 8080...
```

The API server will be available at `http://localhost:8080`

---

## 📡 API Endpoints

### GET `/api/v1/health`
Health check

**Response:**
```json
{
  "success": true,
  "data": "Polis Protocol API is running"
}
```

### GET `/api/v1/stats/global`
Get global network statistics (for UI top stats)

**Response:**
```json
{
  "success": true,
  "data": {
    "active_allies_online": 5532,
    "total_union_strength": 45201,
    "capital_diverted_usd": 1240000.00,
    "total_shards": 3,
    "total_active_campaigns": 8
  }
}
```

Maps to UI:
- `active_allies_online` → **ACTIVE ALLIES ONLINE: 5,532**
- `total_union_strength` → **TOTAL UNION STRENGTH: 45,201**
- `capital_diverted_usd` → **CAPITAL DIVERTED: $1.24M**

### GET `/api/v1/campaigns`
Get all active campaigns (for "Active Fronts" cards)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "fair-wages-initiative",
      "title": "Fair Wages Initiative",
      "target": "MegaCorp",
      "campaign_type": "BOYCOTT",
      "participants": 12486,
      "goal": 15000,
      "progress_percentage": 83.24,
      "days_active": 14,
      "description": "Join the movement for fair wages"
    }
  ]
}
```

Maps to UI Card:
- `title` → Card Title
- `participants` / `goal` → **12,486 JOINED / GOAL: 15,000**
- `progress_percentage` → Progress Bar
- `days_active` → **14d**
- `campaign_type` → **BOYCOTT** badge

### GET `/api/v1/user/:did/impact`
Get user's personal impact (for "Your Impact" section)

**Parameters:**
- `did` - User's Decentralized ID (e.g., `did:polis:user123`)

**Response:**
```json
{
  "success": true,
  "data": {
    "campaigns": 3,
    "streak": 12,
    "redirected_usd": 420.00
  }
}
```

Maps to UI:
- `campaigns` → **3 CAMPAIGNS**
- `streak` → **12d STREAK**
- `redirected_usd` → **$420 REDIRECTED**

### POST `/api/v1/actions/submit`
Submit a new political action (from user app)

**Request Body:**
```json
{
  "user_did": "did:polis:user123",
  "action_type": "BOYCOTT",
  "target_entity": "BadCorp",
  "value_diverted": 5000,
  "zk_proof": "simulated_proof_xyz789",
  "shard_id": "green-energy-2025"
}
```

**Response:**
```json
{
  "success": true,
  "data": "Action submitted successfully"
}
```

### GET `/api/v1/shards/:id/stats`
Get stats for a specific shard

**Response:**
```json
{
  "success": true,
  "data": {
    "shard_id": "green-energy-2025",
    "block_height": 142,
    "online_nodes": 2453,
    "total_union_strength": 15234,
    "capital_diverted_usd": 524000.00,
    "active_campaigns": 3,
    "pending_actions": 12
  }
}
```

---

## 🧪 Testing

```bash
# Run unit tests
cargo test

# Run specific test
cargo test test_impact_action_hash

# Run with output
cargo test -- --nocapture
```

---

## 🔗 Integration with Frontend

### TypeScript Service (Create in `services/polisService.ts`)

```typescript
const POLIS_API_BASE = 'http://localhost:8080/api/v1';

export async function getGlobalStats() {
  const response = await fetch(`${POLIS_API_BASE}/stats/global`);
  return response.json();
}

export async function getCampaigns() {
  const response = await fetch(`${POLIS_API_BASE}/campaigns`);
  return response.json();
}

export async function getUserImpact(userDid: string) {
  const response = await fetch(`${POLIS_API_BASE}/user/${userDid}/impact`);
  return response.json();
}
```

### Update UnionView Component

```typescript
// In components/views/UnionView.tsx
import { useEffect, useState } from 'react';
import { getGlobalStats, getCampaigns, getUserImpact } from '../../services/polisService';

export const UnionView: React.FC = () => {
  const [globalStats, setGlobalStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [userImpact, setUserImpact] = useState(null);

  useEffect(() => {
    // Fetch data from Rust backend
    getGlobalStats().then(data => setGlobalStats(data.data));
    getCampaigns().then(data => setCampaigns(data.data));
    getUserImpact('did:polis:current_user').then(data => setUserImpact(data.data));
  }, []);

  // Render using real blockchain data
  return (
    <div>
      <h2>ACTIVE ALLIES ONLINE: {globalStats?.active_allies_online}</h2>
      <h2>TOTAL UNION STRENGTH: {globalStats?.total_union_strength}</h2>
      {/* ... */}
    </div>
  );
};
```

---

## 📦 Data Structures

### Core Types

```rust
// Political stance definition
pub struct MovementManifest {
    pub chain_id: String,
    pub ideology_vector: [f32; 3], // [economic, social, diplomatic]
    pub genesis_block_hash: String,
}

// A political action (the "transaction" of this blockchain)
pub struct ImpactAction {
    pub user_did: String,
    pub action_type: ActionType, // Boycott, Buycott, Vote, etc.
    pub target_entity: String,
    pub value_diverted: u64, // in cents
    pub zk_proof: String,
    pub timestamp: i64,
}

// A block in the chain
pub struct PolisBlock {
    pub index: u64,
    pub timestamp: i64,
    pub actions: Vec<ImpactAction>,
    pub previous_hash: String,
    pub union_strength: u64,
    pub hash: String,
}

// Campaign state (the "smart contract")
pub struct CampaignState {
    pub campaign_id: String,
    pub verified_participants_count: u64,
    pub goal_participants: u64,
    pub total_capital_diverted: u64,
    pub status: CampaignStatus,
}
```

---

## 🎓 Academic References

This implementation is inspired by:

1. **Polkadot White Paper** - Gavin Wood (2016)
   - Parachains and shared security model

2. **Cosmos Network** - Jae Kwon & Ethan Buchman (2016)
   - Inter-Blockchain Communication (IBC)

3. **Zcash Protocol** - Daira Hopwood et al. (2014)
   - zk-SNARKs for privacy-preserving transactions

4. **Proof of Stake Consensus** - Sunny King & Scott Nadal (2012)
   - Modified into "Proof of Impact" for our use case

---

## 🛣️ Roadmap

### Phase 1: MVP (Current)
- [x] Core blockchain types
- [x] Stance shard architecture
- [x] Basic API server
- [x] RESTful endpoints for UI integration

### Phase 2: Real Crypto
- [ ] Integrate `bellman` for zk-SNARKs
- [ ] Implement Ed25519 signatures
- [ ] BLS aggregated signatures for efficiency

### Phase 3: P2P Networking
- [ ] libp2p integration
- [ ] Gossip protocol for block propagation
- [ ] DHT for peer discovery

### Phase 4: Production
- [ ] Database persistence (RocksDB)
- [ ] WebAssembly light client
- [ ] Mobile SDK (iOS/Android)

---

## 📄 License

MIT License - See LICENSE file

## 🤝 Contributing

This is an experimental academic project. Contributions welcome!

---

**Built with 🦀 Rust and inspired by the vision of decentralized political coordination.**