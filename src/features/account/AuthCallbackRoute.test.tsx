import { render, waitFor } from '@testing-library/react-native';

import AuthCallbackRoute from '../../../app/auth/callback';

const mockNavigateBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockNavigateBack }),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

describe('AuthCallbackRoute', () => {
  beforeEach(() => {
    mockNavigateBack.mockClear();
  });

  it('returns to the account screen after the native browser callback', async () => {
    render(<AuthCallbackRoute />);

    await waitFor(() => expect(mockNavigateBack).toHaveBeenCalledTimes(1));
  });
});
