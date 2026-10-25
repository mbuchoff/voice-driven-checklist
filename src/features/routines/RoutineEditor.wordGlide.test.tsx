import { act, fireEvent, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import {
  existing,
  HIDDEN,
  layOutChips,
  renderEditor,
  setupEditorDatabase as setupDb,
  tapToEdit,
} from './RoutineEditor.testSupport';

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('a long step’s words', () => {
    const LONG = 'Drink a full glass of water before making breakfast';
    const CLOSED_LINES = [0, 0, 0, 0, 0, 1, 1, 1, 2];
    const OPENED_LINES = [0, 0, 0, 0, 0, 0, 0, 0, 1];
    /** Jest doesn't lay out views: where each word sits in the two layouts. */
    function layOutWords(index: number, names: [string, string], lines: [number[], number[]]) {
      fireEvent(screen.getByTestId(`word-space-${index}-${names[0]}`, HIDDEN), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 5, height: 26 } },
      });
      names.forEach((name, side) => {
        // Each line's words start at the left again.
        lines[side].forEach((line, i) => {
          const firstOnLine = lines[side].indexOf(line);
          fireEvent(screen.getByTestId(`word-measure-${index}-${name}-${i}`, HIDDEN), 'layout', {
            nativeEvent: { layout: { x: (i - firstOnLine) * 10, y: line * 26, width: 9, height: 26 } },
          });
        });
      });
    }
    async function longStep() {
      const database = await setupDb();
      const editor = await renderEditor(
        { initialRoutine: await existing(database, { steps: [{ text: LONG, timerSeconds: null }] }) },
        { database },
      );
      fireEvent(screen.getByTestId('step-textbox-0'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 100 } },
      });
      return editor;
    }
    const fieldOpacity = () => StyleSheet.flatten(screen.getByTestId('step-text-0').props.style).opacity;
    /** Android's font size setting, as the phone reports it. */
    function setFontScale(fontScale: number) {
      const { window, screen: display } = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
      act(() => Dimensions.set({ window: { ...window, fontScale }, screen: { ...display, fontScale } }));
    }
    const initialFontScale = Dimensions.get('window').fontScale;
    afterEach(() => setFontScale(initialFontScale));
    // Jest's Reanimated stand-in ends an animation at once; here a glide
    // ends when the test says.
    let animationEnds: ((finished: boolean) => void)[] = [];
    beforeEach(() => {
      animationEnds = [];
      jest.spyOn(Reanimated, 'withTiming').mockImplementation(((value, _config, callback) => {
        if (callback) animationEnds.push(callback);
        return value;
      }) as typeof Reanimated.withTiming);
    });
    const glidesEnd = () => act(async () => {
      animationEnds.splice(0).forEach((end) => end(true));
    });

    it('glide to their new lines as the step opens, then the field takes over', async () => {
      await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);
      tapToEdit(0);

      expect(screen.getByTestId('word-glide-0')).toBeOnTheScreen();
      expect(fieldOpacity()).toBe(0);
      // The box still sits where it was closed, so the words' layer starts
      // 34 to its left, where the box ends up.
      expect(StyleSheet.flatten(screen.getByTestId('word-glide-layer-0').props.style).transform).toEqual([{ translateX: -34 }]);

      await glidesEnd();

      expect(screen.queryByTestId('word-glide-0')).toBeNull();
      expect(fieldOpacity()).not.toBe(0);
    });

    it('are measured for the closed box the step will have after a timer is set while it’s open', async () => {
      // Closed and untimed, its text box was measured 300 wide; opened, it
      // reports nothing more (its last layout comes while it's still moving).
      await longStep();
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('step-chip-0-120'));
      // The time badge that will show when it closes is 60 wide (and the row's gap 8).
      fireEvent(screen.getByTestId('step-clock-measure-0', HIDDEN), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 60, height: 34 } },
      });

      fireEvent(screen.getByTestId('word-space-0-closed', HIDDEN), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 5, height: 26 } },
      });

      const closed = StyleSheet.flatten(screen.getByTestId('word-layout-0-closed', HIDDEN).props.style);
      // Closed, the time and the row's gap before it take 60 + 8 of the 300;
      // less the text box's padding on both sides.
      expect(closed.width).toBe(300 - 60 - 8 - 2 * 6);
    });

    it('glide from where they were as the step closes: their layer sits where the box ends up', async () => {
      await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);
      tapToEdit(0);
      await glidesEnd();

      fireEvent(screen.getByTestId('step-text-0'), 'submitEditing');

      // The box is still where it was open, 34 left of its closed place, so
      // the words' layer starts 34 to its right.
      const layer = StyleSheet.flatten(screen.getByTestId('word-glide-layer-0').props.style);
      expect(layer.transform).toEqual([{ translateX: 34 }]);
    });

    it('hand the field back at once when it is typed into during the glide', async () => {
      await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);
      tapToEdit(0);
      expect(screen.getByTestId('word-glide-0')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByTestId('step-text-0'), `${LONG} today`);

      expect(screen.queryByTestId('word-glide-0')).toBeNull();
      expect(screen.getByTestId('step-text-0').props.value).toBe(`${LONG} today`);
      expect(fieldOpacity()).not.toBe(0);
    });

    it('hand the field back at once when it is typed into while they’re measured', async () => {
      await longStep();
      tapToEdit(0);
      expect(screen.getByTestId('word-hold-0')).toBeOnTheScreen();

      fireEvent.changeText(screen.getByTestId('step-text-0'), `${LONG} today`);

      expect(screen.queryByTestId('word-hold-0')).toBeNull();
      expect(fieldOpacity()).not.toBe(0);
    });

    it('glide on lines as tall as the enlarged text when the font size is larger', async () => {
      setFontScale(1.5);
      const { renderAgain } = await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);

      tapToEdit(0);
      renderAgain();

      // It eases to the opened words' two lines, each 26 × 1.5 tall, inside the box's padding.
      expect(StyleSheet.flatten(screen.getByTestId('word-glide-0').props.style).height).toBe(2 * 26 * 1.5 + 2 * 11);
    });

    it('are measured again when the font size changes', async () => {
      await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);
      setFontScale(1.5);

      tapToEdit(0);

      expect(screen.getByTestId('word-hold-0')).toBeOnTheScreen();
      expect(screen.queryByTestId('word-glide-0')).toBeNull();
    });

    it('ride along when the step has a line break of its own', async () => {
      const database = await setupDb();
      await renderEditor(
        { initialRoutine: await existing(database, { steps: [{ text: 'Drink a full glass\nof water', timerSeconds: null }] }) },
        { database },
      );
      fireEvent(screen.getByTestId('step-textbox-0'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 100 } },
      });

      tapToEdit(0);

      expect(screen.queryByTestId('word-hold-0')).toBeNull();
      expect(screen.queryByTestId('word-glide-0')).toBeNull();
      expect(fieldOpacity()).not.toBe(0);
    });

    it('stay put when their lines don’t change', async () => {
      await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, CLOSED_LINES]);

      tapToEdit(0);

      expect(screen.queryByTestId('word-glide-0')).toBeNull();
      expect(fieldOpacity()).not.toBe(0);
    });

    it('hold their old lines until they’re measured, when the step opens before that', async () => {
      await longStep();

      tapToEdit(0);

      expect(screen.getByTestId('word-hold-0')).toHaveTextContent(LONG);
      expect(fieldOpacity()).toBe(0);
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);
      expect(screen.queryByTestId('word-hold-0')).toBeNull();
      expect(screen.getByTestId('word-glide-0')).toBeOnTheScreen();
    });
  });
});
