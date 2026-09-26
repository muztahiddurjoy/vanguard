import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { DistrictPicker } from '@/components/district-picker';
import {
  Button,
  Card,
  Chip,
  Chips,
  Divider,
  Field,
  Icon,
  Notice,
  Row,
  Screen,
  Section,
  Txt,
} from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { WEEKDAYS } from '@/i18n/format';
import { useI18n } from '@/i18n';
import type { SavedCase } from '@/lib/cases';
import { DISTRICTS } from '@/lib/districts';
import { EMERGENCY } from '@/lib/config';
import {
  emptyDraft,
  firstInvalidStep,
  NARRATIVE_MAX,
  STEPS,
  validateStep,
  type Draft,
  type Errors,
  type SafeWindow,
  type Step,
} from '@/lib/filing';
import { dial } from '@/lib/phone';
import { KEYS, loadJson, remove as removeKey, saveJson } from '@/lib/storage';
import type { AccessibilityFlag } from '@/lib/types';
import { useCases } from '@/state/cases';

const FLAGS: AccessibilityFlag[] = [
  'low_literacy',
  'visually_impaired',
  'hearing_impaired',
  'mobility_impaired',
  'needs_interpreter',
  'no_own_phone',
];

const RELATIONS = ['son', 'daughter', 'father', 'mother', 'husband', 'wife', 'brother', 'sister', 'neighbour'] as const;

const PERIODS = {
  morning: { start: 9, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
} as const;
type Period = keyof typeof PERIODS;

function periodOf(w: SafeWindow | null): Period | null {
  if (!w) return null;
  return (Object.keys(PERIODS) as Period[]).find((p) => PERIODS[p].start === w.start && PERIODS[p].end === w.end) ?? null;
}

type Outcome = { kind: 'filed'; case: SavedCase } | { kind: 'queued' };

export default function FileScreen() {
  const { t, lang } = useI18n();
  const { submit } = useCases();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // A half-filled form survives leaving the screen or closing the app.
  useEffect(() => {
    loadJson<Draft | null>(KEYS.draft, null).then((saved) => setDraft(saved ?? emptyDraft(lang)));
    // Only once: the language at the start becomes the applicant's preferred one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (draft && !outcome) void saveJson(KEYS.draft, draft);
  }, [draft, outcome]);

  if (!draft) return <Screen>{null}</Screen>;
  if (outcome) return <Finished outcome={outcome} />;

  const current: Step = STEPS[step];
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));
  const err = (key: string) => (errors[key] ? t.file.errors[errors[key]!] : null);

  const next = () => {
    const e = validateStep(current, draft);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  };
  const back = () => {
    setErrors({});
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };
  const send = async () => {
    const e = validateStep('review', draft);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      const bad = firstInvalidStep(draft);
      if (bad) setStep(STEPS.indexOf(bad));
      return;
    }
    setSending(true);
    setRejected(null);
    const result = await submit(draft);
    setSending(false);
    if (result.kind === 'rejected') {
      setRejected(t.file.rejected(result.message));
      return;
    }
    await removeKey(KEYS.draft);
    setOutcome(result);
  };
  const startOver = () =>
    Alert.alert(t.file.startOver, t.file.startOverConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.file.startOver,
        style: 'destructive',
        onPress: () => {
          setDraft(emptyDraft(lang));
          setErrors({});
          setStep(0);
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => <Button title={t.file.startOver} variant="ghost" onPress={startOver} />,
        }}
      />
      <Screen>
        <StepHeader step={step} />
        {current === 'who' && <WhoStep d={draft} update={update} err={err} />}
        {current === 'applicant' && <ApplicantStep d={draft} update={update} err={err} />}
        {current === 'problem' && <ProblemStep d={draft} update={update} err={err} />}
        {current === 'safety' && <SafetyStep d={draft} update={update} err={err} />}
        {current === 'review' && <ReviewStep d={draft} goTo={(s) => setStep(STEPS.indexOf(s))} />}

        {Object.keys(errors).length > 0 && <Notice tone="danger">{t.file.fixFirst}</Notice>}
        {rejected && <Notice tone="danger">{rejected}</Notice>}

        <Row>
          <Button title={t.common.back} variant="secondary" icon="chevron-left" onPress={back} style={{ flex: 1 }} />
          {current === 'review' ? (
            <Button
              title={sending ? t.file.review.sending : t.file.review.submit}
              icon="send"
              onPress={send}
              loading={sending}
              style={{ flex: 2 }}
              testID="file-submit"
            />
          ) : (
            <Button title={t.common.next} icon="chevron-right" onPress={next} style={{ flex: 2 }} testID="file-next" />
          )}
        </Row>
      </Screen>
    </View>
  );
}

