import { fireEvent, render, screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import { dark, light } from '@/src/theme/palette';

import { DatabaseOpenError } from './DatabaseOpenError';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

it.each(['light', 'dark'] as const)('uses the %s system palette before device preferences can load', scheme => {
  jest.mocked(useColorScheme).mockReturnValue(scheme);
  const retry = jest.fn();
  render(<DatabaseOpenError onRetry={retry} />);
  expect(screen.getByTestId('database-open-error')).toHaveStyle({
    backgroundColor: (scheme === 'dark' ? dark : light).background,
  });
  fireEvent.press(screen.getByTestId('database-open-retry'));
  expect(retry).toHaveBeenCalledTimes(1);
});
