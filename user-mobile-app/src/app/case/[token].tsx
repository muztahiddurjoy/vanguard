import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { ProgressSteps, StageBadge } from '@/components/case-bits';
import {
  Button,
  Card,
  Chip,
  Chips,
  Divider,
  Icon,
  Notice,
  Row,
  Screen,
  Section,
  Txt,
} from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ago, relativeDays, useI18n, type I18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import type { SavedCase } from '@/lib/cases';
import { HOTLINE } from '@/lib/config';
import { DISTRICTS } from '@/lib/districts';
import { dial } from '@/lib/phone';
import type { DocumentKind } from '@/lib/types';
import { useCases } from '@/state/cases';
import { useSettings } from '@/state/settings';

const KINDS: DocumentKind[] = [
  'nid_copy',
  'gd_fir_copy',
  'medical_certificate',
  'marriage_certificate',
  'land_record',
  'birth_certificate',
  'income_proof',
  'employment_proof',
  'photo_evidence',
  'screenshot',
  'other',
];

/** What "Listen" reads out: the stage, the next dates, the route, and that it is free. */
function spokenSummary(c: SavedCase, i18n: I18n): string {
  const { t, f } = i18n;
  const s = c.status;
  if (!s) return '';
  const parts = [t.speech.stage(t.stage[s.stage], t.stageHelp[s.stage])];
  const upcoming = (iso: string | null) => (iso && f.daysUntil(iso) >= 0 ? iso : null);
  const hearing = upcoming(s.nextHearing);
  const mediation = upcoming(s.nextMediation);
  if (hearing) parts.push(t.speech.hearing(f.dateTime(hearing), relativeDays(f.daysUntil(hearing), i18n)));
  if (mediation) {
    parts.push(t.speech.mediation(f.dateTime(mediation), relativeDays(f.daysUntil(mediation), i18n)));
  }
  if (!hearing && !mediation) parts.push(t.speech.noDate);
  if (s.track) parts.push(t.speech.route(t.route[s.track]));
  parts.push(t.speech.free);
  return parts.join(' ');
}

