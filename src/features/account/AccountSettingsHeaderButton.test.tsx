import { fireEvent, render, screen } from '@testing-library/react-native';

import { AccountSettingsHeaderButton } from './AccountSettingsHeaderButton';

describe('AccountSettingsHeaderButton', () => {
  it('opens account settings from an accessible header action', () => {
    const onPress = jest.fn();
    render(<AccountSettingsHeaderButton onPress={onPress} />);

    fireEvent.press(
      screen.getByRole('button', { name: /^settings$/i }),
    );

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
