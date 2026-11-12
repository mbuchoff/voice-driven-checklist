import { act, fireEvent, screen } from '@testing-library/react-native';
import { Keyboard, ScrollView } from 'react-native';

import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { RoutineEditor } from './RoutineEditor';
import {
  editing,
  getByGestureTestId,
  setupEditorDatabase as setupDb,
  tapToEdit,
} from './RoutineEditor.testSupport';
import { createRoutine } from './repository';

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  describe('edit mode', () => {
    it('reveals a tapped existing step instead of scrolling to the routine end', async () => {
      jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          callback(0);
          return 1;
        });
      const scrollTo = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(jest.fn());
      const scrollToEnd = jest
        .spyOn(ScrollView.prototype, 'scrollToEnd')
        .mockImplementation(jest.fn());
      const keyboardListener = jest.spyOn(Keyboard, 'addListener');
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'keep the selected row visible',
        steps: Array.from({ length: 8 }, (_, index) => ({
          text: `step ${index + 1}`,
        })),
      });
      await renderWithDatabase(
        <RoutineEditor
          mode={editing(existing)}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );
      fireEvent(screen.getByTestId('routine-editor-scroll'), 'layout', {
        nativeEvent: {
          layout: { x: 0, y: 84, width: 360, height: 500 },
        },
      });

      // Step 7 sits 336–392 dp down the list.
      fireEvent(screen.getByTestId('step-row-6'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 336, width: 360, height: 56 } },
      });

      tapToEdit(6);
      const keyboardShown = keyboardListener.mock.calls
        .filter(([event]) => event === 'keyboardDidShow')
        .at(-1);
      expect(keyboardShown).toBeDefined();
      act(() => {
        keyboardShown?.[1]({ endCoordinates: { screenY: 400 } } as never);
      });

      // 316 dp of list show above the keyboard (400 − 84), so the step's
      // bottom plus 24 dp (392 + 24) needs the list scrolled by 100.
      expect(scrollTo).toHaveBeenCalledWith({ y: 100, animated: true });
      expect(scrollToEnd).not.toHaveBeenCalled();
    });

    it('says beside "Steps" that holding a step moves it', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, { title: 'hint', steps: [{ text: 'a' }] });
      await renderWithDatabase(
        <RoutineEditor mode={editing(existing)} onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      expect(screen.getByText(/hold to move/)).toBeOnTheScreen();
    });

    it('opens a step for typing after a quick tap, and closes it when it loses focus', async () => {
      const database = await setupDb();
      const existing = await createRoutine(database, {
        title: 'keep drag',
        steps: [{ text: 'hold this text' }],
      });
      await renderWithDatabase(
        <RoutineEditor mode={editing(existing)} onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );
      expect(screen.queryByTestId('step-text-0')).toBeNull();

      const localId = screen.getByTestId('step-row-0').props.nativeID;
      const editGesture = getByGestureTestId(`step-edit-gesture-${localId}-0`);
      expect(editGesture.config.maxDurationMs).toBeLessThan(350);
      act(() => {
        editGesture.handlers.onEnd?.({} as never, true);
      });
      expect(screen.getByTestId('step-text-0').props.value).toBe('hold this text');

      await act(async () => {
        fireEvent(screen.getByTestId('step-text-0'), 'blur');
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.queryByTestId('step-text-0')).toBeNull();
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('hold this text');
    });
  });
});
