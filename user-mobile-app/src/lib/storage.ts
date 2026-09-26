import AsyncStorage from '@react-native-async-storage/async-storage';

/** Everything the app keeps is on this phone only, under these keys. */
export const KEYS = {
  settings: 'legalaid.settings.v1',
  cases: 'legalaid.cases.v1',
  pending: 'legalaid.pending.v1',
  draft: 'legalaid.draft.v1',
} as const;

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function remove(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
