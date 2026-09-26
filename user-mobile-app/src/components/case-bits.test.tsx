import { render, screen } from '@testing-library/react-native';

import { ProgressSteps } from '@/components/case-bits';
import { SettingsProvider } from '@/state/settings';

it('shows the steps in Bangla by default, explaining only the current one', async () => {
  await render(
    <SettingsProvider>
      <ProgressSteps stage="lawyerAssigned" track={null} />
    </SettingsProvider>
  );
  expect(await screen.findByText('আইনজীবী নিযুক্ত')).toBeTruthy();
  expect(screen.getByText('আবেদন গৃহীত')).toBeTruthy();
  expect(screen.getByText(/একজন প্যানেল আইনজীবী/)).toBeTruthy();
  expect(screen.queryByText(/অফিস আপনার আবেদন পেয়েছে/)).toBeNull();
});
