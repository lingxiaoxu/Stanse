# Polis Protocol 完整实现指南

## 🎯 项目概述

**Polis Protocol** 是一个基于 Rust 的去中心化政治协调系统，为 STANSE 的 Union Tab 提供真正的区块链后端支持。

### 核心创新

1. **立场分片 (Stance Shards)**: 每个政治立场运行在独立的区块链上
2. **影响力证明 (Proof of Impact)**: 基于验证的政治行动而非算力或资金
3. **零知识隐私 (Zero-Knowledge Privacy)**: 保护用户身份和行为细节

---

## 📁 文件结构

```
backend/polis-protocol/
├── Cargo.toml                 # Rust 项目配置和依赖
├── README.md                  # 项目文档
├── .gitignore                 # Git 忽略文件
└── src/
    ├── lib.rs                 # 模块声明
    ├── main.rs                # 主程序入口
    ├── types.rs               # 核心数据类型定义
    ├── blockchain.rs          # 区块链逻辑实现
    └── api_server.rs          # REST API 服务器

services/
└── polisService.ts            # 前端 TypeScript 集成服务
```

---

## 🔧 环境准备

### 1. 安装 Rust

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 按照提示完成安装，然后重新加载 shell
source $HOME/.cargo/env

# 验证安装
rustc --version
cargo --version
```

### 2. 构建项目

```bash
cd backend/polis-protocol

# 首次构建（下载依赖）
cargo build

# 发布版本构建（优化性能）
cargo build --release
```

### 3. 运行服务器

```bash
# 开发模式（带日志）
RUST_LOG=info cargo run

# 发布模式（高性能）
cargo run --release
```

服务器将在 `http://localhost:8080` 启动。

---

## 🌐 API 集成示例

### 前端集成（React/TypeScript）

#### 1. 在 UnionView 中使用真实数据

```typescript
// components/views/ImpactView.tsx (原 UnionView)
import React, { useEffect, useState } from 'react';
import {
  getGlobalStats,
  getCampaigns,
  getUserImpact,
  GlobalStats,
  Campaign,
  UserImpact,
} from '../../services/polisService';
import { useAuth } from '../../contexts/AuthContext';

export const UnionView: React.FC = () => {
  const { user } = useAuth();
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [userImpact, setUserImpact] = useState<UserImpact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        // 并行请求所有数据
        const [stats, campaignList, impact] = await Promise.all([
          getGlobalStats(),
          getCampaigns(),
          getUserImpact(user?.uid || 'anonymous'),
        ]);

        setGlobalStats(stats);
        setCampaigns(campaignList);
        setUserImpact(impact);
      } catch (error) {
        console.error('Failed to fetch Polis data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  if (loading) {
    return <div className="text-center py-12">Loading Union data from blockchain...</div>;
  }

  return (
    <div className="space-y-8">
      {/* 顶部统计 - 真实链上数据 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border-2 border-black p-4">
          <div className="text-xs font-mono text-gray-500">ACTIVE ALLIES ONLINE</div>
          <div className="text-3xl font-pixel">{globalStats?.active_allies_online.toLocaleString()}</div>
        </div>
        <div className="border-2 border-black p-4">
          <div className="text-xs font-mono text-gray-500">TOTAL UNION STRENGTH</div>
          <div className="text-3xl font-pixel">{globalStats?.total_union_strength.toLocaleString()}</div>
        </div>
      </div>

      {/* 活跃战线 - 从区块链读取 */}
      <div className="space-y-4">
        <h3 className="font-pixel text-2xl">ACTIVE FRONTS</h3>
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="border-2 border-black p-4">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-pixel text-xl">{campaign.title}</h4>
              <span className="px-2 py-1 bg-black text-white text-xs font-mono">
                {campaign.campaign_type}
              </span>
            </div>

            {/* 进度条 */}
            <div className="mb-2">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span>{campaign.participants.toLocaleString()} JOINED</span>
                <span>GOAL: {campaign.goal.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-gray-200 border border-black">
                <div
                  className="h-full bg-black"
                  style={{ width: `${campaign.progress_percentage}%` }}
                />
              </div>
            </div>

            <div className="text-xs font-mono text-gray-500">
              {campaign.days_active}d active • TARGET: {campaign.target}
            </div>
          </div>
        ))}
      </div>

      {/* 用户影响力 - 链上验证的个人数据 */}
      <div className="border-2 border-black p-4">
        <h3 className="font-pixel text-2xl mb-4">YOUR IMPACT</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-pixel">{userImpact?.campaigns}</div>
            <div className="text-xs font-mono">CAMPAIGNS</div>
          </div>
          <div>
            <div className="text-2xl font-pixel">{userImpact?.streak}d</div>
            <div className="text-xs font-mono">STREAK</div>
          </div>
          <div>
            <div className="text-2xl font-pixel">${userImpact?.redirected_usd.toFixed(2)}</div>
            <div className="text-xs font-mono">REDIRECTED</div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

#### 2. 提交用户行动

```typescript
// 当用户点击"JOIN"按钮时
import { submitAction, generateSimpleZKProof, getRecommendedShards } from '../../services/polisService';
import { useAuth } from '../../contexts/AuthContext';