function StepHeader({ step }: { step: number }) {
  const { t, f } = useI18n();
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.sm }}>
      <Txt variant="small" tone="secondary">
        {t.file.step(f.num(step + 1), f.num(STEPS.length))}
      </Txt>
      <Txt variant="title">{t.file.steps[STEPS[step]]}</Txt>
      <View style={styles.bar}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[styles.barPart, { backgroundColor: i <= step ? theme.primary : theme.border }]}
          />
        ))}
      </View>
    </View>
  );
}

type StepProps = {
  d: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  err: (key: string) => string | null;
};

function Option({
  selected,
  icon,
  title,
  hint,
  onPress,
  testID,
}: {
  selected: boolean;
  icon: 'account' | 'account-multiple';
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
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.option,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primarySoft : theme.card,
        },
      ]}>
      <Icon name={icon} size={32} color={selected ? theme.primary : theme.textSecondary} />
      <View style={{ flex: 1 }}>
        <Txt variant="heading">{title}</Txt>
        <Txt variant="small" tone="secondary">
          {hint}
        </Txt>
      </View>
      <Icon
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        color={selected ? theme.primary : theme.textMuted}
      />
    </Pressable>
  );
}

function WhoStep({ d, update, err }: StepProps) {
  const { t } = useI18n();
  const w = t.file.who;
  const isChip = (RELATIONS as readonly string[]).includes(d.proxy.relation);
  return (
    <>
      <Txt variant="heading">{w.question}</Txt>
      <Option
        testID="who-self"
        selected={d.forSelf}
        icon="account"
        title={w.self}
        hint={w.selfHint}
        onPress={() => update((x) => ({ ...x, forSelf: true }))}
      />
      <Option
        testID="who-other"
        selected={!d.forSelf}
        icon="account-multiple"
        title={w.other}
        hint={w.otherHint}
        onPress={() => update((x) => ({ ...x, forSelf: false }))}
      />
      {!d.forSelf && (
        <Card>
          <Field
            label={w.yourName}
            value={d.proxy.name}
            onChangeText={(v) => update((x) => ({ ...x, proxy: { ...x.proxy, name: v } }))}
            error={err('proxy.name')}
            autoComplete="name"
          />
          <Field
            label={w.yourPhone}
            value={d.proxy.phone}
            onChangeText={(v) => update((x) => ({ ...x, proxy: { ...x.proxy, phone: v } }))}
            error={err('proxy.phone')}
            keyboardType="phone-pad"
            placeholder="01XXXXXXXXX"
          />
          <Txt variant="smallStrong">{w.relation}</Txt>
          <Chips>
            {RELATIONS.map((r) => (
              <Chip
                key={r}
                label={w.relations[r]}
                selected={d.proxy.relation === r}
                onPress={() => update((x) => ({ ...x, proxy: { ...x.proxy, relation: r } }))}
              />
            ))}
          </Chips>
          <Field
            label={w.relationOther}
            value={isChip ? '' : d.proxy.relation}
            onChangeText={(v) => update((x) => ({ ...x, proxy: { ...x.proxy, relation: v } }))}
            error={err('proxy.relation')}
          />
        </Card>
      )}
    </>
  );
}

