/**
 * Online Presence Service
 *
 * Tracks which users are currently online in STANSE
 * Uses Firebase Realtime Database for real-time presence updates
 */

import { rtdb } from './firebase';
import { ref, onValue, onDisconnect, set, serverTimestamp, get } from 'firebase/database';

export interface OnlineUser {
  userId: string;
  email?: string;
  personaLabel?: string;
  stanceType?: string; // Nationality prefix (for backwards compatibility)
  coreStanceType?: string; // Core persona type (new field)
  lastSeen: number;
  status: 'online' | 'away';
  inDuelQueue?: boolean;
}

/**
 * Set user as online and auto-disconnect on close
 * Tracks user activity (clicks, scrolls, key presses) as heartbeat
 */
export function setUserOnline(
  userId: string,
  userData: {
    email?: string;
    personaLabel?: string;
    stanceType?: string;
    coreStanceType?: string;
  }
): () => void {
  const userStatusRef = ref(rtdb, `presence/${userId}`);
  const lastSeenRef = ref(rtdb, `presence/${userId}/lastSeen`);

  // Build user status data
  // Email must always be provided (should come from userProfile which has our generated email)
  if (!userData.email) {
    console.error('Email is required for presence service but was not provided for user:', userId);
    throw new Error('Email is required for presence tracking');
  }

  const userStatusData: any = {
    userId,
    email: userData.email,
    personaLabel: userData.personaLabel,
    stanceType: userData.stanceType,
    status: 'online',
    lastSeen: serverTimestamp(),
    inDuelQueue: false
  };

  // Only add coreStanceType if defined (new optional field)
  if (userData.coreStanceType) {
    userStatusData.coreStanceType = userData.coreStanceType;
  }

  // Set user as online
  set(userStatusRef, userStatusData);

  // Set up disconnect handler - marks as offline when connection lost
  onDisconnect(userStatusRef).remove();

  let lastUpdateTime = Date.now();
  const MIN_UPDATE_INTERVAL = 5000; // Only update every 5 seconds max

  // Update lastSeen on any user activity
  const updateLastSeen = () => {
    const now = Date.now();
    if (now - lastUpdateTime >= MIN_UPDATE_INTERVAL) {
      set(lastSeenRef, serverTimestamp()).catch(err => {
        console.warn('[Presence] Failed to update lastSeen:', err);
      });
      lastUpdateTime = now;
    }
  };

  // Listen for user activity
  const activityEvents = ['click', 'scroll', 'keydown', 'touchstart', 'mousemove'];
  activityEvents.forEach(event => {
    window.addEventListener(event, updateLastSeen, { passive: true });
  });

  // Fallback: Update every 30 seconds even if no activity
  const heartbeatInterval = setInterval(() => {
    set(lastSeenRef, serverTimestamp()).catch(err => {
      console.warn('[Presence] Failed to update lastSeen:', err);
    });
  }, 30000);

  console.log(`[Presence] Activity tracking started for user ${userId}`);

  // Return cleanup function
  return () => {
    clearInterval(heartbeatInterval);
    activityEvents.forEach(event => {
      window.removeEventListener(event, updateLastSeen);
    });
    set(userStatusRef, {
      ...userStatusData,
      status: 'away',
      lastSeen: serverTimestamp()
    });
    console.log(`[Presence] Cleaned up for user ${userId}`);
  };
}

/**
 * Update user's duel queue status
 */
export async function setInDuelQueue(userId: string, inQueue: boolean): Promise<void> {
  const queueStatusRef = ref(rtdb, `presence/${userId}/inDuelQueue`);
  await set(queueStatusRef, inQueue);
  console.log(`[Presence] Set inDuelQueue=${inQueue} for ${userId.substr(-6)}`);
}

/**
 * Listen for all online users
 * Returns unsubscribe function
 */
export function listenForOnlineUsers(
  callback: (users: OnlineUser[]) => void
): () => void {
  const presenceRef = ref(rtdb, 'presence');

  const unsubscribe = onValue(presenceRef, (snapshot) => {
    const users: OnlineUser[] = [];
    const data = snapshot.val();

    if (data) {
      Object.values(data).forEach((user: any) => {
        // Only include truly online users (not away)
        if (user.status === 'online') {
          users.push(user);
        }
      });
    }

    callback(users);
  });

  return unsubscribe;
}

/**
 * Get current online users (one-time fetch)
 */
export async function getOnlineUsers(): Promise<OnlineUser[]> {
  const presenceRef = ref(rtdb, 'presence');
  const snapshot = await get(presenceRef);

  const users: OnlineUser[] = [];
  const data = snapshot.val();

  if (data) {
    Object.values(data).forEach((user: any) => {
      if (user.status === 'online') {
        users.push(user);
      }
    });
  }

  return users;
}

/**
 * Get users currently in DUEL queue
 */
export async function getUsersInDuelQueue(): Promise<OnlineUser[]> {
  const users = await getOnlineUsers();
  return users.filter(u => u.inDuelQueue === true);
}
