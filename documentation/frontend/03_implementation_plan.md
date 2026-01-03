# Firebase用户集成实现方案

## 已完成 ✅
1. **Demo Mode修复** - main.rs现在正确区分demo/production mode
2. **架构设计文档** - docs/FIREBASE_POLIS_INTEGRATION.md
3. **Union Report脚本** - scripts/generate-union-report.sh

## 核心实现方案

### 方案选择
由于已有代码结构完善，我们采用**最小化修改**方案：
- 利用现有的`user_routes: HashMap<String, Vec<String>>`
- 扩展现有的节点管理系统
- 添加简单的Firebase UID映射

### Backend实现（3个文件修改）

#### 1. blockchain.rs - 添加用户管理
在`PolisProtocol`结构中添加：
```rust
pub struct PolisProtocol {
    pub shards: HashMap<String, StanceShard>,
    pub user_routes: HashMap<String, Vec<String>>,

    // NEW: Firebase用户映射
    pub firebase_users: HashMap<String, FirebaseUserInfo>, // Firebase UID → 用户信息
}

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

impl PolisProtocol {
    // NEW: 注册Firebase用户
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
        self.firebase_users.insert(firebase_uid.clone(), FirebaseUserInfo {
            firebase_uid: firebase_uid.clone(),
            polis_did: polis_did.clone(),
            display_name,
            coordinates,
            is_online: true,
            last_activity: chrono::Utc::now().timestamp(),
            total_actions: 0,
        });

        self.user_routes.insert(polis_did.clone(), shard_ids);
        Ok(polis_did)
    }

    // NEW: 更新用户活动
    pub fn update_user_activity(&mut self, firebase_uid: &str, is_online: bool) -> Result<(), String> {
        let user = self.firebase_users.get_mut(firebase_uid)
            .ok_or("User not found")?;

        user.is_online = is_online;
        user.last_activity = chrono::Utc::now().timestamp();

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

    // NEW: 记录用户行动
    pub fn record_user_action(&mut self, firebase_uid: &str) -> Result<(), String> {
        let user = self.firebase_users.get_mut(firebase_uid)
            .ok_or("User not found")?;
        user.total_actions += 1;
        Ok(())
    }
}
```

#### 2. api_server.rs - 添加新endpoints
```rust
// 新的请求/响应结构
#[derive(Deserialize)]
pub struct RegisterUserRequest {
    pub firebase_uid: String,
    pub display_name: String,
    pub economic: f32,
    pub social: f32,
    pub diplomatic: f32,
}

#[derive(Deserialize)]
pub struct RecordActionRequest {
    pub firebase_uid: String,
    pub action_type: String,  // "Buycott", "Boycott", "Vote"
    pub target: String,       // 公司symbol或campaign ID
    pub value_cents: u64,     // 金额(美分)
}

#[derive(Deserialize)]
pub struct HeartbeatRequest {
    pub firebase_uid: String,
    pub is_online: bool,
}

// 添加路由
pub fn create_router(state: ApiState) -> Router {
    Router::new()
        // ... 现有路由 ...
        .route("/api/v1/users/register", post(register_user))
        .route("/api/v1/actions/record", post(record_action))
        .route("/api/v1/users/heartbeat", post(user_heartbeat))
        .layer(cors)
        .with_state(Arc::new(state))
}

// Handler实现
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

async fn record_action(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<RecordActionRequest>,
) -> Result<Json<ApiResponse<String>>, StatusCode> {
    let mut protocol = state.protocol.lock().unwrap();

    // 1. 记录action计数
    protocol.record_user_action(&req.firebase_uid)?;

    // 2. 创建ImpactAction并提交到shard
    let user = protocol.firebase_users.get(&req.firebase_uid)
        .ok_or("User not found")?;

    let action = ImpactAction {
        user_did: user.polis_did.clone(),
        action_type: match req.action_type.as_str() {
            "Buycott" => ActionType::Buycott,
            "Boycott" => ActionType::Boycott,
            _ => ActionType::Vote,
        },
        target_entity: req.target,
        value_diverted: req.value_cents,
        zk_proof: format!("firebase_verified_{}", uuid::Uuid::new_v4()),
        timestamp: chrono::Utc::now().timestamp(),
        action_id: uuid::Uuid::new_v4().to_string(),
    };

    // 提交到用户的第一个shard
    if let Some(shard_ids) = protocol.user_routes.get(&user.polis_did) {
        if let Some(shard_id) = shard_ids.first() {
            protocol.submit_action(shard_id, action)?;
        }
    }

    Ok(Json(ApiResponse::success("Action recorded".to_string())))
}

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
```

