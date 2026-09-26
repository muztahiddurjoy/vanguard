/**
 * The app's building blocks. Large type and tap targets: many people using the
 * app read with difficulty or use an old phone.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH, Radius, Spacing, Type, type Theme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const theme = useTheme();
  return (
    <MaterialCommunityIcons
      name={name}
      size={size}
      color={color ?? theme.text}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'danger' | 'warning' | 'inverse';

function toneColor(tone: Tone, theme: Theme): string {
  switch (tone) {
    case 'secondary':
      return theme.textSecondary;
    case 'muted':
      return theme.textMuted;
    case 'primary':
      return theme.primary;
    case 'danger':
      return theme.danger;
    case 'warning':
      return theme.warning;
    case 'inverse':
      return theme.primaryText;
    default:
      return theme.text;
  }
}

/**
 * Android measures some Bangla words (vowel signs, conjuncts) a few pixels
 * narrower than it lays them out, so a label sized to fit its words wraps its
 * last word out of sight ("আইনজীবী নিযুক্ত" showed as "আইনজীবী", "শুনুন" as
 * "শুনু"). A trailing space is measured, but may hang past the edge when the
 * line is laid out, which absorbs the difference.
 */
function AppText({ children, ...props }: TextProps) {
  const padded = typeof children === 'string' && Platform.OS === 'android' ? `${children} ` : children;
  return (
    <Text textBreakStrategy="simple" {...props}>
      {padded}
    </Text>
  );
}

export function Txt({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps & { variant?: keyof typeof Type; tone?: Tone }) {
  const theme = useTheme();
  return <AppText style={[Type[variant] as TextStyle, { color: toneColor(tone, theme) }, style]} {...rest} />;
}

/** A scrolling screen with the app's background and padding. */
export function Screen({
  children,
  refreshControl,
  padTop = false,
  contentStyle,
}: {
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Tab screens have no header, so they keep clear of the status bar themselves. */
  padTop?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: (padTop ? insets.top : 0) + Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  onPress,
  style,
  tone = 'default',
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'primary' | 'danger' | 'warning' | 'info';
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const toned: Record<string, ViewStyle> = {
    default: { backgroundColor: theme.card, borderColor: theme.border },
    primary: { backgroundColor: theme.primarySoft, borderColor: theme.primary },
    danger: { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
    warning: { backgroundColor: theme.warningSoft, borderColor: theme.warning },
    info: { backgroundColor: theme.infoSoft, borderColor: theme.info },
  };
  const cardStyle = [styles.card, toned[tone], style];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [cardStyle, pressed && { opacity: 0.75 }]}>
      {children}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  big = false,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.primary, fg: theme.primaryText, border: theme.primary },
    danger: { bg: theme.danger, fg: theme.dangerText, border: theme.danger },
    secondary: { bg: theme.card, fg: theme.primary, border: theme.primary },
    ghost: { bg: 'transparent', fg: theme.primary, border: 'transparent' },
  };
  const c = colors[variant];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      // Named explicitly: after a loading state, Android otherwise reads it as "busy".
      accessibilityLabel={title}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        { backgroundColor: c.bg, borderColor: c.border },
        (pressed || off) && { opacity: off ? 0.5 : 0.8 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        icon && <MaterialCommunityIcons name={icon} size={big ? 26 : 20} color={c.fg} importantForAccessibility="no" />
      )}
      <AppText style={[big ? Type.heading : Type.bodyStrong, { color: c.fg, textAlign: 'center' }]}>
        {title}
      </AppText>
    </Pressable>
  );
}

export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; hint?: string; error?: string | null; optionalLabel?: string }
>(function Field({ label, hint, error, optionalLabel, style, multiline, ...rest }, ref) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Txt variant="smallStrong">
        {label}
        {optionalLabel ? <Txt variant="small" tone="muted">{`  (${optionalLabel})`}</Txt> : null}
      </Txt>
      <TextInput
        ref={ref}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        accessibilityLabel={label}
        style={[
          styles.input,
          Type.body as TextStyle,
          {
            color: theme.text,
            backgroundColor: theme.card,
            borderColor: error ? theme.danger : theme.border,
          },
          multiline && styles.inputMultiline,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Txt variant="small" tone="danger">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="small" tone="muted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.card,
          borderColor: selected ? theme.primary : theme.border,
        },
        pressed && { opacity: 0.8 },
      ]}>
      {selected ? (
        <MaterialCommunityIcons name="check" size={16} color={theme.primaryText} importantForAccessibility="no" />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={16} color={theme.textSecondary} importantForAccessibility="no" />
      ) : null}
      <AppText style={[Type.small as TextStyle, { color: selected ? theme.primaryText : theme.text }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Badge({
  label,
  tone = 'primary',
}: {
  label: string;
  tone?: 'primary' | 'danger' | 'warning' | 'info' | 'muted';
}) {
  const theme = useTheme();
  const palette = {
    primary: [theme.primarySoft, theme.primarySoftText],
    danger: [theme.dangerSoft, theme.dangerSoftText],
    warning: [theme.warningSoft, theme.warningSoftText],
    info: [theme.infoSoft, theme.infoSoftText],
    muted: [theme.cardAlt, theme.textSecondary],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette[0] }]}>
      <AppText style={[Type.smallStrong as TextStyle, { color: palette[1] }]}>{label}</AppText>
    </View>
  );
}

export function Notice({
  children,
  tone = 'info',
  icon,
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'primary';
  icon?: IconName;
}) {
  const theme = useTheme();
  const palette = {
    info: [theme.infoSoft, theme.infoSoftText, 'information-outline'],
    warning: [theme.warningSoft, theme.warningSoftText, 'alert-outline'],
    danger: [theme.dangerSoft, theme.dangerSoftText, 'alert-octagon-outline'],
    primary: [theme.primarySoft, theme.primarySoftText, 'check-circle-outline'],
  }[tone] as [string, string, IconName];
  return (
    <View style={[styles.notice, { backgroundColor: palette[0] }]} accessibilityRole="alert">
      <MaterialCommunityIcons name={icon ?? palette[2]} size={20} color={palette[1]} importantForAccessibility="no" />
      <AppText style={[Type.small as TextStyle, { color: palette[1], flex: 1 }]}>{children}</AppText>
    </View>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Txt variant="heading" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </Txt>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Row({
  children,
  gap = Spacing.md,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** A tappable line: icon, title, optional subtitle, chevron. */
export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const theme = useTheme();
  const body = (
    <>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: theme.cardAlt }]}>
          <MaterialCommunityIcons name={icon} size={22} color={iconColor ?? theme.primary} importantForAccessibility="no" />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="small" tone="secondary">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textMuted} importantForAccessibility="no" />
        ) : null)}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  buttonBig: { minHeight: 64, borderRadius: Radius.lg },
  field: { gap: Spacing.xs },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  inputMultiline: { minHeight: 140, textAlignVertical: 'top' },
  chip: {
    minHeight: 40,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
  },
  notice: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  listRow: {
    minHeight: MIN_TOUCH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
