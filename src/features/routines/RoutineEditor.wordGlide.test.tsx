import { act, fireEvent, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import {
  existing,
  HIDDEN,
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

    it('glide to their new lines as the step opens, then the field takes over', async () => {
      await longStep();
      layOutWords(0, ['closed', 'opened'], [CLOSED_LINES, OPENED_LINES]);
      jest.useFakeTimers();
      try {
        tapToEdit(0);

        expect(screen.getByTestId('word-glide-0')).toBeOnTheScreen();
        expect(fieldOpacity()).toBe(0);

        act(() => jest.advanceTimersByTime(160 + 8 * 12 + 50));

        expect(screen.queryByTestId('word-glide-0')).toBeNull();
        expect(fieldOpacity()).not.toBe(0);
      } finally {
        jest.useRealTimers();
      }
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
