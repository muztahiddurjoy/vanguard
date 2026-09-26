/**
 * Colors, spacing and type for the app, in light and dark. Green for the legal
 * aid office, red kept for SOS and danger.
 */

export const Colors = {
  light: {
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#64748b',
    background: '#f4f6f8',
    card: '#ffffff',
    cardAlt: '#eef2f5',
    border: '#dde3ea',
    primary: '#047857',
    primaryText: '#ffffff',
    primarySoft: '#d1fae5',
    primarySoftText: '#065f46',
    danger: '#dc2626',
    dangerText: '#ffffff',
    dangerSoft: '#fee2e2',
    dangerSoftText: '#991b1b',
    warning: '#b45309',
    warningSoft: '#fef3c7',
    warningSoftText: '#92400e',
    info: '#1d4ed8',
    infoSoft: '#dbeafe',
    infoSoftText: '#1e40af',
    tabBar: '#ffffff',
  },
  dark: {
    text: '#f1f5f9',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    background: '#0b1015',
    card: '#151c24',
    cardAlt: '#1c252f',
    border: '#27313d',
    primary: '#34d399',
    primaryText: '#04241a',
    primarySoft: '#0f3a2d',
    primarySoftText: '#a7f3d0',
    danger: '#f87171',
    dangerText: '#2a0606',
    dangerSoft: '#3b1215',
    dangerSoftText: '#fecaca',
    warning: '#fbbf24',
    warningSoft: '#3a2a0a',
    warningSoftText: '#fde68a',
    info: '#60a5fa',
    infoSoft: '#11264a',
    infoSoftText: '#bfdbfe',
    tabBar: '#11171e',
  },
} as const;

export type Theme = { [K in keyof typeof Colors.light]: string };

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/**
 * Noto Sans Bengali, bundled as one file per weight, so Bangla and Latin share a
 * typeface and bold is real bold (Android's variable system font is drawn
 * bolder than it is measured). It is the design Android phones already use for
 * Bangla, with the usual digit shapes.
 */
export const Fonts = {
  regular: 'NotoSansBengali_400Regular',
  semibold: 'NotoSansBengali_600SemiBold',
  bold: 'NotoSansBengali_700Bold',
} as const;

/** Big enough for people who find small print and small buttons hard. */
export const Type = {
  title: { fontSize: 26, lineHeight: 36, fontFamily: Fonts.bold },
  heading: { fontSize: 19, lineHeight: 28, fontFamily: Fonts.bold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: Fonts.regular },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: Fonts.semibold },
  small: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.regular },
  smallStrong: { fontSize: 14, lineHeight: 21, fontFamily: Fonts.semibold },
  number: { fontSize: 32, lineHeight: 42, fontFamily: Fonts.bold, letterSpacing: 2 },
} as const;

/** Tap targets are at least this tall. */
export const MIN_TOUCH = 48;
