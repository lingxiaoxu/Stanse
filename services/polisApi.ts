/**
 * Polis Protocol API Service
 *
 * Connects the Union tab to the Polis Protocol blockchain backend.
 * Provides methods to fetch campaigns, global stats, and user impact data.
 */

const POLIS_API_BASE = process.env.POLIS_API_URL || 'http://localhost:8080/api/v1';

// ========== Types ==========

export interface Campaign {
  id: string;
  title: string;
  target: string;
  type: 'BOYCOTT' | 'BUYCOTT' | 'PETITION' | 'RALLY' | 'VOTE' | 'DONATE';
  participants: number;
  goal: number;
  progress_percentage: number;
  days_active: number;
  description: string;
}

export interface GlobalStats {
  active_allies_online: number;
  total_union_strength: number;
  capital_diverted_usd: number;
  total_shards: number;
  total_active_campaigns: number;
}

export interface UserImpact {
  campaigns: number;
  streak: number;
  redirected_usd: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

// ========== API Methods ==========

/**
 * Fetch all active campaigns from the Polis Protocol backend
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/campaigns`);
    const json: ApiResponse<Campaign[]> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to fetch campaigns');
    }

    return json.data;
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    throw error;
  }
}

/**
 * Fetch global statistics (live count, union strength, capital diverted)
 */
export async function fetchGlobalStats(): Promise<GlobalStats> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/stats/global`);
    const json: ApiResponse<GlobalStats> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to fetch global stats');
    }

    return json.data;
  } catch (error) {
    console.error('Error fetching global stats:', error);
    throw error;
  }
}

/**
 * Fetch user impact statistics
 * @param userDid - User's decentralized identifier (DID)
 */
export async function fetchUserImpact(userDid: string): Promise<UserImpact> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/user/${userDid}/impact`);
    const json: ApiResponse<UserImpact> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to fetch user impact');
    }

    return json.data;
  } catch (error) {
    console.error('Error fetching user impact:', error);
    throw error;
  }
}

/**
 * Submit a new political action to the blockchain
 */
export async function submitAction(params: {
  user_did: string;
  action_type: 'BOYCOTT' | 'BUYCOTT' | 'VOTE' | 'DONATE' | 'RALLY';
  target_entity: string;
  value_diverted: number;
  zk_proof: string;
  shard_id: string;
}): Promise<string> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/actions/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const json: ApiResponse<string> = await response.json();

    if (!json.success || !json.data) {
      throw new Error(json.error || 'Failed to submit action');
    }

    return json.data;
  } catch (error) {
    console.error('Error submitting action:', error);
    throw error;
  }
}

/**
 * Generate a DID (Decentralized Identifier) for a user
 * Format: did:polis:<hash>
 *
 * For demo purposes, this creates a consistent DID based on user email.
 * In production, this should use the crypto module from the backend.
 */
export function generateUserDID(userEmail: string): string {
  // Simple hash function for demo purposes
  let hash = 0;
  for (let i = 0; i < userEmail.length; i++) {
    const char = userEmail.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const hashStr = Math.abs(hash).toString(16).padStart(16, '0');
  return `did:polis:${hashStr}`;
}

/**
 * Check if the Polis Protocol backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${POLIS_API_BASE}/health`);
    const json: ApiResponse<string> = await response.json();
    return json.success;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
}
