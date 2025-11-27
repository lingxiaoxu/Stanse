/**
 * Polis Protocol Service - Frontend Integration
 *
 * 连接到 Rust 后端的 API 服务，实现去中心化政治协议的前端集成
 * 这是一个轻节点客户端，通过 RESTful API 与 Polis Protocol 通信
 */

// API 基础 URL（开发环境 / 生产环境自动切换）
const POLIS_API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://your-polis-api.com/api/v1'  // 生产环境 URL
  : 'http://localhost:8080/api/v1';       // 本地开发 URL

/**
 * 全局统计信息类型（对应 Rust GlobalStatsResponse）
 */
export interface GlobalStats {
  active_allies_online: number;
  total_union_strength: number;
  capital_diverted_usd: number;
  total_shards: number;
  total_active_campaigns: number;
}

/**
 * 战役详情类型（对应 Rust CampaignResponse）
 */
export interface Campaign {
  id: string;
  title: string;
  target: string;
  campaign_type: 'BOYCOTT' | 'BUYCOTT' | 'PETITION' | 'RALLY';
  participants: number;
  goal: number;
  progress_percentage: number;
  days_active: number;
  description: string;
}

/**
 * 用户影响力类型（对应 Rust UserImpactResponse）
 */
export interface UserImpact {
  campaigns: number;
  streak: number;
  redirected_usd: number;
}

/**
 * API 响应包装器
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 提交行动的请求参数
 */
export interface SubmitActionRequest {
  user_did: string;
  action_type: 'BOYCOTT' | 'BUYCOTT' | 'VOTE' | 'DONATE' | 'RALLY';
  target_entity: string;
  value_diverted: number; // 以美分为单位
  zk_proof: string;
  shard_id: string;
}

/**
 * 获取全局统计信息
 *
 * 对应 UI 顶部的统计数据：
 * - ACTIVE ALLIES ONLINE
 * - TOTAL UNION STRENGTH
 * - CAPITAL DIVERTED
 */
export async function getGlobalStats(): Promise<GlobalStats> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/stats/global`);
    const json: ApiResponse<GlobalStats> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to fetch global stats');
    }

    return json.data;
  } catch (error) {
    console.error('Error fetching global stats:', error);
    // 返回模拟数据作为降级方案
    return {
      active_allies_online: 5532,
      total_union_strength: 45201,
      capital_diverted_usd: 1240000,
      total_shards: 3,
      total_active_campaigns: 8,
    };
  }
}

/**
 * 获取所有活跃战役
 *
 * 对应 UI 的 "ACTIVE FRONTS" 卡片列表
 */
export async function getCampaigns(): Promise<Campaign[]> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/campaigns`);
    const json: ApiResponse<Campaign[]> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to fetch campaigns');
    }

    return json.data;
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    // 返回模拟数据作为降级方案
    return [
      {
        id: 'fair-wages-initiative',
        title: 'Fair Wages Initiative',
        target: 'MegaCorp',
        campaign_type: 'BOYCOTT',
        participants: 12486,
        goal: 15000,
        progress_percentage: 83.24,
        days_active: 14,
        description: 'Demand living wages for all workers',
      },
      {
        id: 'green-energy-2025',
        title: 'Green Energy Now',
        target: 'Fossil Corp',
        campaign_type: 'PETITION',
        participants: 8234,
        goal: 10000,
        progress_percentage: 82.34,
        days_active: 21,
        description: 'Transition to renewable energy',
      },
    ];
  }
}

/**
 * 获取单个战役详情
 */
export async function getCampaign(campaignId: string): Promise<Campaign | null> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/campaigns/${campaignId}`);
    const json: ApiResponse<Campaign> = await response.json();

    if (!json.success || !json.data) {
      return null;
    }

    return json.data;
  } catch (error) {
    console.error(`Error fetching campaign ${campaignId}:`, error);
    return null;
  }
}

/**
 * 获取用户的个人影响力统计
 *
 * 对应 UI 的 "YOUR IMPACT" 部分：
 * - CAMPAIGNS (参与的战役数)
 * - STREAK (连续活跃天数)
 * - REDIRECTED (转移的资金总额)
 */
export async function getUserImpact(userDid: string): Promise<UserImpact> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/user/${encodeURIComponent(userDid)}/impact`);
    const json: ApiResponse<UserImpact> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to fetch user impact');
    }

    return json.data;
  } catch (error) {
    console.error('Error fetching user impact:', error);
    // 返回默认值
    return {
      campaigns: 0,
      streak: 0,
      redirected_usd: 0,
    };
  }
}

/**
 * 提交用户的政治行动到区块链
 *
 * 这是核心功能：当用户执行抵制、支持等行动时，
 * 生成零知识证明并提交到对应的立场分片
 */
export async function submitAction(request: SubmitActionRequest): Promise<boolean> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/actions/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const json: ApiResponse<string> = await response.json();
    return json.success;
  } catch (error) {
    console.error('Error submitting action:', error);
    return false;
  }
}

/**
 * 根据用户的政治立场向量，获取推荐的分片ID
 *
 * @param ideologyVector [经济(-100到100), 社会(-100到100), 外交(-100到100)]
 * @returns 适合该用户的分片ID列表
 */
export function getRecommendedShards(ideologyVector: [number, number, number]): string[] {
  const [economic, social, diplomatic] = ideologyVector;

  const shards: string[] = [];

  // 环保主义分片：左翼经济 + 自由社会 + 国际主义
  if (economic < 0 && social > 50 && diplomatic > 0) {
    shards.push('green-energy-2025');
  }

  // 劳工权益分片：社会主义经济 + 中立社会 + 部分民族主义
  if (economic < -20 && social > -50 && social < 50) {
    shards.push('labor-rights-2025');
  }

  // 自由市场分片：右翼经济
  if (economic > 20) {
    shards.push('free-market-2025');
  }

  // 如果没有匹配的分片，返回默认分片
  if (shards.length === 0) {
    shards.push('general-activism-2025');
  }

  return shards;
}

/**
 * 生成简化的零知识证明（用于 MVP 阶段）
 *
 * 真实环境需要使用 zk-SNARK 库（如 snarkjs）
 * 当前返回一个模拟的证明字符串
 */
export function generateSimpleZKProof(action: {
  userDid: string;
  actionType: string;
  timestamp: number;
}): string {
  // 简化版：使用时间戳和随机数生成一个"证明"
  const data = `${action.userDid}:${action.actionType}:${action.timestamp}`;
  const randomSalt = Math.random().toString(36).substring(2);

  // 真实环境应该使用加密哈希和 zk-SNARK 证明
  // 例如：const proof = await snarkjs.groth16.fullProve(witness, wasm, zkey);
  return `zkproof_${btoa(data)}_${randomSalt}`;
}

/**
 * 检查 Polis API 的健康状态
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/health`);
    const json: ApiResponse<string> = await response.json();
    return json.success;
  } catch (error) {
    console.error('Polis API health check failed:', error);
    return false;
  }
}

/**
 * 格式化资金数额为易读格式
 *
 * @param cents 美分数额
 * @returns 格式化的字符串（如 "$1.24M"）
 */
export function formatCapitalDiverted(cents: number): string {
  const dollars = cents / 100;

  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2)}M`;
  } else if (dollars >= 1_000) {
    return `$${(dollars / 1_000).toFixed(1)}K`;
  } else {
    return `$${dollars.toFixed(2)}`;
  }
}

/**
 * 格式化大数字为易读格式
 *
 * @param num 数字
 * @returns 格式化的字符串（如 "12,486"）
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}
