import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Notice, Txt } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useSettings } from '@/state/settings';

type Message = { id: string; from: 'helpline' | 'me'; text: string };

/** The AI query helpline (the same agent that answers the phone line), as a chat. */
export default function ChatScreen() {
  const { t, lang } = useI18n();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { connection } = useSettings();
  const [session, setSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);
  const counter = useRef(0);

  const add = (from: Message['from'], body: string) =>
    setMessages((m) => [...m, { id: String(counter.current++), from, text: body }]);

  const describe = useCallback(
    (e: unknown) => (e instanceof ApiError && e.offline ? t.common.offline : e instanceof Error ? e.message : String(e)),
    [t]
  );

  // Each attempt opens a new helpline conversation, in the active language.
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(true);
  useEffect(() => {
    let live = true;
    api.startHelpline(connection, lang).then(
      (started) => {
        if (!live) return;
        setSession(started.sessionId);
        setMessages([{ id: String(counter.current++), from: 'helpline', text: started.reply }]);
        setStarting(false);
      },
      (e) => {
        if (!live) return;
        setError(describe(e));
        setStarting(false);
      }
    );
    return () => {
      live = false;
    };
  }, [connection, lang, describe, attempt]);

  const restart = () => {
    setSession(null);
    setMessages([]);
    setError(null);
    setFinished(false);
    setStarting(true);
    setAttempt((a) => a + 1);
  };

  const send = async () => {
    const utterance = text.trim();
    if (!utterance || !session || busy) return;
    setText('');
    add('me', utterance);
    setBusy(true);
    setError(null);
    try {
      const turn = await api.helplineTurn(connection, session, utterance);
      add('helpline', turn.reply);
      if (turn.complete) setFinished(true);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={starting ? <Txt tone="muted">{t.chat.starting}</Txt> : null}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.from === 'me'
                ? { alignSelf: 'flex-end', backgroundColor: theme.primary }
                : { alignSelf: 'flex-start', backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
            ]}>
            <Txt style={{ color: item.from === 'me' ? theme.primaryText : theme.text }}>{item.text}</Txt>
          </View>
        )}
        ListFooterComponent={
          <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
            {error && <Notice tone="danger">{error}</Notice>}
            {(finished || (error && !session)) && (
              <Button title={t.chat.restart} icon="restart" variant="secondary" onPress={restart} />
            )}
            {finished && <Txt tone="muted">{t.chat.finished}</Txt>}
          </View>
        }
      />
      <View
        style={[
          styles.composer,
          { borderTopColor: theme.border, backgroundColor: theme.tabBar, paddingBottom: insets.bottom + Spacing.sm },
        ]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.chat.placeholder}
          placeholderTextColor={theme.textMuted}
          editable={!finished}
          multiline
          accessibilityLabel={t.chat.placeholder}
          style={[
            styles.input,
            Type.body,
            { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
          ]}
          testID="chat-input"
        />
        <Button
          title={t.chat.send}
          icon="send"
          onPress={send}
          loading={busy}
          disabled={!text.trim() || !session || finished}
          style={styles.send}
          testID="chat-send"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  send: { paddingHorizontal: Spacing.md },
});
