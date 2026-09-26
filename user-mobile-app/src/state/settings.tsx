import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Connection } from '@/lib/api';
import { DEFAULT_API_TOKEN, DEFAULT_API_URL } from '@/lib/config';
import { KEYS, loadJson, saveJson } from '@/lib/storage';
import type { Lang } from '@/lib/types';

export type Settings = {
  lang: Lang;
  /** Empty means the build's default (DEFAULT_API_URL). */
  apiUrl: string;
  apiToken: string;
};

const DEFAULTS: Settings = { lang: 'bn', apiUrl: '', apiToken: '' };

type SettingsValue = {
  ready: boolean;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** Where to reach the backend, with the defaults filled in. */
  connection: Connection;
};

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadJson<Partial<Settings>>(KEYS.settings, {}).then((saved) => {
      setSettings({ ...DEFAULTS, ...saved });
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveJson(KEYS.settings, next);
      return next;
    });
  }, []);

  const value = useMemo<SettingsValue>(
    () => ({
      ready,
      settings,
      update,
      connection: {
        url: settings.apiUrl.trim() || DEFAULT_API_URL,
        token: settings.apiToken.trim() || DEFAULT_API_TOKEN || undefined,
      },
    }),
    [ready, settings, update]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
