/** Where the SOS came from. */
export type SosSource =
  | 'volumeButtons'
  | 'volumeButtonsScreenOff'
  | 'notification'
  | 'app'
  | 'unknown';

/**
 * What happened: the call was placed; the dialer opened with the number filled in
 * (no phone permission); no number was configured; or it failed.
 */
export type SosResult = 'called' | 'dialer' | 'noNumber' | 'failed';

export type SosTrigger = {
  /** Milliseconds since the epoch. */
  at: number;
  source: SosSource;
  result: SosResult;
};

export type SosStatus = {
  /** The person turned SOS on (it stays on across restarts). */
  enabled: boolean;
  /** The foreground service is running, with its notification showing. */
  serviceRunning: boolean;
  /** The volume-button shortcut is switched on in the system's accessibility settings. */
  accessibilityEnabled: boolean;
  callPermission: boolean;
  notificationPermission: boolean;
  /** The number SOS calls, from app.json. */
  number: string;
  lastTrigger: SosTrigger | null;
};

export type SosGestureModuleEvents = {
  onTrigger: (trigger: SosTrigger) => void;
};
