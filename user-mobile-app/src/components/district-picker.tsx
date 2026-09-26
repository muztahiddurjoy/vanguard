import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Icon, Txt } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/i18n';
import { DISTRICT_NAMES, DISTRICTS } from '@/lib/districts';

/** A field that opens a searchable list of the 64 districts, in the active language. */
export function DistrictPicker({ value, onChange }: { value: string; onChange: (district: string) => void }) {
  const { t, lang } = useI18n();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const name = (en: string) => (lang === 'bn' ? DISTRICTS[en] : en);
  const q = query.trim().toLowerCase();
  const shown = DISTRICT_NAMES.filter((d) => !q || d.toLowerCase().includes(q) || DISTRICTS[d].includes(query.trim()));

  return (
    <View style={{ gap: Spacing.xs }}>
      <Txt variant="smallStrong">
        {t.file.applicant.district}
        <Txt variant="small" tone="muted">{`  (${t.common.optional})`}</Txt>
      </Txt>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        testID="district-picker"
        style={[styles.field, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Txt tone={value ? 'default' : 'muted'} style={{ flex: 1 }}>
          {value ? name(value) : t.file.applicant.chooseDistrict}
        </Txt>
        <Icon name="chevron-down" color={theme.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top + Spacing.md }}>
          <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
            <Field
              label={t.file.applicant.searchDistrict}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>
          <FlatList
            data={shown}
            keyExtractor={(d) => d}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.xs }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQuery('');
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: item === value ? theme.primarySoft : theme.card },
                  pressed && { opacity: 0.7 },
                ]}>
                <Txt style={{ flex: 1 }}>{name(item)}</Txt>
                {lang === 'bn' && (
                  <Txt variant="small" tone="muted">
                    {item}
                  </Txt>
                )}
              </Pressable>
            )}
          />
          <View style={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }}>
            <Button title={t.common.close} variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  option: {
    minHeight: MIN_TOUCH,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
