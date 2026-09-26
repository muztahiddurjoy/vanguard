import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import SosGesture, { type SosResult, type SosStatus } from '../../modules/sos-gesture';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

async function requestPermission(permission: string): Promise<PermissionOutcome> {
  const result = await PermissionsAndroid.request(
    permission as (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]
  );
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

/**
 * The volume-button SOS: its state, and what turning it on takes. The state is
 * read again whenever the app comes back to the front (the person may have been
 * to the accessibility settings) and whenever SOS fires.
 */
export function useSos() {
  const [status, setStatus] = useState<SosStatus | null>(() => SosGesture?.getStatus() ?? null);
  const [lastResult, setLastResult] = useState<SosResult | null>(null);

  const reload = useCallback(() => {
    if (SosGesture) setStatus(SosGesture.getStatus());
  }, []);

  useEffect(() => {
    if (!SosGesture) return;
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    const trigger = SosGesture.addListener('onTrigger', (event) => {
      setLastResult(event.result);
      reload();
    });
    return () => {
      app.remove();
      trigger.remove();
    };
  }, [reload]);

  const requestCall = useCallback(async () => {
    const outcome = await requestPermission(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
    reload();
    return outcome;
  }, [reload]);

  const requestNotifications = useCallback(async () => {
    // Before Android 13 notifications need no permission.
    if (Platform.OS !== 'android' || Platform.Version < 33) return 'granted' as const;
    const outcome = await requestPermission(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    reload();
    return outcome;
  }, [reload]);

  /** Asks for what SOS needs, then starts the foreground service. */
  const turnOn = useCallback(async () => {
    if (!SosGesture) return;
    const current = SosGesture.getStatus();
    if (!current.callPermission) await requestCall();
    if (!current.notificationPermission) await requestNotifications();
    setStatus(await SosGesture.start());
  }, [requestCall, requestNotifications]);

  const turnOff = useCallback(async () => {
    if (!SosGesture) return;
    setStatus(await SosGesture.stop());
  }, []);

  const callNow = useCallback(async () => {
    if (!SosGesture) return null;
    const result = await SosGesture.callNow();
    setLastResult(result);
    reload();
    return result;
  }, [reload]);

  const openShortcutSettings = useCallback(() => SosGesture?.openAccessibilitySettings(), []);
  const openAppSettings = useCallback(() => SosGesture?.openAppSettings(), []);

  const needsSetup =
    !!status?.enabled && !(status.callPermission && status.accessibilityEnabled && status.serviceRunning);

  return {
    available: SosGesture !== null,
    status,
    lastResult,
    needsSetup,
    reload,
    turnOn,
    turnOff,
    callNow,
    requestCall,
    requestNotifications,
    openShortcutSettings,
    openAppSettings,
  };
}
