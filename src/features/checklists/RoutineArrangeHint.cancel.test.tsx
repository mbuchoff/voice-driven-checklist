import { act, render } from '@testing-library/react-native';
import type { GestureType } from 'react-native-gesture-handler';

import { light } from '@/src/theme/palette';

import { RoutineArrangeHint } from './RoutineArrangeHint';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');

it.each([-1, 1])('does not persist a canceled hint swipe in direction %i', async (direction) => {
  const onDismiss = jest.fn(async () => true);
  render(<RoutineArrangeHint theme={light} onOpenLesson={jest.fn()} onDismiss={onDismiss} />);
  const gesture = getByGestureTestId('routine-arrange-hint-swipe') as GestureType;
  const event = { translationX: direction * 100 };

  await act(async () => {
    gesture.handlers.onUpdate?.(event as never);
    gesture.handlers.onEnd?.(event as never, false);
    gesture.handlers.onFinalize?.(event as never, false);
    await Promise.resolve();
  });

  expect(onDismiss).not.toHaveBeenCalled();
});