### Frontend实现（2个新文件）

#### 3. services/userActionService.ts
```typescript
import { auth } from './firebase';

const API_BASE = 'http://localhost:8080/api/v1';

// 用户注册（首次登录时调用）
export async function registerUser(
  firebaseUid: string,
  displayName: string,
  coordinates: { economic: number; social: number; diplomatic: number }
) {
  const response = await fetch(`${API_BASE}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firebase_uid: firebaseUid,
      display_name: displayName,
      economic: coordinates.economic,
      social: coordinates.social,
      diplomatic: coordinates.diplomatic
    })
  });
  return response.json();
}

// 记录用户行动
export async function recordUserAction(
  firebaseUid: string,
  actionType: 'Buycott' | 'Boycott' | 'Vote',
  target: string,
  valueCents: number = 0
) {
  const response = await fetch(`${API_BASE}/actions/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firebase_uid: firebaseUid,
      action_type: actionType,
      target,
      value_cents: valueCents
    })
  });
  return response.json();
}

// 发送心跳（保持在线状态）
export async function sendHeartbeat(firebaseUid: string, isOnline: boolean = true) {
  const response = await fetch(`${API_BASE}/users/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firebase_uid: firebaseUid,
      is_online: isOnline
    })
  });
  return response.json();
}

// 设置heartbeat定时器
export function startHeartbeat(firebaseUid: string): NodeJS.Timeout {
  return setInterval(() => {
    sendHeartbeat(firebaseUid, true).catch(console.error);
  }, 30000); // 每30秒一次
}
```

#### 4. 集成到AuthContext.tsx
```typescript
// 在AuthContext中，当用户完成onboarding后：
const completeOnboarding = async (answers: OnboardingAnswers) => {
  const coords = await calculateCoordinatesFromOnboarding(answers);
  await updateCoordinates(coords);

  // NEW: 注册到Polis Protocol
  if (user?.uid) {
    await registerUser(user.uid, user.displayName || 'User', coords);
    // 启动heartbeat
    const heartbeatTimer = startHeartbeat(user.uid);
    // 保存timer ID以便清理
  }

  return coords;
};
```

#### 5. 集成到ValuesCompanyRanking.tsx
```typescript
// 当用户查看公司ranking时，自动记录interaction
const CompanyCard = ({ company, type }) => {
  const { user } = useAuth();

  const handleClick = async () => {
    if (user?.uid) {
      await recordUserAction(
        user.uid,
        type === 'support' ? 'Buycott' : 'Boycott',
        company.symbol,
        5000  // $50估算值
      );
    }
  };

  return (
    <div onClick={handleClick}>
      {/* ... existing UI ... */}
    </div>
  );
};
```

## 实现步骤

1. **Backend修改** (30分钟)
   - 修改 blockchain.rs 添加用户管理
   - 修改 api_server.rs 添加3个endpoints
   - 测试编译

2. **Frontend Service** (15分钟)
   - 创建 userActionService.ts
   - 在AuthContext中集成注册和heartbeat

3. **UI集成** (15分钟)
   - ValuesCompanyRanking添加action tracking
   - 测试用户注册流程

4. **测试** (30分钟)
   - Demo mode ON: 验证仍显示测试数据
   - Demo mode OFF: 注册真实用户，验证显示真实数据
   - 生成union report确认真实用户被追踪

## 预期结果

### Demo Mode ON
```
Union Tab:
- Active Allies: 10 (demo users)
- Capital Diverted: $XXX (demo data)
- Campaigns: 2 (demo campaigns)
```

### Demo Mode OFF (有真实用户后)
```
Union Tab:
- Active Allies: 5 (5个Firebase用户在线)
- Capital Diverted: $150.00 (3个用户各$50 action)
- Campaigns: 0 (初期无真实campaigns)
```

## 后续优化
1. Firebase Auth token验证
2. Rate limiting
3. Action去重
4. 数据持久化（目前in-memory）
