
import React, { useState, useEffect, useRef } from 'react';
import { PixelCard } from '../ui/PixelCard';
import { Globe, RotateCcw, MapPin, Bell, Shield, Users, Camera, MessageSquare } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Language } from '../../types';
import { disconnectAllSocialMedia, updateUserLocation, getUserLocation, clearUserLocation, StoredLocation, LocationStatus, updateUserNotification, getUserNotification, clearUserNotification, StoredNotification, NotificationStatus, updateUserCamera, getUserCamera, clearUserCamera, StoredCamera, CameraStatus } from '../../services/userService';
import { requestLocation, detectDeviceType, detectBrowser, getLocationStatusText, checkLocationPermission } from '../../services/locationService';
import { requestNotificationPermission, checkNotificationPermission, getNotificationStatusText, detectDeviceType as detectNotifDeviceType, detectBrowser as detectNotifBrowser } from '../../services/notificationService';
import { startBreakingNewsListener, stopBreakingNewsListener } from '../../services/breakingNewsService';

// Default settings values
const DEFAULT_SETTINGS = {
  language: Language.EN,
  notifications: false, // Default OFF - only request when user enables
  location: false, // Default OFF - only request when user enables
  camera: false, // Default OFF - only request when user enables
  strictMode: false,
  demoMode: true
};

