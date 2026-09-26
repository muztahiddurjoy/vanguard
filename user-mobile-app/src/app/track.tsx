import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Field, Notice, Screen, Txt } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError, tokenDigits } from '@/lib/api';
import { asciiDigits } from '@/lib/filing';
import { useCases } from '@/state/cases';

export default function TrackScreen() {
  const { t } = useI18n();
  const { track } = useCases();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async () => {
    const digits = tokenDigits(asciiDigits(value));
    if (digits.length !== 8) {
      setError(t.trackScreen.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const found = await track(digits);
      router.replace({ pathname: '/case/[token]', params: { token: found.token } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError(t.trackScreen.notFound);
      else if (e instanceof ApiError && e.offline) setError(t.common.offline);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Txt tone="secondary">{t.trackScreen.hint}</Txt>
      <Field
        label={t.trackScreen.label}
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setError(null);
        }}
        placeholder="1234-5678"
        keyboardType="number-pad"
        maxLength={12}
        autoFocus
        onSubmitEditing={find}
        testID="tracking-input"
        style={{ fontSize: 24, letterSpacing: 3 }}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button title={t.trackScreen.find} icon="magnify" onPress={find} loading={busy} big testID="tracking-find" />
    </Screen>
  );
}