export default function CaseScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const i18n = useI18n();
  const { t, f, lang } = i18n;
  const theme = useTheme();
  const { connection } = useSettings();
  const { get, refresh, remove, recordUpload } = useCases();
  const c = get(token);
  const [refreshing, setRefreshing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [kind, setKind] = useState<DocumentKind>('nid_copy');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch the latest stage when the screen opens; the list shows what was known.
  useEffect(() => {
    if (token) refresh(token).catch(() => undefined);
  }, [token, refresh]);

  useEffect(() => () => void Speech.stop(), []);

  if (!c) {
    return (
      <Screen>
        <Notice tone="warning">{t.case.notFound}</Notice>
      </Screen>
    );
  }
  const s = c.status;

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh(c.token).catch(() => undefined);
    setRefreshing(false);
  };

  const listen = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(spokenSummary(c, i18n), {
      language: lang === 'bn' ? 'bn-BD' : 'en-US',
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  const upload = async (source: 'camera' | 'photos' | 'pdf') => {
    setUploadError(null);
    let file: { uri: string; name: string; mimeType: string } | null = null;
    if (source === 'pdf') {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (r.canceled) return;
      const a = r.assets[0];
      file = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf' };
    } else {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setUploadError(t.case.cameraDenied);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
      const r =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (r.canceled) return;
      const a = r.assets[0];
      file = { uri: a.uri, name: a.fileName ?? 'photo.jpg', mimeType: a.mimeType ?? 'image/jpeg' };
    }
    setUploading(true);
    try {
      const result = await api.uploadDocument(connection, c.reference, file, kind);
      recordUpload(
        c.token,
        { id: result.document.id, kind: result.document.kind, name: file.name, sentAt: new Date().toISOString() },
        result
      );
    } catch (e) {
      const why = e instanceof ApiError && e.offline ? t.common.offline : e instanceof Error ? e.message : String(e);
      setUploadError(t.case.uploadFailed(why));
    } finally {
      setUploading(false);
    }
  };

  const confirmRemove = () =>
    Alert.alert(t.case.remove, t.case.removeConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.remove,
        style: 'destructive',
        onPress: () => {
          remove(c.token);
          router.back();
        },
      },
    ]);

  const office = s?.office ?? null;
  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />}>
      <Stack.Screen options={{ title: c.reference }} />

      <Card>
        <Txt variant="small" tone="secondary">
          {t.case.trackingNumber}
        </Txt>
        <Txt style={Type.number} selectable testID="case-token">
          {f.token(c.token)}
        </Txt>
        <Row style={{ justifyContent: 'space-between' }}>
          {s ? <StageBadge stage={s.stage} /> : <View />}
          <Txt variant="small" tone={c.checkFailed ? 'warning' : 'muted'}>
            {c.checkFailed ? t.cases.notUpdated : c.checkedAt ? t.case.lastChecked(ago(c.checkedAt, i18n)) : ''}
          </Txt>
        </Row>
        {s && (
          <Button
            title={speaking ? t.case.stop : t.case.listen}
            icon={speaking ? 'stop-circle-outline' : 'volume-high'}
            variant="secondary"
            onPress={listen}
          />
        )}
      </Card>

      {s && (
        <Section title={t.case.progress}>
          <Card>
            <ProgressSteps stage={s.stage} track={s.track} />
          </Card>
        </Section>
      )}

      {s && (s.nextHearing || s.nextMediation) ? (
        <>
          {s.nextHearing && <DateCard icon="gavel" title={t.case.nextHearing} iso={s.nextHearing} />}
          {s.nextMediation && (
            <DateCard icon="handshake-outline" title={t.case.nextMediation} iso={s.nextMediation} />
          )}
        </>
      ) : (
        s && <Notice icon="calendar-blank-outline">{t.case.noDates}</Notice>
      )}

      {s?.track && (
        <Card>
          <Txt variant="small" tone="secondary">
            {t.case.route}
          </Txt>
          <Txt variant="bodyStrong">{t.route[s.track]}</Txt>
          <Txt variant="small" tone="secondary">
            {t.routeHelp[s.track]}
          </Txt>
        </Card>
      )}

      {s?.outcome && (
        <Card tone="primary">
          <Txt variant="small">{t.case.outcome}</Txt>
          <Txt variant="bodyStrong">{t.outcome[s.outcome]}</Txt>
        </Card>
      )}

      {office && (
        <Card>
          <Txt variant="small" tone="secondary">
            {t.case.office}
          </Txt>
          <Txt variant="bodyStrong">
            {t.case.officeName(lang === 'bn' ? (DISTRICTS[office] ?? office) : office)}
          </Txt>
          <Button
            title={t.common.call(f.digits(HOTLINE))}
            icon="phone-outline"
            variant="secondary"
            onPress={() => dial(HOTLINE)}
          />
        </Card>
      )}

      <Section title={t.case.documents}>
        <Txt variant="small" tone="secondary">
          {t.case.documentsHint}
        </Txt>
        <Txt variant="smallStrong">{t.case.documentKind}</Txt>
        <Chips>
          {KINDS.map((k) => (
            <Chip key={k} label={t.docKind[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Chips>
        <Row style={{ flexWrap: 'wrap' }} gap={Spacing.sm}>
          <Button title={t.case.takePhoto} icon="camera-outline" onPress={() => upload('camera')} disabled={uploading} />
          <Button
            title={t.case.choosePhoto}
            icon="image-outline"
            variant="secondary"
            onPress={() => upload('photos')}
            disabled={uploading}
          />
          <Button
            title={t.case.choosePdf}
            icon="file-pdf-box"
            variant="secondary"
            onPress={() => upload('pdf')}
            disabled={uploading}
          />
        </Row>
        {uploading && <Notice icon="cloud-upload-outline">{t.case.uploading}</Notice>}
        {uploadError && <Notice tone="danger">{uploadError}</Notice>}
        {c.documents.map((d) => (
          <Row key={`${d.id}-${d.sentAt}`}>
            <Icon name="file-check-outline" color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{t.docKind[d.kind] ?? d.kind}</Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {d.name} · {t.case.sent} {ago(d.sentAt, i18n)}
              </Txt>
            </View>
          </Row>
        ))}
        {c.checklist && c.checklist.length > 0 && (
          <Card>
            <Txt variant="bodyStrong">{t.case.checklist}</Txt>
            <Divider />
            {c.checklist.map((item) => {
              const done = item.status !== 'missing';
              return (
                <Row key={item.key} style={{ paddingVertical: 4 }}>
                  <Icon
                    name={done ? 'check-circle' : item.required ? 'alert-circle-outline' : 'circle-outline'}
                    color={done ? theme.primary : item.required ? theme.warning : theme.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Txt>{lang === 'bn' ? item.label_bn : item.label}</Txt>
                    <Txt variant="small" tone="muted">
                      {done ? t.case.provided : item.required ? t.case.missing : t.case.optionalItem}
                    </Txt>
                  </View>
                </Row>
              );
            })}
          </Card>
        )}
      </Section>

      <Notice tone="primary" icon="hand-coin-outline">
        {t.case.free}
      </Notice>
      <Button title={t.case.remove} icon="delete-outline" variant="ghost" onPress={confirmRemove} />
    </Screen>
  );
}

function DateCard({ icon, title, iso }: { icon: 'gavel' | 'handshake-outline'; title: string; iso: string }) {
  const i18n = useI18n();
  const { f } = i18n;
  const theme = useTheme();
  const days = f.daysUntil(iso);
  const past = days < 0;
  return (
    <Card tone={past ? 'default' : 'primary'}>
      <Row>
        <Icon name={icon} size={36} color={past ? theme.textMuted : theme.primarySoftText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="small" style={{ color: past ? theme.textMuted : theme.primarySoftText }}>
            {title}
          </Txt>
          <Txt variant="heading">{f.date(iso)}</Txt>
          <Txt variant="bodyStrong">
            {f.weekday(iso)}, {f.time(iso)}
          </Txt>
          <Txt variant="smallStrong" style={{ color: past ? theme.textMuted : theme.primarySoftText }}>
            {relativeDays(days, i18n)}
          </Txt>
        </View>
      </Row>
    </Card>
  );
}
