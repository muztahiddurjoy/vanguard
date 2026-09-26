import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Divider, Icon, Notice, Row, Screen, Section, Txt } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useSos, type PermissionOutcome } from '@/hooks/use-sos';
import { useTheme } from '@/hooks/use-theme';
import { ago, useI18n } from '@/i18n';

export default function SosScreen() {
  const i18n = useI18n();
  const { t, f } = i18n;
  const theme = useTheme();
  const sos = useSos();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  if (!sos.available || !sos.status) {
    return (
      <Screen padTop>
        <Txt variant="title">{t.sos.title}</Txt>
        <Notice tone="warning">{t.sos.unavailable}</Notice>
      </Screen>
    );
  }

  const s = sos.status;
  const on = s.enabled && s.serviceRunning;
  const number = f.digits(s.number);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const ask = (request: () => Promise<PermissionOutcome>) => async () => {
    const outcome = await request();
    setBlocked(outcome === 'blocked');
    if (outcome === 'blocked') sos.openAppSettings();
  };

  return (
    <Screen padTop>
      <Txt variant="title">{t.sos.title}</Txt>

      <Card tone={on ? 'primary' : 'danger'}>
        <View style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm }}>
          <View style={[styles.shield, { backgroundColor: on ? theme.primary : theme.danger }]}>
            <Icon name={on ? 'shield-check' : 'shield-off-outline'} size={44} color={theme.primaryText} />
          </View>
          <Txt variant="title" testID="sos-state">
            {on ? t.sos.on : t.sos.off}
          </Txt>
          <Txt style={{ textAlign: 'center', color: on ? theme.primarySoftText : theme.dangerSoftText }}>
            {t.sos.explain(number)}
          </Txt>
        </View>
        <VolumeKeys />
        <Button
          testID="sos-toggle"
          title={s.enabled ? t.sos.turnOff : t.sos.turnOn}
          icon={s.enabled ? 'power' : 'shield-check-outline'}
          variant={s.enabled ? 'secondary' : 'primary'}
          big
          loading={busy}
          onPress={() => run(s.enabled ? sos.turnOff : sos.turnOn)}
        />
      </Card>

      <Section title={t.sos.needs}>
        <Card>
          <Requirement
            ok={s.callPermission}
            title={t.sos.callPermission}
            hint={t.sos.callPermissionHint}
            action={t.sos.allow}
            onPress={ask(sos.requestCall)}
          />
          <Divider />
          <Requirement
            ok={s.accessibilityEnabled}
            title={t.sos.shortcut}
            hint={t.sos.shortcutHint}
            action={t.sos.openSettings}
            onPress={sos.openShortcutSettings}
          />
          <Divider />
          <Requirement
            ok={s.notificationPermission}
            title={t.sos.notifications}
            hint={t.sos.notificationsHint}
            action={t.sos.allow}
            onPress={ask(sos.requestNotifications)}
          />
          <Divider />
          <Requirement
            ok={s.enabled && s.serviceRunning}
            title={t.sos.service}
            hint={t.sos.serviceHint}
            action={t.sos.turnOn}
            onPress={() => run(sos.turnOn)}
          />
        </Card>
        {blocked && <Notice tone="warning">{t.sos.blocked}</Notice>}
      </Section>

      <Button
        testID="sos-call-now"
        title={t.sos.callNow(number)}
        icon="phone-alert"
        variant="danger"
        big
        onPress={() => void sos.callNow()}
      />
      {sos.lastResult && (
        <Notice tone={sos.lastResult === 'called' ? 'primary' : 'warning'}>{t.sos.result[sos.lastResult]}</Notice>
      )}
      {s.lastTrigger && (
        <Txt variant="small" tone="muted" testID="sos-last">
          {t.sos.lastUsed(
            ago(new Date(s.lastTrigger.at).toISOString(), i18n),
            t.sos.source[s.lastTrigger.source] ?? t.sos.source.unknown
          )}
        </Txt>
      )}
      <Txt variant="small" tone="muted">
        {t.sos.testNote}
      </Txt>
    </Screen>
  );
}

/** Two volume keys, pressed together: the gesture, drawn. */
function VolumeKeys() {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'center', paddingVertical: Spacing.sm }} gap={Spacing.lg}>
      {(['volume-plus', 'volume-minus'] as const).map((name) => (
        <View key={name} style={[styles.key, { borderColor: theme.text, backgroundColor: theme.card }]}>
          <Icon name={name} size={28} />
        </View>
      ))}
    </Row>
  );
}

function Requirement({
  ok,
  title,
  hint,
  action,
  onPress,
}: {
  ok: boolean;
  title: string;
  hint: string;
  action: string;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.sm, paddingVertical: Spacing.sm }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Icon
          name={ok ? 'check-circle' : 'alert-circle-outline'}
          color={ok ? theme.primary : theme.warning}
          size={26}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="small" tone="secondary">
            {hint}
          </Txt>
        </View>
        <Badge label={ok ? t.sos.ready : t.sos.needed} tone={ok ? 'primary' : 'warning'} />
      </Row>
      {!ok && <Button title={action} variant="secondary" onPress={onPress} />}
    </View>
  );
}

const styles = StyleSheet.create({
  shield: { width: 80, height: 80, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  key: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
