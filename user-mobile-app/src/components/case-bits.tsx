/** Pieces that show a case: its stage badge, its card in a list, and its progress steps. */

import { StyleSheet, View } from 'react-native';

import { Badge, Card, Icon, Row, Txt } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ago, relativeDays, useI18n } from '@/i18n';
import type { SavedCase } from '@/lib/cases';
import { nextDate, progressSteps } from '@/lib/progress';
import type { Stage, Track } from '@/lib/types';

const STAGE_TONE: Record<Stage, 'info' | 'primary' | 'warning' | 'muted'> = {
  received: 'info',
  reviewed: 'info',
  accepted: 'primary',
  lawyerAssigned: 'primary',
  mediation: 'primary',
  referred: 'warning',
  closed: 'muted',
};

export function StageBadge({ stage }: { stage: Stage }) {
  const { t } = useI18n();
  return <Badge label={t.stage[stage]} tone={STAGE_TONE[stage]} />;
}

/** "Court hearing in 5 days, Wednesday 12 October" for the next date, if there is one. */
export function NextDateLine({ c }: { c: SavedCase }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  const next = c.status ? nextDate(c.status) : null;
  if (!next) return null;
  const days = f.daysUntil(next.at);
  if (days < 0) return null;
  const when = `${relativeDays(days, i18n)} · ${f.weekday(next.at)}, ${f.date(next.at)}`;
  return (
    <Row gap={Spacing.xs}>
      <Icon name={next.kind === 'hearing' ? 'gavel' : 'handshake-outline'} size={18} />
      <Txt variant="smallStrong">
        {next.kind === 'hearing' ? t.cases.hearing(when) : t.cases.mediation(when)}
      </Txt>
    </Row>
  );
}

export function CaseCard({ c, onPress }: { c: SavedCase; onPress: () => void }) {
  const i18n = useI18n();
  const { t, f } = i18n;
  return (
    <Card onPress={onPress} accessibilityLabel={`${c.reference}, ${c.status ? t.stage[c.status.stage] : ''}`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="bodyStrong" style={{ flexShrink: 1 }}>
          {c.reference}
        </Txt>
        {c.status && <StageBadge stage={c.status.stage} />}
      </Row>
      {c.title ? (
        <Txt variant="small" tone="secondary" numberOfLines={2}>
          {c.title}
        </Txt>
      ) : null}
      <NextDateLine c={c} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="small" tone="muted">
          {t.cases.trackingNumber}: {f.token(c.token)}
        </Txt>
        <Txt variant="small" tone={c.checkFailed ? 'warning' : 'muted'}>
          {c.checkFailed
            ? t.cases.notUpdated
            : c.checkedAt
              ? t.cases.updated(ago(c.checkedAt, i18n))
              : ''}
        </Txt>
      </Row>
    </Card>
  );
}

export function ProgressSteps({ stage, track }: { stage: Stage; track: Track | null }) {
  const theme = useTheme();
  const { t } = useI18n();
  const steps = progressSteps({ stage, track });
  return (
    <View accessibilityRole="list">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const color =
          step.state === 'upcoming' ? theme.border : step.state === 'current' ? theme.info : theme.primary;
        return (
          <View key={step.key} style={styles.step} accessibilityRole="text">
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { borderColor: color, backgroundColor: step.state === 'upcoming' ? theme.card : color },
                ]}>
                {step.state === 'done' && <Icon name="check" size={16} color={theme.primaryText} />}
                {step.state === 'current' && <View style={[styles.inner, { backgroundColor: theme.card }]} />}
              </View>
              {!last && (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: step.state === 'done' ? theme.primary : theme.border },
                  ]}
                />
              )}
            </View>
            <View style={[styles.stepText, !last && { paddingBottom: Spacing.lg }]}>
              <Txt
                variant={step.state === 'current' ? 'bodyStrong' : 'body'}
                tone={step.state === 'upcoming' ? 'muted' : 'default'}>
                {t.stage[step.key]}
              </Txt>
              {step.state === 'current' && (
                <Txt variant="small" tone="secondary">
                  {t.stageHelp[step.key]}
                </Txt>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: Spacing.md },
  rail: { alignItems: 'center', width: 28 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { width: 10, height: 10, borderRadius: Radius.pill },
  line: { width: 2, flex: 1, minHeight: 16 },
  stepText: { flex: 1, gap: 2, paddingTop: 2 },
});
