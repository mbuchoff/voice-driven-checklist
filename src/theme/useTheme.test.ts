import { useColorScheme } from 'react-native';

import { dark, light } from './palette';
import { useTheme } from './useTheme';

jest.mock('react-native', () => ({
  useColorScheme: jest.fn(),
}));

const mockedUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

describe('useTheme', () => {
  afterEach(() => {
    mockedUseColorScheme.mockReset();
  });

  it('returns the dark palette when the OS reports dark', () => {
    mockedUseColorScheme.mockReturnValue('dark');
    expect(useTheme()).toBe(dark);
  });

  it('returns the light palette when the OS reports light', () => {
    mockedUseColorScheme.mockReturnValue('light');
    expect(useTheme()).toBe(light);
  });

  it('falls back to the light palette when the OS reports no preference', () => {
    mockedUseColorScheme.mockReturnValue('unspecified');
    expect(useTheme()).toBe(light);
  });
});
