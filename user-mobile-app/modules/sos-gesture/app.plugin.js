/**
 * Writes the SOS number from app.json into the Android manifest, where the SOS
 * services read it: they run without the app (after a restart, from the
 * notification), so they cannot ask JavaScript for it.
 *
 *   ["./modules/sos-gesture/app.plugin.js", { "number": "+19788458907" }]
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const NUMBER_META_DATA = 'expo.modules.sosgesture.NUMBER';

module.exports = function withSosGesture(config, props = {}) {
  const number = String(props.number ?? '').trim();
  if (!/^\+?\d{3,15}$/.test(number)) {
    throw new Error(
      `sos-gesture: "number" must be a phone number such as "+19788458907" (got "${props.number}")`
    );
  }
  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, NUMBER_META_DATA, number);
    return mod;
  });
};
