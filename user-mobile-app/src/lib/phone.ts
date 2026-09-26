import { Linking } from 'react-native';

/** Opens the dialer with the number filled in (the person taps Call). */
export function dial(number: string): void {
  void Linking.openURL(`tel:${number.replace(/[^\d+]/g, '')}`);
}