function ApplicantStep({ d, update, err }: StepProps) {
  const { t } = useI18n();
  const a = t.file.applicant;
  const set = (key: keyof Draft['applicant']) => (v: string) =>
    update((x) => ({ ...x, applicant: { ...x.applicant, [key]: v } }));
  const optional = t.common.optional;
  const phoneRequired = d.forSelf && !d.applicant.flags.includes('no_own_phone');
  return (
    <>
      <Txt variant="heading">{d.forSelf ? a.titleSelf : a.titleOther}</Txt>
      <Field
        label={a.name}
        value={d.applicant.name}
        onChangeText={set('name')}
        error={err('applicant.name')}
        autoComplete="name"
        testID="applicant-name"
      />
      <Field label={a.nameBn} optionalLabel={optional} value={d.applicant.nameBn} onChangeText={set('nameBn')} />
      <Field
        label={a.phone}
        optionalLabel={phoneRequired ? undefined : optional}
        value={d.applicant.phone}
        onChangeText={set('phone')}
        error={err('applicant.phone')}
        keyboardType="phone-pad"
        placeholder="01XXXXXXXXX"
        testID="applicant-phone"
      />
      <Field
        label={a.nid}
        optionalLabel={optional}
        value={d.applicant.nid}
        onChangeText={set('nid')}
        error={err('applicant.nid')}
        keyboardType="number-pad"
      />
      <Field label={a.guardian} optionalLabel={optional} value={d.applicant.guardianName} onChangeText={set('guardianName')} />
      <Field
        label={a.age}
        optionalLabel={optional}
        value={d.applicant.age}
        onChangeText={set('age')}
        error={err('applicant.age')}
        keyboardType="number-pad"
        maxLength={3}
      />
      <Field label={a.village} optionalLabel={optional} value={d.applicant.village} onChangeText={set('village')} />
      <Field label={a.upazila} optionalLabel={optional} value={d.applicant.upazila} onChangeText={set('upazila')} />
      <DistrictPicker value={d.applicant.district} onChange={set('district')} />
      <Txt variant="smallStrong">{a.language}</Txt>
      <Chips>
        <Chip
          label="বাংলা"
          selected={d.applicant.language === 'bn'}
          onPress={() => update((x) => ({ ...x, applicant: { ...x.applicant, language: 'bn' } }))}
        />
        <Chip
          label="English"
          selected={d.applicant.language === 'en'}
          onPress={() => update((x) => ({ ...x, applicant: { ...x.applicant, language: 'en' } }))}
        />
      </Chips>
      <Txt variant="smallStrong">
        {a.needs}
        <Txt variant="small" tone="muted">{`  (${optional})`}</Txt>
      </Txt>
      <Chips>
        {FLAGS.map((flag) => {
          const on = d.applicant.flags.includes(flag);
          return (
            <Chip
              key={flag}
              label={a.flags[flag]}
              selected={on}
              onPress={() =>
                update((x) => ({
                  ...x,
                  applicant: {
                    ...x.applicant,
                    flags: on ? x.applicant.flags.filter((g) => g !== flag) : [...x.applicant.flags, flag],
                  },
                }))
              }
            />
          );
        })}
      </Chips>
    </>
  );
}

