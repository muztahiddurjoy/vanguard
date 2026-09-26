import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { SosGestureModuleEvents, SosResult, SosStatus } from './SosGesture.types';

declare class SosGestureModule extends NativeModule<SosGestureModuleEvents> {
  getStatus(): SosStatus;
  start(): Promise<SosStatus>;
  stop(): Promise<SosStatus>;
  callNow(): Promise<SosResult>;
  openAccessibilitySettings(): void;
  openAppSettings(): void;
}

/** Null where the native module is missing: iOS, the web, or a build without it. */
export default requireOptionalNativeModule<SosGestureModule>('SosGesture');
