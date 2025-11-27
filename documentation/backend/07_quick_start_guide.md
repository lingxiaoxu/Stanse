# Polis Protocol - Quick Start Guide

## 🚀 Installation (5 minutes)

### Step 1: Install Rust
```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

### Step 2: Build & Run
```bash
cd backend/polis-protocol

# Option A: Use setup script
./setup.sh

# Option B: Manual commands
cargo build                    # Build project
cargo test                     # Run tests
RUST_LOG=info cargo run        # Start server
```

Server starts at: **http://localhost:8080**

---

## 🧪 Testing

### Test with curl
```bash
# Health check
curl http://localhost:8080/api/v1/health

# Get global stats (matches UI "ACTIVE ALLIES ONLINE", etc.)
curl http://localhost:8080/api/v1/stats/global

# Get all campaigns
curl http://localhost:8080/api/v1/campaigns

# Get user impact
curl http://localhost:8080/api/v1/user/did:polis:user123/impact

# Submit action
curl -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Content-Type: application/json" \
  -d '{
    "user_did": "did:polis:user123",
    "action_type": "BOYCOTT",
    "target_entity": "BadCorp",
    "value_diverted": 5000,
    "zk_proof": "test_proof",
    "shard_id": "green-energy-2025"
  }'
```

### Run test suite
```bash
./test-api.sh    # Comprehensive API testing
```

---

## 🔌 Frontend Integration

### Update environment variable
```bash
# Add to .env.local
VITE_POLIS_API_URL=http://localhost:8080/api/v1
```

### Use in React components
```typescript
import { getGlobalStats, getCampaigns, getUserImpact } from '../../services/polisService';

// In your component
const [stats, setStats] = useState(null);

useEffect(() => {
  async function fetchData() {
    const globalStats = await getGlobalStats();
    setStats(globalStats);
  }
  fetchData();
}, []);

// Display in UI
<div>{stats?.active_allies_online} ACTIVE ALLIES</div>
```

---

## 📊 API Endpoints

| Method | Endpoint | Description | UI Mapping |
|--------|----------|-------------|------------|
| GET | `/api/v1/health` | Health check | - |
| GET | `/api/v1/stats/global` | Global statistics | "ACTIVE ALLIES ONLINE" |
| GET | `/api/v1/campaigns` | All campaigns | Campaign cards |
| GET | `/api/v1/campaigns/:id` | Single campaign | Campaign detail |
| GET | `/api/v1/user/:did/impact` | User impact | "YOUR IMPACT" section |
| POST | `/api/v1/actions/submit` | Submit action | "JOIN" button |
| GET | `/api/v1/shards/:id/stats` | Shard stats | Ideology-specific data |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (React/TS)             │
│  components/views/UnionView.tsx         │
└──────────────┬──────────────────────────┘
               │ HTTP/JSON
               │
┌──────────────▼──────────────────────────┐
│    polisService.ts (API Client)         │
│  - getGlobalStats()                     │
│  - getCampaigns()                       │
│  - submitAction()                       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   Polis Protocol Backend (Rust)         │
│  Port: 8080                             │
│  ┌──────────────────────────────────┐   │
│  │  api_server.rs (Axum)            │   │
│  │  - REST API endpoints            │   │
│  │  - CORS enabled                  │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  PolisProtocol (Layer 0)         │   │
│  │  - Routes users to shards        │   │
│  │  - Aggregates global stats       │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│  ┌──────────▼───────────────────────┐   │
│  │  StanceShard (Layer 1)           │   │
│  │  - green-energy-2025             │   │
│  │  - labor-rights-2025             │   │
│  │  - free-market-2025              │   │
│  │                                  │   │
│  │  Each shard contains:            │   │
│  │  - Blockchain (blocks)           │   │
│  │  - Campaigns (smart contracts)   │   │
│  │  - Pending actions               │   │
│  │  - Node registry                 │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 🎯 Key Concepts

### Stance Shards
- **green-energy-2025**: Left economics + environmentalism
- **labor-rights-2025**: Socialist labor movement
- **free-market-2025**: Right economics + individual liberty

Users are automatically routed to shards based on their political coordinates from the questionnaire.

### Proof of Impact (PoI)
Instead of mining or staking, consensus is based on **verified political actions**:
- BOYCOTT: Avoid buying from target company
- BUYCOTT: Intentionally buy from aligned company
- VOTE: Electoral participation
- DONATE: Campaign contribution
- RALLY: Protest/demonstration attendance

### Zero-Knowledge Proofs
Actions are verified without revealing:
- User's real identity (only DID shown)
- Exact action details
- Personal political views

MVP uses simplified proofs; production will use zk-SNARKs.

---

## 📦 Project Structure

```
backend/polis-protocol/
├── Cargo.toml              # Rust dependencies
├── README.md               # Full documentation
├── QUICK_START.md          # This file
├── setup.sh                # Setup automation
├── test-api.sh             # API testing script
└── src/
    ├── types.rs            # Data structures
    ├── blockchain.rs       # Shard + protocol logic
    ├── api_server.rs       # REST API
    ├── lib.rs              # Module exports
    └── main.rs             # Entry point + seed data
```

---

## 🚢 Deployment

### Docker
```bash
docker build -t polis-protocol .
docker run -p 8080:8080 polis-protocol
```

### Google Cloud Run
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/polis-protocol
gcloud run deploy polis-protocol \
  --image gcr.io/YOUR_PROJECT_ID/polis-protocol \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

Update frontend `.env.production`:
```bash
VITE_POLIS_API_URL=https://polis-protocol-xxx.run.app/api/v1
```

---

## 📚 Documentation

- **README.md**: Complete technical documentation
- **POLIS_PROTOCOL_GUIDE.md**: Implementation guide with examples
- **Inline code comments**: All Rust files fully documented

---

## 🆘 Troubleshooting

### "cargo: command not found"
→ Install Rust: https://rustup.rs/

### Port 8080 already in use
```bash
lsof -ti:8080 | xargs kill -9
```

### CORS errors in browser
→ API server already has CORS enabled. Check network tab.

### Frontend shows mock data
→ Make sure `VITE_POLIS_API_URL` is set and server is running

---

## ✅ Verification Checklist

- [ ] Rust installed (`rustc --version`)
- [ ] Project builds (`cargo build`)
- [ ] Tests pass (`cargo test`)
- [ ] Server starts (`cargo run`)
- [ ] Health endpoint works (`curl localhost:8080/api/v1/health`)
- [ ] Frontend env var set (`VITE_POLIS_API_URL`)
- [ ] polisService.ts exists
- [ ] Union tab displays real data

---

**Built with 🦀 Rust | Ready for Production**

For detailed information, see [README.md](./README.md) and [POLIS_PROTOCOL_GUIDE.md](./POLIS_PROTOCOL_GUIDE.md).