function ProblemStep({ d, update, err }: StepProps) {
  const { t, f } = useI18n();
  const theme = useTheme();
  const p = t.file.problem;
  const optional = t.common.optional;
  const pickDate = () => {
    const initial = d.nextHearingDate ? new Date(`${d.nextHearingDate}T00:00:00`) : new Date();
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        update((x) => ({ ...x, nextHearingDate: iso }));
      },
    });
  };
  return (
    <>
      <Field
        label={p.title}
        hint={`${p.hint} · ${p.count(f.num(d.narrative.trim().length))}`}
        value={d.narrative}
        onChangeText={(v) => update((x) => ({ ...x, narrative: v }))}
        error={err('narrative')}
        multiline
        maxLength={NARRATIVE_MAX}
        testID="narrative"
      />
      <Section title={p.respondent}>
        <Field
          label={p.respondentName}
          optionalLabel={optional}
          value={d.respondent.name}
          onChangeText={(v) => update((x) => ({ ...x, respondent: { ...x.respondent, name: v } }))}
        />
        <Field
          label={p.respondentRelation}
          optionalLabel={optional}
          value={d.respondent.relation}
          onChangeText={(v) => update((x) => ({ ...x, respondent: { ...x.respondent, relation: v } }))}
        />
      </Section>
      <Card>
        <Row>
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            {p.inCourt}
          </Txt>
          <Switch
            value={d.nextHearingDate !== null}
            onValueChange={(on) => {
              if (!on) update((x) => ({ ...x, nextHearingDate: null }));
              else if (Platform.OS === 'android') pickDate();
            }}
            thumbColor={theme.card}
            trackColor={{ true: theme.primary, false: theme.border }}
          />
        </Row>
        {(d.nextHearingDate !== null || Platform.OS !== 'android') && (
          <View style={{ gap: Spacing.xs }}>
            <Txt variant="smallStrong">{p.hearingDate}</Txt>
            {Platform.OS === 'android' ? (
              <Pressable
                onPress={pickDate}
                accessibilityRole="button"
                style={[styles.dateButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Icon name="calendar" />
                <Txt>{d.nextHearingDate ? f.date(new Date(`${d.nextHearingDate}T00:00:00`)) : p.pickDate}</Txt>
              </Pressable>
            ) : (
              <Field
                label="YYYY-MM-DD"
                value={d.nextHearingDate ?? ''}
                onChangeText={(v) => update((x) => ({ ...x, nextHearingDate: v || null }))}
              />
            )}
            {err('nextHearingDate') && (
              <Txt variant="small" tone="danger">
                {err('nextHearingDate')}
              </Txt>
            )}
          </View>
        )}
      </Card>
    </>
  );
}

function SafetyStep({ d, update, err }: StepProps) {
  const { t, f, lang } = useI18n();
  const theme = useTheme();
  const s = t.file.safety;
  const period = periodOf(d.safeWindow);
  const setWindow = (day: number | null, p: Period | null) =>
    update((x) => ({
      ...x,
      safeWindow:
        day === null && p === null
          ? null
          : {
              day: day ?? new Date().getDay(),
              start: PERIODS[p ?? 'morning'].start,
              end: PERIODS[p ?? 'morning'].end,
            },
    }));
  return (
    <>
      <Card>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{s.monitored}</Txt>
            <Txt variant="small" tone="secondary">
              {s.monitoredHint}
            </Txt>
          </View>
          <Switch
            testID="phone-monitored"
            value={d.phoneMonitored}
            onValueChange={(v) => update((x) => ({ ...x, phoneMonitored: v }))}
            thumbColor={theme.card}
            trackColor={{ true: theme.primary, false: theme.border }}
          />
        </Row>
      </Card>
      <Section title={s.window}>
        <Txt variant="small" tone="secondary">
          {s.windowHint}
        </Txt>
        <Chips>
          <Chip label={s.anyTime} selected={d.safeWindow === null} onPress={() => setWindow(null, null)} />
        </Chips>
        <Txt variant="smallStrong">{s.day}</Txt>
        <Chips>
          {WEEKDAYS[lang].map((name, day) => (
            <Chip
              key={name}
              label={name}
              selected={d.safeWindow?.day === day}
              onPress={() => setWindow(day, period)}
            />
          ))}
        </Chips>
        <Txt variant="smallStrong">{s.time}</Txt>
        <Chips>
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Chip
              key={p}
              label={s.periods[p]}
              selected={period === p}
              onPress={() => setWindow(d.safeWindow?.day ?? null, p)}
            />
          ))}
        </Chips>
        {err('safeWindow') && <Notice tone="danger">{err('safeWindow')}</Notice>}
      </Section>
      <Card tone="danger" onPress={() => dial(EMERGENCY)}>
        <Row>
          <Icon name="phone-alert" color={theme.dangerSoftText} />
          <Txt variant="bodyStrong" style={{ flex: 1, color: theme.dangerSoftText }}>
            {s.danger.replace('999', f.digits(EMERGENCY))}
          </Txt>
        </Row>
      </Card>
    </>
  );
}

