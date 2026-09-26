import { INITIAL_CASES } from '../data/mockCases';
import { LegalCase } from '../types';

const STORAGE_KEY_CASES = 'legal_aid_cases_v1';
const STORAGE_KEY_OFFLINE_QUEUE = 'legal_aid_offline_queue_v1';
const STORAGE_KEY_SIMULATED_OFFLINE = 'legal_aid_simulated_offline';

export function getStoredCases(): LegalCase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CASES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(INITIAL_CASES));
      return INITIAL_CASES;
    }
    const parsed: LegalCase[] = JSON.parse(raw);
    // Ensure all seed cases exist (like case-malek or case-marzina-1)
    const existingIds = new Set(parsed.map((c) => c.id));
    let hasNewSeed = false;
    for (const seed of INITIAL_CASES) {
      if (!existingIds.has(seed.id)) {
        parsed.push(seed);
        hasNewSeed = true;
      }
    }
    if (hasNewSeed) {
      localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(parsed));
    }
    return parsed;
  } catch (e) {
    console.error('Error reading cases from localStorage', e);
    return INITIAL_CASES;
  }
}

export function saveCases(cases: LegalCase[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(cases));
    window.dispatchEvent(new Event('legal_aid_cases_updated'));
  } catch (e) {
    console.error('Error saving cases to localStorage', e);
  }
}

export function getOfflineQueue(): LegalCase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OFFLINE_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading offline queue', e);
    return [];
  }
}

export function addToOfflineQueue(newCase: LegalCase): { queueLength: number } {
  const currentQueue = getOfflineQueue();
  const updatedQueue = [newCase, ...currentQueue];
  localStorage.setItem(STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify(updatedQueue));
  window.dispatchEvent(new Event('legal_aid_queue_updated'));
  return { queueLength: updatedQueue.length };
}

export function clearOfflineQueue() {
  localStorage.setItem(STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify([]));
  window.dispatchEvent(new Event('legal_aid_queue_updated'));
}

export function getSimulatedOffline(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_SIMULATED_OFFLINE) === 'true';
  } catch {
    return false;
  }
}

export function setSimulatedOffline(offline: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY_SIMULATED_OFFLINE, offline ? 'true' : 'false');
    window.dispatchEvent(new Event('legal_aid_network_toggled'));
  } catch (e) {
    console.error('Error setting offline mode', e);
  }
}

/**
 * Sync all queued offline items to main cases
 */
export async function syncOfflineQueueToMain(delayMs = 800): Promise<{ syncedCount: number }> {
  // simulate brief network transfer
  if (delayMs > 0) {
    await new Promise((res) => setTimeout(res, delayMs));
  }
  const queue = getOfflineQueue();
  if (queue.length === 0) return { syncedCount: 0 };

  const currentCases = getStoredCases();
  // mark status as new and update timeAgo
  const markedCases = queue.map((c) => ({
    ...c,
    timeAgo: 'এইমাত্র সিঙ্ক হয়েছে (UDC Offline Sync)',
    status: 'new' as const,
  }));

  const merged = [...markedCases, ...currentCases];
  saveCases(merged);
  clearOfflineQueue();
  return { syncedCount: queue.length };
}

export function resetDemoData() {
  localStorage.setItem(STORAGE_KEY_CASES, JSON.stringify(INITIAL_CASES));
  localStorage.setItem(STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify([]));
  localStorage.setItem(STORAGE_KEY_SIMULATED_OFFLINE, 'false');
  window.dispatchEvent(new Event('legal_aid_cases_updated'));
  window.dispatchEvent(new Event('legal_aid_queue_updated'));
  window.dispatchEvent(new Event('legal_aid_network_toggled'));
}
