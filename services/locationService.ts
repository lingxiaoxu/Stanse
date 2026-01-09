/**
 * Location Service
 * Handles geolocation requests across different devices and browsers
 * Supports: iPhone/iPad (large/small screens), PC browsers (Chrome, Safari, etc.)
 */

export type LocationStatus = 'granted' | 'denied' | 'unknown' | 'unavailable' | 'pending';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  timestamp: string;
  source: 'gps' | 'network' | 'ip';
}

export interface LocationResult {
  status: LocationStatus;
  location?: UserLocation;
  errorMessage?: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  browser: string;
}

/**
 * Detect device type based on user agent and screen size
 */
export const detectDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.innerWidth;

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
 * Check if geolocation is supported by the browser
 */
export const isGeolocationSupported = (): boolean => {
  return 'geolocation' in navigator;
};

/**
 * Check current permission status (if Permission API is available)
 */
export const checkLocationPermission = async (): Promise<PermissionState | null> => {
  if (!navigator.permissions) {
    return null; // Permissions API not supported (Safari)
  }

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch (error) {
    console.warn('Failed to check location permission:', error);
    return null;
  }
};

/**
 * Request user's location
 * This is the main function to call when requesting location
 *
 * @param timeout - Maximum time to wait for location (default: 10 seconds)
 * @returns LocationResult with status, location data, and device info
 */
export const requestLocation = async (timeout: number = 10000): Promise<LocationResult> => {
  const deviceType = detectDeviceType();
  const browser = detectBrowser();

  // Check if geolocation is supported
  if (!isGeolocationSupported()) {
    return {
      status: 'unavailable',
      errorMessage: 'Geolocation is not supported by this browser',
      deviceType,
      browser
    };
  }

  try {
    // Request location with high accuracy for mobile, lower for desktop
    const options: PositionOptions = {
      enableHighAccuracy: deviceType !== 'desktop', // High accuracy for mobile/tablet
      timeout,
      maximumAge: 60000 // Accept cached position up to 1 minute old
    };

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

    const location: UserLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: new Date().toISOString(),
      source: position.coords.accuracy < 100 ? 'gps' : 'network'
    };

    console.log(`📍 Location obtained: ${location.latitude}, ${location.longitude} (accuracy: ${location.accuracy}m)`);

    return {
      status: 'granted',
      location,
      deviceType,
      browser
    };
  } catch (error: any) {
    const geoError = error as GeolocationPositionError;

    let status: LocationStatus;
    let errorMessage: string;

    switch (geoError.code) {
      case GeolocationPositionError.PERMISSION_DENIED:
        status = 'denied';
        errorMessage = 'Location permission denied by user';
        console.log('📍 Location permission denied by user');
        break;
      case GeolocationPositionError.POSITION_UNAVAILABLE:
        status = 'unknown';
        errorMessage = 'Location information is unavailable';
        console.log('📍 Location unavailable');
        break;
      case GeolocationPositionError.TIMEOUT:
        status = 'unknown';
        errorMessage = 'Location request timed out';
        console.log('📍 Location request timed out');
        break;
      default:
        status = 'unknown';
        errorMessage = geoError.message || 'Unknown location error';
        console.log('📍 Location error:', geoError.message);
    }

    return {
      status,
      errorMessage,
      deviceType,
      browser
    };
  }
};

/**
 * Format location for display (approximate city-level for privacy)
 * Returns a human-readable string
 */
export const formatLocationForDisplay = (location: UserLocation): string => {
  // Round to ~1km precision for privacy
  const lat = location.latitude.toFixed(2);
  const lng = location.longitude.toFixed(2);
  return `${lat}°, ${lng}°`;
};

/**
 * Get location status text for UI display
 */
export const getLocationStatusText = (status: LocationStatus, language: string = 'en'): string => {
  const texts: Record<string, Record<LocationStatus, string>> = {
    en: {
      granted: 'Location enabled',
      denied: 'Permission denied by user',
      unknown: 'Location unknown',
      unavailable: 'Not supported',
      pending: 'Requesting...'
    },
    zh: {
      granted: '已获取定位',
      denied: '用户拒绝授权',
      unknown: '位置未知',
      unavailable: '不支持定位',
      pending: '请求中...'
    },
    ja: {
      granted: '位置情報取得済み',
      denied: 'ユーザーが拒否',
      unknown: '位置不明',
      unavailable: '非対応',
      pending: 'リクエスト中...'
    },
    fr: {
      granted: 'Localisation activée',
      denied: 'Refusé par l\'utilisateur',
      unknown: 'Position inconnue',
      unavailable: 'Non supporté',
      pending: 'Demande en cours...'
    },
    es: {
      granted: 'Ubicación habilitada',
      denied: 'Permiso denegado',
      unknown: 'Ubicación desconocida',
      unavailable: 'No soportado',
      pending: 'Solicitando...'
    }
  };

  return texts[language]?.[status] || texts.en[status];
};