function ReviewStep({ d, goTo }: { d: Draft; goTo: (s: Step) => void }) {
  const { t, f, lang } = useI18n();
  const r = t.file.review;
  const a = d.applicant;
  const relationLabel = (rel: string) =>
    (t.file.who.relations as Record<string, string>)[rel] ?? rel;
  const line = (label: string, value: string | null | undefined) =>
    value ? (
      <Row style={{ alignItems: 'flex-start' }} key={label}>
        <Txt variant="small" tone="secondary" style={{ width: 120 }}>
          {label}
        </Txt>
        <Txt style={{ flex: 1 }}>{value}</Txt>
      </Row>
    ) : null;
  const edit = (step: Step) => (
    <Button title={t.common.edit} variant="ghost" icon="pencil-outline" onPress={() => goTo(step)} />
  );
  const w = d.safeWindow;
  const period = periodOf(w);
  return (
    <>
      <Txt variant="heading">{r.title}</Txt>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyStrong">
            {d.forSelf ? r.forSelf : r.forOther(d.proxy.name, relationLabel(d.proxy.relation))}
          </Txt>
          {edit('who')}
        </Row>
      </Card>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyStrong">{t.file.steps.applicant}</Txt>
          {edit('applicant')}
        </Row>
        <Divider />
        {line(t.file.applicant.name, a.name)}
        {line(t.file.applicant.nameBn, a.nameBn)}
        {line(t.file.applicant.phone, a.phone && f.digits(a.phone))}
        {line(t.file.applicant.nid, a.nid && f.digits(a.nid))}
        {line(t.file.applicant.guardian, a.guardianName)}
        {line(t.file.applicant.age, a.age && f.digits(a.age))}
        {line(t.file.applicant.village, a.village)}
        {line(t.file.applicant.upazila, a.upazila)}
        {line(t.file.applicant.district, a.district && (lang === 'bn' ? DISTRICTS[a.district] : a.district))}
        {line(t.file.applicant.language, a.language === 'bn' ? 'বাংলা' : 'English')}
        {line(t.file.applicant.needs, a.flags.map((fl) => t.file.applicant.flags[fl]).join(', '))}
      </Card>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyStrong">{t.file.steps.problem}</Txt>
          {edit('problem')}
        </Row>
        <Divider />
        <Txt>{d.narrative.trim()}</Txt>
        {line(r.against, d.respondent.name && [d.respondent.name, d.respondent.relation].filter(Boolean).join(', '))}
        {line(r.hearing, d.nextHearingDate && f.date(new Date(`${d.nextHearingDate}T00:00:00`)))}
      </Card>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyStrong">{t.file.steps.safety}</Txt>
          {edit('safety')}
        </Row>
        <Divider />
        {line(r.monitored, d.phoneMonitored ? '✓' : null)}
        {line(
          r.window,
          w ? `${WEEKDAYS[lang][w.day]}, ${period ? t.file.safety.periods[period] : `${f.num(w.start)}–${f.num(w.end)}`}` : t.file.safety.anyTime
        )}
      </Card>
      <Notice tone="primary" icon="shield-check-outline">
        {r.note}
      </Notice>
    </>
  );
}

function Finished({ outcome }: { outcome: Outcome }) {
  const { t, f } = useI18n();
  const theme = useTheme();
  if (outcome.kind === 'queued') {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xl }}>
          <Icon name="cloud-clock-outline" size={64} color={theme.warning} />
          <Txt variant="title" style={{ textAlign: 'center' }}>
            {t.file.queued.title}
          </Txt>
          <Txt tone="secondary" style={{ textAlign: 'center' }}>
            {t.file.queued.body}
          </Txt>
        </View>
        <Button title={t.common.done} big onPress={() => router.replace('/cases')} />
      </Screen>
    );
  }
  const c = outcome.case;
  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => null }} />
      <View style={{ alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.xl }}>
        <Icon name="check-circle" size={72} color={theme.primary} />
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {t.file.done.title}
        </Txt>
      </View>
      <Card tone="primary">
        <Txt variant="small" style={{ textAlign: 'center' }}>
          {t.file.done.tokenLabel}
        </Txt>
        <Txt style={[Type.number, { textAlign: 'center', color: theme.primarySoftText }]} selectable testID="filed-token">
          {f.token(c.token)}
        </Txt>
        <Txt variant="small" style={{ textAlign: 'center', color: theme.primarySoftText }}>
          {t.file.done.reference(c.reference)}
        </Txt>
      </Card>
      <Notice icon="information-outline">{t.file.done.tokenHint}</Notice>
      <Button
        title={t.file.done.seeProgress}
        icon="timeline-check-outline"
        big
        onPress={() => router.replace({ pathname: '/case/[token]', params: { token: c.token } })}
      />
      <Button
        title={t.file.done.addDocs}
        icon="paperclip"
        variant="secondary"
        onPress={() => router.replace({ pathname: '/case/[token]', params: { token: c.token } })}
      />
      <Button title={t.common.done} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: Spacing.xs },
  barPart: { flex: 1, height: 6, borderRadius: Radius.pill },
  option: {
    minHeight: MIN_TOUCH + 24,
    borderWidth: 2,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dateButton: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
