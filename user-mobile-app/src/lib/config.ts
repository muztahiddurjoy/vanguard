import Constants from 'expo-constants';
import { Platform } from 'react-native';

type Extra = { hotline?: string; emergency?: string };

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** The national legal aid hotline, free from any phone. */
export const HOTLINE = extra.hotline ?? '16430';

/** The national emergency number (police, fire, ambulance). */
export const EMERGENCY = extra.emergency ?? '999';

/**
 * Where the DLAS backend is, unless the person set another address in Settings.
 * EXPO_PUBLIC_API_URL is read when the app is bundled; without it, an Android
 * emulator reaches the backend on the computer it runs on at 10.0.2.2.
 */
export const DEFAULT_API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000')
).replace(/\/+$/, '');

/** The backend's API_TOKEN, if it has one. */
export const DEFAULT_API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? '';
