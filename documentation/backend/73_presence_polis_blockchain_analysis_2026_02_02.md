# Presence 系统与 Polis Protocol 架构分析及区块链集成方案

**文档编号**: 73
**创建日期**: 2026-02-02
**最后更新**: 2026-02-02

---

## 目录

1. [主应用 Presence 写入逻辑详解](#1-主应用-presence-写入逻辑详解)
2. [Presence 系统的借鉴价值分析](#2-presence-系统的借鉴价值分析)
3. [Polis Protocol 机制详解](#3-polis-protocol-机制详解)
4. [Polis Protocol 现状分析](#4-polis-protocol-现状分析)
5. [Polygon 区块链集成完整方案](#5-polygon-区块链集成完整方案)

---

## 1. 主应用 Presence 写入逻辑详解

### 1.1 核心文件结构

```
services/
├── presenceService.ts      # 主要 presence 服务
├── duelRealtimeService.ts  # Duel 队列相关
└── matchRecoveryService.ts # 匹配恢复

contexts/
└── AuthContext.tsx         # 登录/登出管理

functions/src/
└── cleanup-stale-presence.ts  # 后端定时清理

App.tsx                     # 初始化入口
```

### 1.2 用户上线流程

**文件**: `services/presenceService.ts`

```typescript
export function setUserOnline(userId, userData) {
  const userStatusRef = ref(rtdb, `presence/${userId}`);

  // 写入在线状态
  set(userStatusRef, {
    userId,
    email: userData.email,
    personaLabel: userData.personaLabel,
    stanceType: userData.stanceType,
    coreStanceType: userData.coreStanceType,
    status: 'online',
    lastSeen: serverTimestamp(),
    inDuelQueue: false
  });

  // 断开连接时自动删除
  onDisconnect(userStatusRef).remove();
}
```

**关键机制**:
- 使用 `serverTimestamp()` 确保时间一致性
- `onDisconnect().remove()` 提供自动清理机制
- 记录完整的用户状态信息

### 1.3 心跳机制

#### 活动检测心跳 (用户有操作时更新)

```typescript
const activityEvents = ['click', 'scroll', 'keydown', 'touchstart', 'mousemove'];
const MIN_UPDATE_INTERVAL = 5000; // 最少5秒间隔

activityEvents.forEach(event => {
  window.addEventListener(event, updateLastSeen);
});
```

**特点**:
- 5秒节流防止频繁写入
- 只在用户活动时更新
- 降低 Firebase 写入成本

#### 兜底心跳 (每30秒)

```typescript
const heartbeatInterval = setInterval(() => {
  set(lastSeenRef, serverTimestamp());
}, 30000);
```

**特点**:
- 保证即使用户不操作也能维持在线状态
- 30秒间隔平衡了实时性和性能

### 1.4 用户下线流程

**文件**: `contexts/AuthContext.tsx`

```typescript
const logout = async () => {
  // 1. 停止心跳
  await stopHeartbeat(user.uid, heartbeatIntervalRef.current);

  // 2. 删除 presence 记录
  const presenceRef = ref(rtdb, `presence/${user.uid}`);
  await remove(presenceRef);

  // 3. Firebase Auth 登出
  await logOut();
};
```

**三层保障**:
1. 主动删除 (用户登出)
2. `onDisconnect` 自动删除 (浏览器关闭)
3. 后端定时清理 (异常情况兜底)

### 1.5 Duel 队列状态管理

**文件**: `services/duelRealtimeService.ts`

```typescript
// 加入队列
await set(ref(rtdb, `presence/${userId}/inDuelQueue`), true);
onDisconnect(presenceRef).set(false);  // 断开时自动设为 false

// 离开队列
await set(ref(rtdb, `presence/${userId}/inDuelQueue`), false);
```

**优点**:
- 与 presence 系统集成
- 自动处理断线情况
- 实时同步队列状态

### 1.6 后端清理机制

**文件**: `functions/src/cleanup-stale-presence.ts`

```typescript
// 每15分钟运行一次
schedule: '*/15 * * * *'

// 删除心跳超过15分钟的用户
if ((now - lastSeen) > 15 * 60 * 1000) {
  await presenceRef.child(userId).remove();
}
```

**作用**:
- 清理僵尸用户记录
- 处理异常断线情况
- 保持数据准确性

### 1.7 数据流程图

```
用户登录
    ↓
App.tsx 调用 setUserOnline()
    ↓
写入 presence/{userId} = { status: 'online', lastSeen: timestamp, ... }
    ↓
注册 onDisconnect().remove()  ← 浏览器关闭时自动删除
    ↓
启动心跳 (活动检测 + 30秒定时器)
    ↓
持续更新 presence/{userId}/lastSeen
    ↓
用户登出 → remove(presence/{userId})
    或
浏览器关闭 → onDisconnect 触发删除
    或
超时15分钟 → 后端 Cloud Function 清理
```

---

## 2. Presence 系统的借鉴价值分析

### 2.1 优秀设计模式

| 设计点 | 借鉴价值 |
|--------|----------|
| **三层保障机制** | `onDisconnect` + 主动删除 + 后端定时清理，确保不会有僵尸用户 |
| **双心跳策略** | 活动检测（省资源）+ 定时兜底（保可靠），平衡了性能和准确性 |
| **MIN_UPDATE_INTERVAL** | 5秒节流防止频繁写入，降低 Firebase 成本 |
| **serverTimestamp()** | 使用服务器时间而非客户端时间，避免时区/时钟不同步问题 |
| **状态扩展性** | `inDuelQueue` 字段设计，presence 可承载更多业务状态 |

### 2.2 可优化的地方

#### 心跳间隔可能过于激进

```
活动检测: 5秒最小间隔
定时心跳: 30秒
后端清理: 15分钟
```

**建议**:
- 对于非实时对战场景，30秒心跳可能太频繁
- 普通场景可以用 60-120 秒心跳

#### 缺少离线原因区分

```typescript
// 现在只有 'online' | 'away'
// 可以扩展为:
status: 'online' | 'away' | 'in_match' | 'idle'
```

#### 可考虑添加的功能

- **连接质量指标**: 记录 ping/网络状态
- **设备信息**: 区分移动端/桌面端
- **会话恢复**: 短暂断线后恢复而非重新登录

### 2.3 适用场景

这套架构特别适合：

- ✅ 实时匹配系统（如 Duel）
- ✅ 在线状态展示
- ✅ 活跃用户统计
- ✅ 需要精确在线计数的场景

---

## 3. Polis Protocol 机制详解

### 3.1 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Polis Protocol Backend                    │
│                (Rust + Axum on Cloud Run)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Shard 1   │    │   Shard 2   │    │   Shard N   │    │
│   │ progressive │    │ progressive │    │ conservative│    │
│   │  globalist  │    │ nationalist │    │  nationalist│    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│          ↓                  ↓                  ↓            │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              Blockchain (In-Memory)                  │  │
│   │         记录用户行为、区块、全局统计                    │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 8 分片系统 (Shards)

根据 `coreStanceType` 将用户分配到 8 个分片：

| 分片名称 | 经济轴 | 社会轴 | 外交轴 |
|----------|--------|--------|--------|
| `progressive-globalist` | 左 (-100~0) | 进步 (0~100) | 国际化 (0~100) |
| `progressive-nationalist` | 左 | 进步 | 民族主义 (-100~0) |
| `socialist-libertarian` | 左 | 自由 (-100~0) | 国际化 |
| `socialist-nationalist` | 左 | 自由 | 民族主义 |
| `capitalist-globalist` | 右 (0~100) | 进步 | 国际化 |
| `capitalist-nationalist` | 右 | 进步 | 民族主义 |
| `conservative-globalist` | 右 | 保守 | 国际化 |
| `conservative-nationalist` | 右 | 保守 | 民族主义 |

### 3.3 用户注册流程

```rust
// 用户通过坐标自动分配到分片
POST /api/v1/register
{
  "user_id": "abc123",
  "coordinates": {
    "economic": 45,    // 经济右倾
    "social": -10,     // 社会保守
    "diplomatic": -95  // 强烈民族主义
  }
}

// 系统自动计算:
// economic > 0 → 右派
// social < 0 → 保守
// diplomatic < 0 → 民族主义
// → 分配到 "conservative-nationalist" 分片
```

### 3.4 API 端点

| 端点 | 功能 |
|------|------|
| `GET /api/v1/stats/global` | 获取全局统计（在线用户数、分片数等） |
| `GET /api/v1/stats/user/{id}` | 获取用户统计 |
| `POST /api/v1/register` | 注册用户到协议 |
| `POST /api/v1/action` | 记录用户行为 |
| `GET /api/v1/blocks` | 获取区块链数据 |
| `GET /health` | 健康检查 |

### 3.5 与 Firebase Presence 的区别

| 特性 | Firebase Presence | Polis Protocol |
|------|-------------------|----------------|
| **存储** | Firebase Realtime Database | Cloud Run 内存 |
| **用途** | 实时在线状态、Duel 匹配 | 政治立场分片、行为记录 |
| **持久性** | 实时但短暂 | 区块链式记录 |
| **触发** | 用户活动心跳 | 显式 API 调用 |
| **实时性** | 毫秒级 | 秒级 |

### 3.6 当前运行状态

```bash
URL: https://polis-protocol-yfcontxnkq-uc.a.run.app
项目: gen-lang-client-0960644135

GET /api/v1/stats/global 返回:
{
  "total_users": 5,
  "total_shards": 8,
  "active_users_24h": 5,
  ...
}
```

### 3.7 数据流

```
前端 App
    ↓
用户完成 Onboarding，获得 coordinates
    ↓
调用 Polis API /register
    ↓
Polis 根据 coordinates 计算 coreStanceType
    ↓
分配到对应分片 (1/8)
    ↓
用户行为通过 /action 记录
    ↓
全局统计通过 /stats/global 暴露
```

**简单来说**: **Firebase Presence 管"谁在线"，Polis Protocol 管"谁是什么立场、做了什么"**。

---

## 4. Polis Protocol 现状分析

### 4.1 诚实的回答：不是真正的区块链

| 特性 | 真正的区块链 | Polis Protocol 现状 |
|------|-------------|---------------------|
| **存储** | 分布式节点持久化 | **Cloud Run 内存** (重启丢失) |
| **共识** | PoW/PoS/BFT | **无** (单节点) |
| **节点** | 多节点网络 | **单一服务实例** |
| **不可篡改** | 是 | **否** (内存数据可修改) |
| **去中心化** | 是 | **完全中心化** |

### 4.2 实际情况

Polis Protocol 目前的实现：

```rust
// 这只是内存中的数组
pub struct DecentralizedPoliticianState {
    pub blockchain: Vec<PolisBlock>,  // 只是一个 Vec，不是真正的链
    ...
}
```

**实际上是**:
- ✅ 模拟区块链结构的 REST API 服务
- ✅ 有区块、哈希、Merkle 树的**数据结构**
- ❌ 没有真正的**去中心化共识**
- ❌ 数据存在**内存**中，Cloud Run 重启即丢失

### 4.3 "区块链外观"特性

```rust
// 有区块哈希计算
block.hash = block.calculate_hash();

// 有前一个区块引用
previous_hash: previous_block.map(|b| b.hash.clone())

// 有 Merkle 根
merkle_root: self.calculate_merkle_root(&self.pending_actions)

// 有 ZK 证明占位符 (但只是字符串)
zk_proof: format!("firebase_verified_{}", firebase_uid)
```

### 4.4 设计目的

这个设计可能是为了：

1. **概念验证 (PoC)** - 先验证业务逻辑
2. **未来扩展** - 代码结构预留了真正去中心化的可能
3. **API 契约** - 先定义好接口，后续可替换为真正的链

### 4.5 变成真正区块链需要的改进

如果要变成真正的区块链，需要：

- ✅ 添加 P2P 网络层 (代码中有 `p2p.rs` 但未集成)
- ✅ 实现共识机制
- ✅ 持久化存储到数据库/文件
- ✅ 多节点部署

---

## 5. Polygon 区块链集成完整方案

### 5.1 方案对比

| 方案 | 成本 | 复杂度 | 去中心化程度 |
|------|------|--------|--------------|
| **当前 Polis (内存)** | 免费 | 低 | 无 |
| **Polygon 主网** | 每笔交易 ~$0.01-0.1 | 高 | 完全 |
| **Polygon zkEVM** | 更低 gas | 高 | 完全 |
| **私有/联盟链** | 可控 | 中 | 部分 |

### 5.2 智能合约设计

#### 完整的 Solidity 合约

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PolisProtocol is Ownable, ReentrancyGuard {

    // ========== 数据结构 ==========

    struct Coordinates {
        int8 economic;     // -100 to 100
        int8 social;       // -100 to 100
        int8 diplomatic;   // -100 to 100
    }

    struct User {
        address wallet;
        string firebaseUid;        // 关联 Firebase 用户
        Coordinates coordinates;
        string coreStanceType;     // 8 种之一
        uint256 registeredAt;
        uint256 totalActions;
        bool isActive;
    }

    struct Action {
        address user;
        string actionType;         // "boycott", "support", "divest" 等
        string target;             // 目标实体
        uint256 valueCents;        // 金额（美分）
        uint256 timestamp;
        bytes32 proofHash;         // 证明哈希
    }

    struct Campaign {
        string campaignId;
        string targetEntity;
        uint256 goalParticipants;
        uint256 currentParticipants;
        uint256 totalValueDiverted;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    // ========== 状态变量 ==========

    mapping(address => User) public users;
    mapping(string => address) public firebaseToWallet;  // firebaseUid => wallet
    mapping(string => address[]) public shardMembers;    // stanceType => wallets
    mapping(string => Campaign) public campaigns;

    Action[] public actions;
    string[] public campaignIds;

    uint256 public totalUsers;
    uint256 public totalActions;

    // 8 种 coreStanceType
    string[8] public stanceTypes = [
        "progressive-globalist",
        "progressive-nationalist",
        "socialist-libertarian",
        "socialist-nationalist",
        "capitalist-globalist",
        "capitalist-nationalist",
        "conservative-globalist",
        "conservative-nationalist"
    ];

    // ========== 事件 ==========

    event UserRegistered(
        address indexed wallet,
        string firebaseUid,
        string coreStanceType,
        int8 economic,
        int8 social,
        int8 diplomatic
    );

    event ActionRecorded(
        address indexed user,
        string actionType,
        string target,
        uint256 valueCents,
        uint256 indexed actionIndex
    );

    event CampaignCreated(
        string indexed campaignId,
        string targetEntity,
        uint256 goalParticipants
    );

    event CampaignJoined(
        string indexed campaignId,
        address indexed user
    );

    // ========== 核心函数 ==========

    /// @notice 注册用户（关联 Firebase UID）
    function register(
        string calldata firebaseUid,
        int8 economic,
        int8 social,
        int8 diplomatic
    ) external {
        require(users[msg.sender].registeredAt == 0, "Already registered");
        require(bytes(firebaseUid).length > 0, "Invalid firebaseUid");
        require(firebaseToWallet[firebaseUid] == address(0), "Firebase UID already linked");
        require(economic >= -100 && economic <= 100, "Invalid economic");
        require(social >= -100 && social <= 100, "Invalid social");
        require(diplomatic >= -100 && diplomatic <= 100, "Invalid diplomatic");

        string memory stanceType = _calculateStanceType(economic, social, diplomatic);

        users[msg.sender] = User({
            wallet: msg.sender,
            firebaseUid: firebaseUid,
            coordinates: Coordinates(economic, social, diplomatic),
            coreStanceType: stanceType,
            registeredAt: block.timestamp,
            totalActions: 0,
            isActive: true
        });

        firebaseToWallet[firebaseUid] = msg.sender;
        shardMembers[stanceType].push(msg.sender);
        totalUsers++;

        emit UserRegistered(
            msg.sender,
            firebaseUid,
            stanceType,
            economic,
            social,
            diplomatic
        );
    }

    /// @notice 记录用户行动
    function recordAction(
        string calldata actionType,
        string calldata target,
        uint256 valueCents,
        bytes32 proofHash
    ) external {
        require(users[msg.sender].registeredAt > 0, "Not registered");
        require(users[msg.sender].isActive, "User inactive");
        require(bytes(actionType).length > 0, "Invalid actionType");
        require(bytes(target).length > 0, "Invalid target");

        Action memory newAction = Action({
            user: msg.sender,
            actionType: actionType,
            target: target,
            valueCents: valueCents,
            timestamp: block.timestamp,
            proofHash: proofHash
        });

        actions.push(newAction);
        users[msg.sender].totalActions++;
        totalActions++;

        emit ActionRecorded(
            msg.sender,
            actionType,
            target,
            valueCents,
            actions.length - 1
        );
    }

    /// @notice 创建运动/战役
    function createCampaign(
        string calldata campaignId,
        string calldata targetEntity,
        uint256 goalParticipants,
        uint256 durationDays
    ) external {
        require(campaigns[campaignId].startTime == 0, "Campaign exists");
        require(goalParticipants > 0, "Invalid goal");

        campaigns[campaignId] = Campaign({
            campaignId: campaignId,
            targetEntity: targetEntity,
            goalParticipants: goalParticipants,
            currentParticipants: 0,
            totalValueDiverted: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + (durationDays * 1 days),
            isActive: true
        });

        campaignIds.push(campaignId);

        emit CampaignCreated(campaignId, targetEntity, goalParticipants);
    }

    /// @notice 加入战役
    function joinCampaign(
        string calldata campaignId,
        uint256 valueDiverted
    ) external {
        require(users[msg.sender].registeredAt > 0, "Not registered");
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.isActive, "Campaign not active");
        require(block.timestamp <= campaign.endTime, "Campaign ended");

        campaign.currentParticipants++;
        campaign.totalValueDiverted += valueDiverted;

        emit CampaignJoined(campaignId, msg.sender);
    }

    // ========== 查询函数 ==========

    function getUser(address wallet) external view returns (User memory) {
        return users[wallet];
    }

    function getUserByFirebase(string calldata firebaseUid) external view returns (User memory) {
        address wallet = firebaseToWallet[firebaseUid];
        require(wallet != address(0), "User not found");
        return users[wallet];
    }

    function getShardMembers(string calldata stanceType) external view returns (address[] memory) {
        return shardMembers[stanceType];
    }

    function getShardMemberCount(string calldata stanceType) external view returns (uint256) {
        return shardMembers[stanceType].length;
    }

    function getCampaign(string calldata campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function getAction(uint256 index) external view returns (Action memory) {
        require(index < actions.length, "Invalid index");
        return actions[index];
    }

    function getGlobalStats() external view returns (
        uint256 _totalUsers,
        uint256 _totalActions,
        uint256 _totalCampaigns
    ) {
        return (totalUsers, totalActions, campaignIds.length);
    }

    // ========== 内部函数 ==========

    function _calculateStanceType(
        int8 economic,
        int8 social,
        int8 diplomatic
    ) internal pure returns (string memory) {
        // economic: 左(<0) vs 右(>=0)
        // social: 保守(<0) vs 进步(>=0)
        // diplomatic: 民族主义(<0) vs 国际主义(>=0)

        if (economic < 0) {
            // 左派
            if (social >= 0) {
                // 进步
                if (diplomatic >= 0) return "progressive-globalist";
                else return "progressive-nationalist";
            } else {
                // 保守
                if (diplomatic >= 0) return "socialist-libertarian";
                else return "socialist-nationalist";
            }
        } else {
            // 右派
            if (social >= 0) {
                // 进步
                if (diplomatic >= 0) return "capitalist-globalist";
                else return "capitalist-nationalist";
            } else {
                // 保守
                if (diplomatic >= 0) return "conservative-globalist";
                else return "conservative-nationalist";
            }
        }
    }
}
```

### 5.3 项目结构

```
backend/polis-contracts/
├── contracts/
│   ├── PolisProtocol.sol      # 主合约
│   ├── PolisToken.sol         # (可选) 治理代币
│   └── PolisGovernance.sol    # (可选) DAO 治理
├── scripts/
│   ├── deploy.js              # 部署脚本
│   └── verify.js              # 验证脚本
├── test/
│   └── PolisProtocol.test.js  # 测试
├── hardhat.config.js
└── package.json
```

### 5.4 部署配置

```javascript
// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    // Polygon 测试网 (免费测试)
    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 80001
    },
    // Polygon 主网
    polygon: {
      url: "https://polygon-rpc.com",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 137
    }
  },
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY
  }
};
```

### 5.5 前端集成

```typescript
// services/polygonService.ts
import { ethers } from 'ethers';
import PolisProtocolABI from '../contracts/PolisProtocol.json';

const CONTRACT_ADDRESS = "0x..."; // 部署后的合约地址

export class PolygonService {
  private provider: ethers.BrowserProvider;
  private contract: ethers.Contract;

  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error("请安装 MetaMask");
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await this.provider.send("eth_requestAccounts", []);

    const signer = await this.provider.getSigner();
    this.contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      PolisProtocolABI,
      signer
    );

    return accounts[0];
  }

  // 注册用户（需要 gas）
  async register(
    firebaseUid: string,
    economic: number,
    social: number,
    diplomatic: number
  ): Promise<string> {
    const tx = await this.contract.register(
      firebaseUid,
      economic,
      social,
      diplomatic
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  // 记录行动（需要 gas）
  async recordAction(
    actionType: string,
    target: string,
    valueCents: number,
    proofHash: string
  ): Promise<string> {
    const tx = await this.contract.recordAction(
      actionType,
      target,
      valueCents,
      ethers.keccak256(ethers.toUtf8Bytes(proofHash))
    );
    const receipt = await tx.wait();
    return receipt.hash;
  }

  // 查询用户（免费）
  async getUser(wallet: string): Promise<any> {
    return await this.contract.getUser(wallet);
  }

  // 查询全局统计（免费）
  async getGlobalStats(): Promise<{
    totalUsers: bigint;
    totalActions: bigint;
    totalCampaigns: bigint;
  }> {
    const [totalUsers, totalActions, totalCampaigns] =
      await this.contract.getGlobalStats();
    return { totalUsers, totalActions, totalCampaigns };
  }
}
```

### 5.6 用户流程变化

```
当前流程:
  用户登录 → Firebase Auth → 自动注册到 Polis API

Polygon 流程:
  用户登录 → Firebase Auth
           ↓
  首次: 连接钱包 → 签名注册交易 → 支付 gas (~$0.01)
           ↓
  后续操作: 签名交易 → 支付 gas
```

### 5.7 成本估算 (Polygon 主网)

| 操作 | Gas 估算 | 成本 (~$0.5/MATIC) |
|------|---------|-------------------|
| 注册用户 | ~150,000 | ~$0.01 |
| 记录行动 | ~80,000 | ~$0.005 |
| 创建战役 | ~120,000 | ~$0.008 |
| 加入战役 | ~60,000 | ~$0.004 |

### 5.8 主要挑战

| 挑战 | 说明 | 解决方案 |
|------|------|---------|
| **用户体验** | 每次操作需要钱包签名，门槛高 | 使用 meta-transaction 实现 gas 代付 |
| **成本** | 每个操作都要 gas 费 | 批量处理或使用 L2 解决方案 |
| **速度** | 链上确认需要几秒 | 乐观更新 UI，后台确认 |
| **钱包绑定** | 需要关联 Firebase 和钱包 | 在合约中存储 firebaseUid 映射 |

### 5.9 折中方案：链下 + 链上混合

```
用户行为 → Firebase (实时、免费)
              ↓ 定期批量
           Polygon (每日/每周汇总上链)
```

**优点**:
- ✅ 用户体验不变（无需钱包）
- ✅ 关键数据有链上存证
- ✅ 成本可控（批量处理）
- ✅ 保留实时性

### 5.10 实施路线图

| 阶段 | 方案 | 时间线 |
|------|------|--------|
| **第一阶段** | 保持当前架构，但数据持久化到 Firestore | 立即实施 |
| **第二阶段** | 添加链上存证（定期将哈希上链） | 1-2个月 |
| **第三阶段** | 完整 Polygon 集成（如果有真实去中心化需求） | 3-6个月 |

### 5.11 部署步骤

#### 1. 测试网部署

```bash
# 安装依赖
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# 编译合约
npx hardhat compile

# 部署到 Mumbai 测试网
npx hardhat run scripts/deploy.js --network mumbai

# 验证合约
npx hardhat verify --network mumbai <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

#### 2. 前端钱包集成

```bash
npm install ethers
```

#### 3. Gas 代付 (可选)

使用 OpenZeppelin Defender 或 Biconomy 实现 meta-transaction：

```typescript
// 使用 Biconomy 的示例
import { Biconomy } from "@biconomy/mexa";

const biconomy = new Biconomy(provider, {
  apiKey: process.env.BICONOMY_API_KEY,
  contractAddresses: [CONTRACT_ADDRESS]
});
```

#### 4. 主网部署

```bash
# 部署到 Polygon 主网
npx hardhat run scripts/deploy.js --network polygon

# 验证合约
npx hardhat verify --network polygon <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

---

## 总结

### 技术栈对比

| 系统 | 存储 | 实时性 | 成本 | 去中心化 |
|------|------|--------|------|----------|
| **Firebase Presence** | Realtime DB | 毫秒级 | 低 | 无 |
| **Polis Protocol (当前)** | Cloud Run 内存 | 秒级 | 免费 | 无 |
| **Polygon 集成** | 链上 | 秒-分钟级 | 中等 | 完全 |

### 建议

1. **短期**: 保持当前架构，优化 Presence 系统
2. **中期**: Polis Protocol 数据持久化到 Firestore
3. **长期**: 根据业务需求评估是否需要完整的区块链集成

---

**文档版本**: 1.0
**作者**: Claude Code
**审核状态**: 待审核
