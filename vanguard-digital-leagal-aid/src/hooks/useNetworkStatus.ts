import { useEffect, useState } from 'react';
import { getSimulatedOffline, setSimulatedOffline } from '../utils/storage';

export function useNetworkStatus() {
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOfflineState] = useState<boolean>(getSimulatedOffline());

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    const handleSimChange = () => setSimulatedOfflineState(getSimulatedOffline());

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('legal_aid_network_toggled', handleSimChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('legal_aid_network_toggled', handleSimChange);
    };
  }, []);

  const toggleSimulatedNetwork = (offline: boolean) => {
    setSimulatedOffline(offline);
    setSimulatedOfflineState(offline);
  };

  const isActuallyOnline = browserOnline && !simulatedOffline;

  return {
    isOnline: isActuallyOnline,
    browserOnline,
    simulatedOffline,
    toggleSimulatedNetwork,
  };
}
