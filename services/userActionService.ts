import { auth } from './firebase';

const API_BASE = 'http://localhost:8080/api/v1';

/**
 * 用户注册（首次登录时调用）
 */
export async function registerUser(
  firebaseUid: string,
  displayName: string,
  coordinates: { economic: number; social: number; diplomatic: number }
) {
  try {
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

    const data = await response.json();

    if (data.success) {
      console.log('✅ User registered with Polis DID:', data.data);
      return data;
    } else {
      console.error('❌ User registration failed:', data.error);
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('❌ Error registering user:', error);
    throw error;
  }
}

/**
 * 记录用户行动
 */
export async function recordUserAction(
  firebaseUid: string,
  actionType: 'Buycott' | 'Boycott' | 'Vote',
  target: string,
  valueCents: number = 0
) {
  try {
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

    const data = await response.json();

    if (data.success) {
      console.log(`✅ Action recorded: ${actionType} on ${target}`);
      return data;
    } else {
      console.error('❌ Action recording failed:', data.error);
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('❌ Error recording action:', error);
    throw error;
  }
}

/**
 * 发送心跳（保持在线状态）
 */
export async function sendHeartbeat(firebaseUid: string, isOnline: boolean = true) {
  try {
    const response = await fetch(`${API_BASE}/users/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebase_uid: firebaseUid,
        is_online: isOnline
      })
    });

    const data = await response.json();

    if (!data.success) {
      console.warn('⚠️ Heartbeat failed:', data.error);
    }

    return data;
  } catch (error) {
    console.warn('⚠️ Error sending heartbeat:', error);
    // Don't throw on heartbeat errors - just log them
    return null;
  }
}

/**
 * 设置heartbeat定时器
 */
export function startHeartbeat(firebaseUid: string): NodeJS.Timeout {
  // Send initial heartbeat
  sendHeartbeat(firebaseUid, true);

  // Set up interval for every 30 seconds
  const intervalId = setInterval(() => {
    sendHeartbeat(firebaseUid, true).catch(console.error);
  }, 30000); // 每30秒一次

  console.log('💓 Heartbeat timer started for user:', firebaseUid);

  return intervalId;
}

/**
 * 停止heartbeat定时器并发送离线状态
 */
export async function stopHeartbeat(firebaseUid: string, intervalId: NodeJS.Timeout) {
  clearInterval(intervalId);
  await sendHeartbeat(firebaseUid, false);
  console.log('💔 Heartbeat timer stopped for user:', firebaseUid);
}

/**
 * 设置页面可见性监听器
 */
export function setupVisibilityListener(firebaseUid: string) {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      // Page is hidden - send offline status
      sendHeartbeat(firebaseUid, false);
    } else {
      // Page is visible - send online status
      sendHeartbeat(firebaseUid, true);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Return cleanup function
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * 设置beforeunload监听器（页面关闭时发送离线状态）
 */
export function setupBeforeUnloadListener(firebaseUid: string) {
  const handleBeforeUnload = () => {
    // Use sendBeacon for reliable delivery when page is closing
    const blob = new Blob([JSON.stringify({
      firebase_uid: firebaseUid,
      is_online: false
    })], { type: 'application/json' });

    navigator.sendBeacon(`${API_BASE}/users/heartbeat`, blob);
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  // Return cleanup function
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}