import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { light } from '@/src/theme/palette';

import { RoutineArrangeHint } from './RoutineArrangeHint';

const originalState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(AppState, 'currentState', originalState);
});

it('runs the hint arrow only on a focused, foreground screen', () => {
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  let changeState: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeState = listener;
    return { remove };
  });
  const repeat = jest.spyOn(Reanimated, 'withRepeat');
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  const props = { theme: light, onOpenLesson: jest.fn(), onDismiss: jest.fn(async () => true) };
  const view = render(<RoutineArrangeHint {...props} active={false} />);
  expect(repeat).not.toHaveBeenCalled();
  view.rerender(<RoutineArrangeHint {...props} active />);
  expect(repeat).toHaveBeenCalledTimes(1);
  cancel.mockClear();
  act(() => changeState?.('background'));
  expect(cancel).toHaveBeenCalled();
  expect(repeat).toHaveBeenCalledTimes(1);
  act(() => changeState?.('active'));
  expect(repeat).toHaveBeenCalledTimes(2);
  cancel.mockClear();
  view.rerender(<RoutineArrangeHint {...props} active={false} />);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalled();
});
