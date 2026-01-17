/**
 * Notification Service
 * Handles push notification permission requests across different devices and browsers
 * Supports: iPhone/iPad (large/small screens), PC browsers (Chrome, Safari, etc.)
 */

export type NotificationStatus = 'granted' | 'denied' | 'default' | 'unsupported' | 'pending';

export interface NotificationResult {
  status: NotificationStatus;
  errorMessage?: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
}

/**
 * Detect device type based on user agent and screen size
 */
export const detectDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  const userAgent = navigator.userAgent.toLowerCase();

  // Check for iPad specifically (including iPadOS which reports as Mac)
  const isIPad = /ipad/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Check for mobile devices
  const isMobile = /iphone|android.*mobile|windows phone|blackberry/.test(userAgent);

  // Check for tablets (Android tablets, iPad)
  const isTablet = isIPad || /android(?!.*mobile)/.test(userAgent);

  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
};

/**
 * Detect browser name
 */
export const detectBrowser = (): string => {
  const userAgent = navigator.userAgent;

  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari';
  } else if (userAgent.includes('Chrome')) {
    return 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    return 'Firefox';
  } else if (userAgent.includes('Edge')) {
    return 'Edge';
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    return 'Opera';
  }
  return 'Unknown';
};

/**
 * Check if Notification API is supported by the browser
 */
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window;
};

/**
 * Check current notification permission status
 */
export const checkNotificationPermission = (): NotificationStatus => {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission as NotificationStatus;
};

/**
 * Request notification permission
 * This is the main function to call when requesting notification permission
 *
 * @returns NotificationResult with status and device info
 */
export const requestNotificationPermission = async (): Promise<NotificationResult> => {
  const deviceType = detectDeviceType();
  const browser = detectBrowser();

  // Check if notifications are supported
  if (!isNotificationSupported()) {
    console.log('🔔 Notifications not supported on this device/browser');
    return {
      status: 'unsupported',
      errorMessage: 'Notifications are not supported on this device or browser',
      deviceType,
      browser
    };
  }

  // Check current permission status
  const currentPermission = Notification.permission;

  // If already granted, return immediately
  if (currentPermission === 'granted') {
    console.log('🔔 Notification permission already granted');
    return {
      status: 'granted',
      deviceType,
      browser
    };
  }

  // If already denied, user needs to change in browser settings
  if (currentPermission === 'denied') {
    console.log('🔔 Notification permission previously denied');
    return {
      status: 'denied',
      errorMessage: 'Notification permission was denied. Please enable in browser settings.',
      deviceType,
      browser
    };
  }

  // Request permission (only when status is 'default')
  try {
    console.log('🔔 Requesting notification permission...');
    const permission = await Notification.requestPermission();

    console.log(`🔔 Notification permission result: ${permission}`);

    if (permission === 'granted') {
      // Show a test notification to confirm it works
      try {
        new Notification('Stanse', {
          body: 'Notifications enabled!',
          icon: '/favicon.ico',
          tag: 'stanse-welcome'
        });
      } catch (e) {
        console.log('🔔 Could not show test notification:', e);
      }
    }

    return {
      status: permission as NotificationStatus,
      deviceType,
      browser
    };
  } catch (error: any) {
    console.error('🔔 Error requesting notification permission:', error);
    return {
      status: 'denied',
      errorMessage: error.message || 'Failed to request notification permission',
      deviceType,
      browser
    };
  }
};

/**
 * Get notification status text for UI display
 */
export const getNotificationStatusText = (status: NotificationStatus, language: string = 'en'): string => {
  const texts: Record<string, Record<NotificationStatus, string>> = {
    en: {
      granted: 'Notifications enabled',
      denied: 'Permission denied by user',
      default: 'Tap to enable notifications',
      unsupported: 'Not supported',
      pending: 'Requesting...'
    },
    zh: {
      granted: '通知已启用',
      denied: '用户拒绝授权',
      default: '点击启用通知',
      unsupported: '不支持通知',
      pending: '请求中...'
    },
    ja: {
      granted: '通知が有効',
      denied: 'ユーザーが拒否',
      default: 'タップして通知を有効化',
      unsupported: '非対応',
      pending: 'リクエスト中...'
    },
    fr: {
      granted: 'Notifications activées',
      denied: 'Refusé par l\'utilisateur',
      default: 'Appuyez pour activer',
      unsupported: 'Non supporté',
      pending: 'Demande en cours...'
    },
    es: {
      granted: 'Notificaciones habilitadas',
      denied: 'Permiso denegado',
      default: 'Toca para habilitar',
      unsupported: 'No soportado',
      pending: 'Solicitando...'
    }
  };

  return texts[language]?.[status] || texts.en[status];
};

/**
 * Send a local notification (for testing or immediate alerts)
 */
export const sendLocalNotification = (title: string, body: string, options?: NotificationOptions): boolean => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    console.log('🔔 Cannot send notification - not supported or not permitted');
    return false;
  }

  try {
    new Notification(title, {
      body,
      // Don't use icon to avoid 404 errors
      ...options
    });
    return true;
  } catch (error) {
    console.error('🔔 Error sending notification:', error);
    return false;
  }
};