async function handleJoinCampaign(campaignId: string) {
  const { user, userProfile } = useAuth();

  // 根据用户的政治立场找到合适的分片
  const ideology = userProfile?.coordinates
    ? [
        userProfile.coordinates.economic,
        userProfile.coordinates.social,
        userProfile.coordinates.diplomatic,
      ] as [number, number, number]
    : [0, 0, 0] as [number, number, number];

  const shards = getRecommendedShards(ideology);
  const shardId = shards[0] || 'general-activism-2025';

  // 生成零知识证明
  const zkProof = generateSimpleZKProof({
    userDid: `did:polis:${user?.uid}`,
    actionType: 'BOYCOTT',
    timestamp: Date.now(),
  });

  // 提交到区块链
  const success = await submitAction({
    user_did: `did:polis:${user?.uid}`,
    action_type: 'BOYCOTT',
    target_entity: campaignId,
    value_diverted: 5000, // $50.00
    zk_proof: zkProof,
    shard_id: shardId,
  });

  if (success) {
    alert('Action successfully recorded on blockchain!');
    // 刷新数据
    fetchData();
  } else {
    alert('Failed to submit action. Please try again.');
  }
}
```

---

## 🧪 测试 API

### 使用 curl 测试

```bash
# 健康检查
curl http://localhost:8080/api/v1/health

# 获取全局统计
curl http://localhost:8080/api/v1/stats/global

# 获取战役列表
curl http://localhost:8080/api/v1/campaigns

# 获取用户影响力
curl http://localhost:8080/api/v1/user/did:polis:user123/impact

# 提交行动
curl -X POST http://localhost:8080/api/v1/actions/submit \
  -H "Content-Type: application/json" \
  -d '{
    "user_did": "did:polis:user123",
    "action_type": "BOYCOTT",
    "target_entity": "BadCorp",
    "value_diverted": 5000,
    "zk_proof": "simulated_proof_xyz",
    "shard_id": "green-energy-2025"
  }'
```

### 使用 Postman 或 Insomnia

导入 API 端点：
- Base URL: `http://localhost:8080/api/v1`
- 所有端点见 `backend/polis-protocol/README.md`

---

## 🚀 部署到生产环境

### 方案 1: Docker

创建 `Dockerfile`:

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/polis-protocol /usr/local/bin/
EXPOSE 8080
CMD ["polis-protocol"]
```

构建和运行：

```bash
docker build -t polis-protocol .
docker run -p 8080:8080 polis-protocol
```

### 方案 2: Cloud Run（推荐）

```bash
# 在 backend/polis-protocol 目录
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/polis-protocol
gcloud run deploy polis-protocol \
  --image gcr.io/YOUR_PROJECT_ID/polis-protocol \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

### 更新前端环境变量

在 `.env.production` 中：

```bash
# 生产环境 Polis API URL
VITE_POLIS_API_URL=https://polis-protocol-xxx-uc.a.run.app/api/v1
```

在 `polisService.ts` 中使用：

```typescript
const POLIS_API_BASE = import.meta.env.VITE_POLIS_API_URL || 'http://localhost:8080/api/v1';
```

---

## 🔐 安全性考虑

### 当前实现（MVP）

- **简化的 ZK 证明**: 使用模拟的证明字符串
- **无 P2P 网络**: 单节点运行
- **内存存储**: 重启后数据丢失

### 生产环境需要

1. **真实的 zk-SNARKs**
   ```rust
   // 使用 bellman 或 ark-crypto 库
   use bellman::groth16;
   ```

2. **持久化存储**
   ```rust
   // 使用 RocksDB
   use rocksdb::{DB, Options};
   ```

3. **P2P 网络**
   ```rust
   // 使用 libp2p
   use libp2p::{identity, PeerId, Swarm};
   ```

4. **数字签名**
   ```rust
   // 使用 Ed25519
   use ed25519_dalek::{Keypair, Signature, Signer};
   ```

---

## 📊 性能指标

### 预期性能（单节点）

- **TPS**: ~1000 actions/second
- **区块时间**: 3-5 秒
- **API延迟**: <50ms (99th percentile)
- **内存占用**: ~50MB (无负载)

### 扩展性

- **横向扩展**: 添加更多分片
- **每个分片**: 独立的 Rust 进程
- **负载均衡**: Nginx / Cloud Load Balancer

---

## 🎓 学术基础

这个实现基于以下研究：

1. **Federated Byzantine Agreement** (Stellar Consensus Protocol)
2. **Sharding** (Ethereum 2.0, Polkadot Parachains)
3. **Zero-Knowledge Proofs** (Zcash, zkSNARKs)
4. **Proof of Stake** (Cosmos, Polkadot)

---

## 📝 下一步开发

### Phase 2: 完整加密

- [ ] 集成 `bellman` 库实现真实的 zk-SNARKs
- [ ] Ed25519 数字签名
- [ ] BLS 聚合签名

### Phase 3: P2P 网络

- [ ] libp2p 集成
- [ ] Gossip 协议
- [ ] DHT 对等发现

### Phase 4: 生产就绪

- [ ] RocksDB 持久化
- [ ] WebAssembly 轻节点
- [ ] 移动端 SDK

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**Built with 🦀 Rust | Powered by Mathematics | Inspired by Decentralization**
