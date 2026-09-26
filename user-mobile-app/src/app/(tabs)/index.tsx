import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CaseCard } from '@/components/case-bits';
import { Button, Card, Icon, Notice, Row, Screen, Section, Txt, type IconName } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useSos } from '@/hooks/use-sos';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { HOTLINE } from '@/lib/config';
import { dial } from '@/lib/phone';
import { useCases } from '@/state/cases';

export default function HomeScreen() {
  const { t, f, lang, setLang } = useI18n();
  const theme = useTheme();
  const { cases, pending, sendPending } = useCases();

  return (
    <Screen padTop>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="title">{t.appName}</Txt>
          <Txt variant="small" tone="secondary">
            {t.tagline}
          </Txt>
        </View>
        <Row gap={Spacing.xs}>
          <Pressable
            onPress={() => setLang(lang === 'bn' ? 'en' : 'bn')}
            accessibilityRole="button"
            testID="language-toggle"
            style={[styles.langButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Icon name="translate" size={18} />
            <Txt variant="smallStrong">{t.otherLanguage}</Txt>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t.home.settings}
            style={styles.iconButton}>
            <Icon name="cog-outline" size={24} />
          </Pressable>
        </Row>
      </Row>

      <SosBanner />

      <Txt variant="heading">{t.home.greeting}</Txt>
      <View style={styles.grid}>
        <Action
          icon="file-document-edit-outline"
          title={t.home.fileCase}
          hint={t.home.fileCaseHint}
          onPress={() => router.push('/file')}
          testID="action-file"
        />
        <Action
          icon="magnify"
          title={t.home.trackCase}
          hint={t.home.trackCaseHint}
          onPress={() => router.push('/track')}
          testID="action-track"
        />
        <Action
          icon="phone-in-talk-outline"
          title={t.home.hotline}
          hint={t.home.hotlineHint(f.digits(HOTLINE))}
          onPress={() => dial(HOTLINE)}
        />
        <Action
          icon="chat-question-outline"
          title={t.home.helpline}
          hint={t.home.helplineHint}
          onPress={() => router.push('/chat')}
        />
      </View>

      {pending.length > 0 && (
        <Card tone="warning">
          <Row>
            <Icon name="cloud-upload-outline" color={theme.warningSoftText} />
            <Txt variant="bodyStrong" style={{ flex: 1, color: theme.warningSoftText }}>
              {t.home.pending(pending.length, f.num(pending.length))}
            </Txt>
          </Row>
          <Button title={t.home.sendNow} variant="secondary" onPress={() => void sendPending()} />
        </Card>
      )}

      <Section
        title={t.home.yourCases}
        action={
          cases.length > 0 ? (
            <Button title={t.home.seeAll} variant="ghost" onPress={() => router.push('/cases')} />
          ) : undefined
        }>
        {cases.length === 0 ? (
          <Txt tone="secondary">{t.home.noCases}</Txt>
        ) : (
          cases
            .slice(0, 3)
            .map((c) => (
              <CaseCard
                key={c.token}
                c={c}
                onPress={() => router.push({ pathname: '/case/[token]', params: { token: c.token } })}
              />
            ))
        )}
      </Section>

      <Notice tone="primary" icon="hand-coin-outline">
        {t.home.freeNote}
      </Notice>
    </Screen>
  );
}

function Action({
  icon,
  title,
  hint,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  hint: string;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && { opacity: 0.75 },
      ]}>
      <View style={[styles.actionIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={28} color={theme.primary} />
      </View>
      <Txt variant="bodyStrong">{title}</Txt>
      <Txt variant="small" tone="secondary">
        {hint}
      </Txt>
    </Pressable>
  );
}

function SosBanner() {
  const { t } = useI18n();
  const theme = useTheme();
  const sos = useSos();
  if (!sos.available || !sos.status) return null;
  const on = sos.status.enabled && sos.status.serviceRunning;
  const tone = sos.needsSetup ? 'warning' : on ? 'primary' : 'danger';
  const color =
    tone === 'primary' ? theme.primarySoftText : tone === 'warning' ? theme.warningSoftText : theme.dangerSoftText;
  return (
    <Card tone={tone} onPress={() => router.push('/sos')} accessibilityLabel={on ? t.sosBanner.on : t.sosBanner.off}>
      <Row>
        <Icon name={on ? 'shield-check' : 'shield-alert-outline'} size={32} color={color} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" style={{ color }}>
            {sos.needsSetup ? t.sosBanner.needsSetup : on ? t.sosBanner.on : t.sosBanner.off}
          </Txt>
          <Txt variant="small" style={{ color }}>
            {on ? t.sosBanner.onHint : t.sosBanner.offHint}
          </Txt>
        </View>
        {!on && <Txt variant="smallStrong" style={{ color }}>{t.sosBanner.setUp}</Txt>}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  langButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  action: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
});