export const SettingsView: React.FC = () => {
  const [notifications, setNotifications] = useState(DEFAULT_SETTINGS.notifications);
  const [location, setLocation] = useState(DEFAULT_SETTINGS.location);
  const [camera, setCamera] = useState(DEFAULT_SETTINGS.camera);
  const [strictMode, setStrictMode] = useState(DEFAULT_SETTINGS.strictMode);
  const [showAIButton, setShowAIButton] = useState(() => {
    const saved = localStorage.getItem('stanse_show_ai_button');
    return saved !== 'false'; // Default to true
  });
  const [isResetting, setIsResetting] = useState(false);
  const [settingsModified, setSettingsModified] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const hasRequestedLocation = useRef(false);
  // Notification state
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus | null>(null);
  const [isRequestingNotification, setIsRequestingNotification] = useState(false);
  const hasRequestedNotification = useRef(false);
  // Camera state
  const [cameraStatus, setCameraStatus] = useState<CameraStatus | null>(null);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const hasRequestedCamera = useRef(false);
  const { t, language, setLanguage } = useLanguage();
  const { resetOnboarding, hasCompletedOnboarding, demoMode, setDemoMode, user } = useAuth();

  // Load saved location and notification status on mount
  // IMPORTANT: Always check BROWSER's actual permission state first, as it's the source of truth
  // This handles "Allow Once" permission which expires after the session
  useEffect(() => {
    const loadSavedSettings = async () => {
      if (!user?.uid) return;

      try {
        // 1. NOTIFICATION: Check browser's ACTUAL permission first (source of truth)
        const browserNotifStatus = checkNotificationPermission();
        console.log('🔔 Browser notification permission:', browserNotifStatus);

        if (browserNotifStatus === 'granted') {
          // Browser says granted - turn on toggle
          setNotifications(true);
          setNotificationStatus('granted');
          hasRequestedNotification.current = true;
        } else if (browserNotifStatus === 'denied') {
          // Browser says denied - turn off toggle
          setNotifications(false);
          setNotificationStatus('denied');
          hasRequestedNotification.current = true;
        } else {
          // Browser says 'default' or 'unsupported' - check saved data for context
          const savedNotification = await getUserNotification(user.uid);
          if (savedNotification && savedNotification.status === 'granted') {
            // User previously granted but browser now says default
            // This means "Allow Once" expired - keep toggle off
            setNotifications(false);
            setNotificationStatus('default');
          } else {
            setNotifications(false);
            setNotificationStatus(browserNotifStatus);
          }
        }

        // 2. LOCATION: Check browser's ACTUAL permission first (source of truth)
        const browserLocStatus = await checkLocationPermission();
        console.log('📍 Browser location permission:', browserLocStatus);

        if (browserLocStatus === 'granted') {
          // Browser says granted - turn on toggle
          setLocation(true);
          setLocationStatus('granted');
          hasRequestedLocation.current = true;
        } else if (browserLocStatus === 'denied') {
          // Browser says denied - turn off toggle
          setLocation(false);
          setLocationStatus('denied');
          hasRequestedLocation.current = true;
        } else {
          // Browser says 'prompt' or null (Safari) - check saved data for context
          const savedLocation = await getUserLocation(user.uid);
          if (savedLocation && savedLocation.status === 'granted') {
            // User previously granted but browser now says prompt
            // This means "Allow Once" expired - keep toggle off
            setLocation(false);
            setLocationStatus('unknown');
          } else if (savedLocation && (savedLocation.status === 'denied' || savedLocation.status === 'unavailable')) {
            setLocation(false);
            setLocationStatus(savedLocation.status);
            hasRequestedLocation.current = true;
          } else {
            setLocation(false);
            setLocationStatus('unknown');
          }
        }

        // 3. CAMERA: Check browser's ACTUAL permission first (source of truth)
        try {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('📷 Browser camera permission:', cameraPermission.state);

          if (cameraPermission.state === 'granted') {
            setCamera(true);
            setCameraStatus('granted');
            hasRequestedCamera.current = true;
          } else if (cameraPermission.state === 'denied') {
            setCamera(false);
            setCameraStatus('denied');
            hasRequestedCamera.current = true;
          } else {
            // 'prompt' state - check saved data
            const savedCamera = await getUserCamera(user.uid);
            if (savedCamera && savedCamera.status === 'granted') {
              // Previously granted but now prompt - "Allow Once" expired
              setCamera(false);
              setCameraStatus('prompt');
            } else {
              setCamera(false);
              setCameraStatus('prompt');
            }
          }
        } catch {
          // Permissions API for camera not supported (Safari)
          // Fall back to saved data
          const savedCamera = await getUserCamera(user.uid);
          if (savedCamera) {
            setCameraStatus(savedCamera.status);
            if (savedCamera.status === 'granted') {
              setCamera(true);
              hasRequestedCamera.current = true;
            } else {
              setCamera(false);
              if (savedCamera.status === 'denied') {
                hasRequestedCamera.current = true;
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load settings status:', error);
      }
    };

    loadSavedSettings();
  }, [user?.uid]);

  // Handle notification toggle change
  const handleNotificationToggle = async () => {
    if (!user?.uid) return;

    const newValue = !notifications;
    setNotifications(newValue);

    if (newValue && !hasRequestedNotification.current) {
      // User turned ON notifications - request permission (only once)
      hasRequestedNotification.current = true;
      setIsRequestingNotification(true);

      try {
        const result = await requestNotificationPermission();
        console.log('🔔 Notification request result:', JSON.stringify(result, null, 2));

        // Build notification data for storage
        const notificationData: Omit<StoredNotification, 'userId' | 'action' | 'version'> = {
          status: result.status,
          deviceType: result.deviceType,
          browser: result.browser,
          timestamp: new Date().toISOString()
        };

        // Only add errorMessage if it exists
        if (result.errorMessage) {
          notificationData.errorMessage = result.errorMessage;
        }

        // Save to Firebase
        console.log('🔔 Saving to Firebase:', JSON.stringify(notificationData, null, 2));
        await updateUserNotification(user.uid, notificationData);
        console.log('🔔 Firebase save complete, setting status to:', result.status);
        setNotificationStatus(result.status);

        // If granted, start breaking news listener
        if (result.status === 'granted') {
          console.log('🔔 Starting breaking news listener from Settings');
          startBreakingNewsListener(user.uid);
        }

        // If denied or unsupported, turn toggle back off
        if (result.status === 'denied' || result.status === 'unsupported') {
          setNotifications(false);
        }
      } catch (error) {
        console.error('Notification request failed:', error);
        setNotificationStatus('default');

        // Save error state
        await updateUserNotification(user.uid, {
          status: 'default',
          deviceType: detectNotifDeviceType(),
          browser: detectNotifBrowser(),
          timestamp: new Date().toISOString(),
          errorMessage: 'Failed to request notification permission'
        });
      } finally {
        setIsRequestingNotification(false);
      }
    } else if (!newValue) {
      // User turned OFF notifications - clear stored notification and stop listener
      try {
        await clearUserNotification(user.uid);
        setNotificationStatus('default');
        // Stop breaking news listener
        console.log('🔕 Stopping breaking news listener from Settings');
        stopBreakingNewsListener();
        // Don't reset the flag - if permission was denied, it stays denied in browser
      } catch (error) {
        console.error('Failed to clear notification:', error);
      }
    }
  };

  // Handle location toggle change
  const handleLocationToggle = async () => {
    if (!user?.uid) return;

    const newValue = !location;
    setLocation(newValue);

    if (newValue && !hasRequestedLocation.current) {
      // User turned ON location - request permission (only once)
      hasRequestedLocation.current = true;
      setIsRequestingLocation(true);

      try {
        const result = await requestLocation();
        console.log('📍 Location request result:', JSON.stringify(result, null, 2));

        // Build location data for storage (exclude undefined values for Firestore)
        const locationData: Omit<StoredLocation, 'userId' | 'createdAt' | 'updatedAt'> = {
          status: result.status,
          deviceType: result.deviceType,
          browser: result.browser,
          timestamp: new Date().toISOString()
        };

        // Only add errorMessage if it exists (Firestore doesn't allow undefined)
        if (result.errorMessage) {
          locationData.errorMessage = result.errorMessage;
        }

        // Add coordinates if granted
        if (result.status === 'granted' && result.location) {
          locationData.latitude = result.location.latitude;
          locationData.longitude = result.location.longitude;
          locationData.accuracy = result.location.accuracy;
        }

        // Save to Firebase
        console.log('📍 Saving to Firebase:', JSON.stringify(locationData, null, 2));
        await updateUserLocation(user.uid, locationData);
        console.log('📍 Firebase save complete, setting status to:', result.status);
        setLocationStatus(result.status);

        // If denied or unavailable, turn toggle back off
        if (result.status === 'denied' || result.status === 'unavailable') {
          setLocation(false);
        }
      } catch (error) {
        console.error('Location request failed:', error);
        setLocationStatus('unknown');

        // Save error state
        await updateUserLocation(user.uid, {
          status: 'unknown',
          deviceType: detectDeviceType(),
          browser: detectBrowser(),
          timestamp: new Date().toISOString(),
          errorMessage: 'Failed to request location'
        });
      } finally {
        setIsRequestingLocation(false);
      }
    } else if (!newValue) {
      // User turned OFF location - clear stored location
      try {
        await clearUserLocation(user.uid);
        // Only reset the flag if permission was previously granted
        // If denied, browser remembers - no point resetting
        if (locationStatus === 'granted') {
          hasRequestedLocation.current = false;
        }
        setLocationStatus('unknown');
      } catch (error) {
        console.error('Failed to clear location:', error);
      }
    }
  };

  // Handle camera toggle change
  const handleCameraToggle = async () => {
    if (!user?.uid) return;

    const newValue = !camera;
    setCamera(newValue);

    if (newValue && !hasRequestedCamera.current) {
      // User turned ON camera - request permission (only once)
      hasRequestedCamera.current = true;
      setIsRequestingCamera(true);

      try {
        // Request camera permission
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop the stream immediately - we just wanted to trigger the permission
        stream.getTracks().forEach(track => track.stop());

        console.log('📷 Camera permission granted');

        // Build camera data for storage
        const cameraData: Omit<StoredCamera, 'userId' | 'action' | 'version'> = {
          status: 'granted',
          deviceType: detectDeviceType() as 'mobile' | 'tablet' | 'desktop',
          browser: detectBrowser(),
          timestamp: new Date().toISOString()
        };

        // Save to Firebase
        await updateUserCamera(user.uid, cameraData);
        setCameraStatus('granted');

      } catch (error: any) {
        console.error('Camera request failed:', error);

        // Determine status based on error
        const status: CameraStatus = error.name === 'NotAllowedError' ? 'denied' : 'unsupported';
        setCameraStatus(status);

        // Save denied state
        await updateUserCamera(user.uid, {
          status,
          deviceType: detectDeviceType() as 'mobile' | 'tablet' | 'desktop',
          browser: detectBrowser(),
          timestamp: new Date().toISOString(),
          errorMessage: error.message || 'Camera permission denied'
        });

        // Turn toggle back off
        setCamera(false);
      } finally {
        setIsRequestingCamera(false);
      }
    } else if (!newValue) {
      // User turned OFF camera - clear stored camera
      try {
        await clearUserCamera(user.uid);
        // Only reset the flag if permission was previously granted
        if (cameraStatus === 'granted') {
          hasRequestedCamera.current = false;
        }
        setCameraStatus('prompt');
      } catch (error) {
        console.error('Failed to clear camera:', error);
      }
    }
  };

  // Get camera status display text
  const getCameraSubText = (): string => {
    if (isRequestingCamera) {
      return t('settings', 'camera_pending');
    }
    if (cameraStatus === 'granted' && camera) {
      return t('settings', 'camera_enabled');
    }
    if (cameraStatus === 'denied') {
      return t('settings', 'camera_denied');
    }
    return t('settings', 'sub_camera');
  };

  // Track if any settings have been modified from defaults
  useEffect(() => {
    const isModified =
      language !== DEFAULT_SETTINGS.language ||
      notifications !== DEFAULT_SETTINGS.notifications ||
      location !== DEFAULT_SETTINGS.location ||
      camera !== DEFAULT_SETTINGS.camera ||
      strictMode !== DEFAULT_SETTINGS.strictMode ||
      demoMode !== DEFAULT_SETTINGS.demoMode;

    setSettingsModified(isModified);
  }, [language, notifications, location, camera, strictMode, demoMode]);

  // Get location status display text
  const getLocationSubText = (): string => {
    if (isRequestingLocation) {
      return getLocationStatusText('pending', language.toLowerCase());
    }
    if (locationStatus && location) {
      return getLocationStatusText(locationStatus, language.toLowerCase());
    }
    return t('settings', 'sub_loc');
  };

  // Get notification status display text
  const getNotificationSubText = (): string => {
    if (isRequestingNotification) {
      return getNotificationStatusText('pending', language.toLowerCase());
    }
    if (notificationStatus && notifications) {
      return getNotificationStatusText(notificationStatus, language.toLowerCase());
    }
    return t('settings', 'sub_notif');
  };

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in pb-20">
      <h2 className="font-pixel text-4xl text-center mb-8">{t('settings', 'title')}</h2>

      <PixelCard className="p-0 overflow-hidden">
        <div className="divide-y-2 divide-black">

            {/* Language Setting */}
            <div className="flex items-center justify-between p-6 bg-gray-50">
                <div className="flex items-center gap-3">
                    <Globe size={20} />
                    <div className="font-bold font-mono text-lg">{t('settings', 'language')}</div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-[60%]">
                    {Object.values(Language).map((lang) => (
                        <button
                            key={lang}
                            onClick={() => setLanguage(lang)}
                            className={`px-2 py-1 font-mono text-xs border-2 border-black transition-all mb-1 ${
                                language === lang ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-200'
                            }`}
                        >
                            {t('settings', `language_${lang.toLowerCase()}`)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Notification Toggle with Status */}
            <div
              className={`flex items-center justify-between p-6 hover:bg-gray-50 transition-colors cursor-pointer ${isRequestingNotification ? 'opacity-70' : ''}`}
              onClick={isRequestingNotification ? undefined : handleNotificationToggle}
            >
                <div className="flex items-center gap-3">
                    <Bell size={20} />
                    <div>
                        <div className="font-bold font-mono text-lg">{t('settings', 'notifications')}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {getNotificationSubText()}
                        </div>
                    </div>
                </div>
                <div className={`w-14 h-8 border-2 border-black relative transition-colors ${notifications ? 'bg-black' : 'bg-white'} ${isRequestingNotification ? 'animate-pulse' : ''}`}>
                    <div className={`absolute top-1 bottom-1 w-5 bg-current border border-black transition-all ${notifications ? 'left-7 bg-white' : 'left-1 bg-black'}`}></div>
                </div>
            </div>

            {/* Location Toggle with Status */}
            <div
              className={`flex items-center justify-between p-6 hover:bg-gray-50 transition-colors cursor-pointer ${isRequestingLocation ? 'opacity-70' : ''}`}
              onClick={isRequestingLocation ? undefined : handleLocationToggle}
            >
                <div className="flex items-center gap-3">
                    <MapPin size={20} />
                    <div>
                        <div className="font-bold font-mono text-lg">{t('settings', 'loc')}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {getLocationSubText()}
                        </div>
                    </div>
                </div>
                <div className={`w-14 h-8 border-2 border-black relative transition-colors ${location ? 'bg-black' : 'bg-white'} ${isRequestingLocation ? 'animate-pulse' : ''}`}>
                    <div className={`absolute top-1 bottom-1 w-5 bg-current border border-black transition-all ${location ? 'left-7 bg-white' : 'left-1 bg-black'}`}></div>
                </div>
            </div>

            {/* Camera Toggle with Status */}
            <div
              className={`flex items-center justify-between p-6 hover:bg-gray-50 transition-colors cursor-pointer ${isRequestingCamera ? 'opacity-70' : ''}`}
              onClick={isRequestingCamera ? undefined : handleCameraToggle}
            >
                <div className="flex items-center gap-3">
                    <Camera size={20} />
                    <div>
                        <div className="font-bold font-mono text-lg">{t('settings', 'camera')}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {getCameraSubText()}
                        </div>
                    </div>
                </div>
                <div className={`w-14 h-8 border-2 border-black relative transition-colors ${camera ? 'bg-black' : 'bg-white'} ${isRequestingCamera ? 'animate-pulse' : ''}`}>
                    <div className={`absolute top-1 bottom-1 w-5 bg-current border border-black transition-all ${camera ? 'left-7 bg-white' : 'left-1 bg-black'}`}></div>
                </div>
            </div>

            {/* AI Assistant Button Toggle */}
            <div
              className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => {
                const newValue = !showAIButton;
                setShowAIButton(newValue);
                localStorage.setItem('stanse_show_ai_button', String(newValue));
                // Trigger storage event for App.tsx to pick up the change
                window.dispatchEvent(new Event('storage'));
              }}
            >
                <div className="flex items-center gap-3">
                    <MessageSquare size={20} />
                    <div>
                        <div className="font-bold font-mono text-lg">{t('settings', 'ai_assistant_button')}</div>
                        <div className="font-mono text-xs text-gray-500">
                          {t('settings', 'sub_ai_assistant_button')}
                        </div>
                    </div>
                </div>
                <div className={`w-14 h-8 border-2 border-black relative transition-colors ${showAIButton ? 'bg-black' : 'bg-white'}`}>
                    <div className={`absolute top-1 bottom-1 w-5 bg-current border border-black transition-all ${showAIButton ? 'left-7 bg-white' : 'left-1 bg-black'}`}></div>
                </div>
            </div>

            <ToggleItem
                icon={<Shield size={20} />}
                label={t('settings', 'strict')}
                sub={t('settings', 'sub_strict')}
                checked={strictMode}
                onChange={() => setStrictMode(!strictMode)}
            />
            <ToggleItem
                icon={<Users size={20} />}
                label={t('settings', 'demo')}
                sub={t('settings', 'sub_demo')}
                checked={demoMode}
                onChange={() => setDemoMode(!demoMode)}
            />

            {/* Reset All Settings Button */}
            <div className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                    <RotateCcw size={20} />
                    <div>
                        <div className="font-bold font-mono text-lg">{t('settings', 'reset_all_settings')}</div>
                        <div className="font-mono text-xs text-gray-500">{t('settings', 'reset_all_desc')}</div>
                    </div>
                </div>
                <button
                    onClick={async () => {
                        if (!settingsModified && !hasCompletedOnboarding) return;
                        if (!user) return;
                        if (confirm('Are you sure you want to reset ALL Stanse settings? This will reset language to English, disable notifications, disable location, disable strict mode, enable demo mode, clear social media connections, and reset your stance. You will need to retake the questionnaire.')) {
                            setIsResetting(true);
                            try {
                                // Reset all settings to defaults
                                setLanguage(DEFAULT_SETTINGS.language);
                                setNotifications(DEFAULT_SETTINGS.notifications);
                                setLocation(DEFAULT_SETTINGS.location);
                                setCamera(DEFAULT_SETTINGS.camera);
                                setStrictMode(DEFAULT_SETTINGS.strictMode);
                                setDemoMode(DEFAULT_SETTINGS.demoMode);

                                // Clear location data
                                await clearUserLocation(user.uid);
                                setLocationStatus(null);
                                hasRequestedLocation.current = false;

                                // Clear notification data
                                await clearUserNotification(user.uid);
                                setNotificationStatus(null);
                                hasRequestedNotification.current = false;

                                // Clear camera data
                                await clearUserCamera(user.uid);
                                setCameraStatus(null);
                                hasRequestedCamera.current = false;

                                // Clear social media connections from Firebase
                                await disconnectAllSocialMedia(user.uid);

                                // Reset stance/onboarding
                                await resetOnboarding();

                                alert('All Stanse settings reset! Language set to English, notifications disabled, location disabled, camera disabled, strict mode disabled, demo mode enabled, social media disconnected. Go to Stance tab to recalibrate.');
                            } catch (error) {
                                console.error('Reset error:', error);
                                alert('Failed to reset settings. Please try again.');
                            } finally {
                                setIsResetting(false);
                            }
                        }
                    }}
                    disabled={!settingsModified && !hasCompletedOnboarding || isResetting}
                    className={`px-4 py-2 font-mono text-xs border-2 border-black transition-all ${
                        (settingsModified || hasCompletedOnboarding) && !isResetting
                            ? 'bg-black text-white hover:bg-gray-800'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    {isResetting ? 'RESETTING...' : 'RESET'}
                </button>
            </div>
        </div>
      </PixelCard>

      <div className="text-center pt-8">
        <button className="font-mono text-xs text-red-500 hover:underline uppercase tracking-widest">
            {t('settings', 'delete')}
        </button>
      </div>
    </div>
  );
};

const ToggleItem: React.FC<{ icon: React.ReactNode, label: string, sub: string, checked: boolean, onChange: () => void }> = ({ icon, label, sub, checked, onChange }) => (
    <div className="flex items-center justify-between p-6 hover:bg-gray-50 transition-colors cursor-pointer" onClick={onChange}>
        <div className="flex items-center gap-3">
            {icon}
            <div>
                <div className="font-bold font-mono text-lg">{label}</div>
                <div className="font-mono text-xs text-gray-500">{sub}</div>
            </div>
        </div>
        <div className={`w-14 h-8 border-2 border-black relative transition-colors ${checked ? 'bg-black' : 'bg-white'}`}>
            <div className={`absolute top-1 bottom-1 w-5 bg-current border border-black transition-all ${checked ? 'left-7 bg-white' : 'left-1 bg-black'}`}></div>
        </div>
    </div>
);
