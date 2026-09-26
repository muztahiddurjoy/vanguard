import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Divider, Field, Icon, ListRow, Notice, Row, Screen, Section, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { api, ApiError, tokenDigits } from '@/lib/api';
import { EMERGENCY, HOTLINE } from '@/lib/config';
import { asciiDigits } from '@/lib/filing';
import { dial } from '@/lib/phone';
import type { NoticeInfo } from '@/lib/types';
import { useSettings } from '@/state/settings';

export default function HelpScreen() {
  const { t, f } = useI18n();
  const theme = useTheme();
  return (
    <Screen padTop>
      <Txt variant="title">{t.help.title}</Txt>

      <Card>
        <ListRow
          icon="phone-in-talk"
          title={`${t.help.hotline} · ${f.digits(HOTLINE)}`}
          subtitle={t.help.hotlineHint}
          onPress={() => dial(HOTLINE)}
        />
        <Divider />
        <ListRow
          icon="alarm-light-outline"
          iconColor={theme.danger}
          title={`${t.help.emergency} · ${f.digits(EMERGENCY)}`}
          subtitle={t.help.emergencyHint}
          onPress={() => dial(EMERGENCY)}
        />
        <Divider />
        <ListRow
          icon="chat-question-outline"
          title={t.help.ask}
          subtitle={t.help.askHint}
          onPress={() => router.push('/chat')}
        />
      </Card>

      <NoticeLookup />

      <Section title={t.help.faqTitle}>
        {t.help.faq.map((item) => (
          <Faq key={item.q} q={item.q} a={item.a} />
        ))}
      </Section>
    </Screen>
  );
}

function NoticeLookup() {
  const { t, f, lang } = useI18n();
  const { connection } = useSettings();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<NoticeInfo | null>(null);

  const check = async () => {
    const digits = tokenDigits(asciiDigits(code));
    setFound(null);
    if (digits.length !== 8) {
      setError(t.help.noticeInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setFound(await api.notice(connection, digits));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError(t.help.noticeNotFound);
      else if (e instanceof ApiError && e.offline) setError(t.common.offline);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t.help.notice}>
      <Field
        label={t.help.noticeHint}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          setError(null);
        }}
        keyboardType="number-pad"
        placeholder="1234-5678"
        maxLength={12}
        onSubmitEditing={check}
      />
      <Button title={t.help.noticeFind} icon="calendar-search" variant="secondary" onPress={check} loading={busy} />
      {error && <Notice tone="danger">{error}</Notice>}
      {found && (
        <Card tone="primary">
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="bodyStrong">{t.help.noticeCase(found.reference)}</Txt>
            <Txt variant="smallStrong">{t.help.noticeStatus[found.status]}</Txt>
          </Row>
          <Txt variant="small">{t.help.when}</Txt>
          <Txt variant="heading">{f.dateTime(found.scheduledFor)}</Txt>
          <Txt variant="small">{t.help.where}</Txt>
          <Txt variant="bodyStrong">{lang === 'bn' ? found.placeBn : found.place}</Txt>
          <Txt variant="small">{t.help.youAre(t.help.role[found.role])}</Txt>
          <Txt variant="small">{t.help.bring}</Txt>
        </Card>
      )}
    </Section>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <Card>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 40 }}>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>
          {q}
        </Txt>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} color={theme.textMuted} />
      </Pressable>
      {open && (
        <View>
          <Txt tone="secondary">{a}</Txt>
        </View>
      )}
    </Card>
  );
}
