import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';

import { CaseCard } from '@/components/case-bits';
import { Button, Card, Icon, Notice, Row, Screen, Section, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ago, useI18n } from '@/i18n';
import { titleFrom } from '@/lib/cases';
import { useCases } from '@/state/cases';

export default function CasesScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const theme = useTheme();
  const { cases, pending, refreshAll, sendPending, dropPending } = useCases();
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([refreshAll(), sendPending()]);
    setRefreshing(false);
  };

  const confirmDrop = (clientRef: string) =>
    Alert.alert(t.cases.delete, t.cases.deleteConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.cases.delete, style: 'destructive', onPress: () => dropPending(clientRef) },
    ]);

  return (
    <Screen
      padTop
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} />
      }>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="title">{t.cases.title}</Txt>
      </Row>
      <Button title={t.cases.add} icon="plus" variant="secondary" onPress={() => router.push('/track')} />

      {pending.length > 0 && (
        <Section title={t.cases.pendingTitle}>
          <Notice tone="warning" icon="cloud-off-outline">
            {t.cases.pendingHint}
          </Notice>
          {pending.map((p) => (
            <Card key={p.draft.clientRef}>
              <Txt variant="bodyStrong" numberOfLines={2}>
                {titleFrom(p.draft.narrative)}
              </Txt>
              <Txt variant="small" tone="muted">
                {p.draft.applicant.name} · {ago(p.queuedAt, i18n)}
              </Txt>
              {p.lastError ? (
                <Txt variant="small" tone="danger">
                  {p.lastError}
                </Txt>
              ) : null}
              <Row>
                <Button
                  title={t.cases.send}
                  icon="send"
                  loading={sending}
                  onPress={async () => {
                    setSending(true);
                    await sendPending();
                    setSending(false);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  title={t.cases.delete}
                  variant="ghost"
                  onPress={() => confirmDrop(p.draft.clientRef)}
                />
              </Row>
            </Card>
          ))}
        </Section>
      )}

      {cases.length === 0 && pending.length === 0 ? (
        <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl }}>
          <Icon name="briefcase-search-outline" size={56} color={theme.textMuted} />
          <Txt variant="heading">{t.cases.empty}</Txt>
          <Txt tone="secondary" style={{ textAlign: 'center' }}>
            {t.cases.emptyHint}
          </Txt>
          <Button title={t.home.fileCase} icon="file-document-edit-outline" onPress={() => router.push('/file')} />
        </View>
      ) : (
        cases.map((c) => (
          <CaseCard
            key={c.token}
            c={c}
            onPress={() => router.push({ pathname: '/case/[token]', params: { token: c.token } })}
          />
        ))
      )}
    </Screen>
  );
}
