import Constants from 'expo-constants';
import { useState } from 'react';

import { Button, Chip, Chips, Field, Notice, Screen, Section, Txt } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { DEFAULT_API_URL } from '@/lib/config';
import { useSettings } from '@/state/settings';

export default function SettingsScreen() {
  const { t, f, lang, setLang } = useI18n();
  const { settings, update } = useSettings();
  const [url, setUrl] = useState(settings.apiUrl);
  const [token, setToken] = useState(settings.apiToken);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const test = async () => {
    update({ apiUrl: url.trim(), apiToken: token.trim() });
    setBusy(true);
    setResult(null);
    try {
      await api.health({ url: url.trim() || DEFAULT_API_URL, token: token.trim() || undefined });
      setResult({ ok: true, text: t.settings.connected });
    } catch (e) {
      setResult({
        ok: false,
        text: e instanceof ApiError && e.offline ? t.common.offline : e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Section title={t.settings.language}>
        <Chips>
          <Chip label="বাংলা" selected={lang === 'bn'} onPress={() => setLang('bn')} />
          <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
        </Chips>
      </Section>

      <Section title={t.settings.server}>
        <Txt variant="small" tone="secondary">
          {t.settings.serverHint}
        </Txt>
        <Field
          label={t.settings.url}
          value={url}
          onChangeText={setUrl}
          placeholder={DEFAULT_API_URL}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          testID="settings-url"
        />
        <Field
          label={t.settings.token}
          optionalLabel={t.common.optional}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Button title={t.settings.test} icon="lan-connect" onPress={test} loading={busy} testID="settings-test" />
        <Button
          title={t.settings.reset}
          variant="ghost"
          onPress={() => {
            setUrl('');
            setToken('');
            update({ apiUrl: '', apiToken: '' });
            setResult(null);
          }}
        />
        {result && <Notice tone={result.ok ? 'primary' : 'danger'}>{result.text}</Notice>}
      </Section>

      <Section title={t.settings.about}>
        <Txt tone="secondary">{t.settings.privacy}</Txt>
        <Txt variant="small" tone="muted">
          {t.settings.version(f.digits(Constants.expoConfig?.version ?? '1.0.0'))}
        </Txt>
      </Section>
    </Screen>
  );
}
