import { act, fireEvent, screen } from '@testing-library/react-native';
import { Platform, processColor, StyleSheet } from 'react-native';
import { type GestureType } from 'react-native-gesture-handler';

import {
  flushRunEffects as flush,
  runSnapshot as snapshot,
  setupRunScreen as setup,
} from './RunScreen.testSupport';
import { getStopControlPresentation } from './RunScreenView';

const { getByGestureTestId } = jest.requireActual(
  'react-native-gesture-handler/lib/commonjs/jestUtils',
) as typeof import('react-native-gesture-handler/lib/typescript/jestUtils');
import { RUN_ITEM_GAP } from './runPresentation';
import type { ChecklistRunSnapshot } from './types';
const defaultPlatformOS = Platform.OS;
const defaultPlatformVersion = Platform.Version;

describe('RunScreen presentation', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => defaultPlatformOS,
    });
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      get: () => defaultPlatformVersion,
    });
  });

  describe('initial render', () => {
    it('shows the checklist title, current item, and progress label', async () => {
      setup();
      await flush();

      expect(screen.getByText('Demo')).toBeOnTheScreen();
      expect(screen.getByText('Item one')).toBeOnTheScreen();
      expect(screen.getByText(/item 1 of 3/i)).toBeOnTheScreen();
    });

    it('exposes only stop and the three run actions as buttons', async () => {
      setup();
      await flush();

      expect(screen.getAllByRole('button')).toHaveLength(4);
    });

    it('uses font-independent vector geometry for the stop icon', async () => {
      setup();
      await flush();

      expect(screen.queryByText('×')).toBeNull();
      expect(screen.getByTestId('stop-run-icon')).toBeOnTheScreen();
    });

    it('renders continuous arcs for checklist and stop progress', async () => {
      setup();
      await flush();

      expect(screen.getByTestId('run-progress-arc')).toBeOnTheScreen();
      expect(screen.getByTestId('stop-progress-arc')).toBeOnTheScreen();
    });

    it('renders the approved solid center and track behind progress', async () => {
      setup();
      await flush();

      const track = screen.getByTestId('run-progress-background').props;
      const center = screen.getByTestId('run-progress-center').props;
      expect(track).toMatchObject({
        fill: null,
        stroke: {
          type: 0,
          payload: processColor('rgba(23, 56, 46, 0.12)'),
        },
      });
      expect(center).toMatchObject({
        fill: { type: 0, payload: processColor('#fffaf3') },
      });
      expect(center.r).toBeLessThan(track.r);
    });

    it('stacks the progress orbit above overflowing checklist rows', async () => {
      setup();
      await flush();

      const orbitStyle = StyleSheet.flatten(
        screen.getByTestId('run-progress-orbit').props.style,
      );
      const stageStyle = StyleSheet.flatten(
        screen.getByTestId('run-items-stage').props.style,
      );
      expect(orbitStyle.zIndex).toBeGreaterThan(stageStyle.zIndex ?? 0);
    });

    it('centers the title independently of the stop control width', async () => {
      setup();
      await flush();

      const titleFrame = StyleSheet.flatten(
        screen.getByTestId('run-title-frame').props.style,
      );
      expect(titleFrame.position).toBe('absolute');
      expect(titleFrame.left).toBe(titleFrame.right);
    });

    it('surrounds the pointer contact and follows it while stopping', async () => {
      setup({ screenReaderEnabled: false });
      await flush();

      expect(getStopControlPresentation({
        width: 52,
        height: 44,
        offsetX: 31,
        offsetY: 27,
      })).toEqual({ size: 76, left: -7, top: -11 });
      expect(getStopControlPresentation({
        width: 56,
        height: 48,
        offsetX: 43,
        offsetY: 35,
      })).toEqual({ size: 80, left: 3, top: -5 });
      const gesture = getByGestureTestId('stop-hold-gesture') as GestureType;
      expect(gesture.handlers.onBegin).toEqual(expect.any(Function));
      expect(gesture.handlers.onUpdate).toEqual(expect.any(Function));
      expect(gesture.handlers.onFinalize).toEqual(expect.any(Function));
    });

    it('begins playback of the first item when playback is available', async () => {
      const { playback } = setup();
      await flush();
      expect(playback.spoken).toEqual(['Item one']);
    });

    it('keeps every snapshot item mounted while only the current row is selected', async () => {
      const longSnapshot: ChecklistRunSnapshot = {
        checklistId: 'long',
        checklistTitle: 'Long routine',
        items: Array.from({ length: 17 }, (_, index) => ({
          id: `long-${index}`,
          text: `Step ${index + 1}`,
          order: index,
        })),
      };
      setup({ snapshot: longSnapshot });
      await flush();

      expect(
        screen.getAllByTestId(/run-item-/, { includeHiddenElements: true }),
      ).toHaveLength(17);
      expect(
        screen.getByText('Step 17', { includeHiddenElements: true }),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('run-item-0').props.accessibilityState).toMatchObject({
        selected: true,
      });

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(
        screen.getAllByTestId(/run-item-/, { includeHiddenElements: true }),
      ).toHaveLength(17);
      expect(screen.getByTestId('run-item-1').props.accessibilityState).toMatchObject({
        selected: true,
      });
    });

    it('lets the full step track extend beyond the focus stage', async () => {
      setup();
      await flush();

      const stageStyle = StyleSheet.flatten(
        screen.getByTestId('run-items-stage').props.style,
      );
      expect(stageStyle.overflow ?? 'visible').toBe('visible');
    });

    it('promotes a background item to the current accessible row', async () => {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        get: () => 'android',
      });
      Object.defineProperty(Platform, 'Version', {
        configurable: true,
        get: () => 36,
      });
      setup();
      await flush();

      fireEvent.press(screen.getByTestId('manual-next'));
      await flush();

      expect(screen.getByTestId('run-item-1').props.accessibilityState).toMatchObject({
        selected: true,
      });
    });

    it('centers variable-height rows on the same track positions', async () => {
      setup({
        snapshot: {
          ...snapshot,
          items: [
            {
              id: 'long',
              text: 'A long step that wraps across several lines on a phone screen',
              order: 0,
            },
            { id: 'short', text: 'Short step', order: 1 },
          ],
        },
      });
      await flush();

      const firstStyle = StyleSheet.flatten(
        screen.getByTestId('run-item-0').props.style,
      );
      const secondStyle = StyleSheet.flatten(
        screen.getByTestId('run-item-1', { includeHiddenElements: true }).props
          .style,
      );
      expect(firstStyle.top).toBe(0);
      expect(secondStyle.top).toBe(RUN_ITEM_GAP);
      expect(firstStyle.transform).toContainEqual({ translateY: '-50%' });
      expect(secondStyle.transform).toContainEqual({ translateY: '-50%' });
    });

    it('leaves vertical space for descenders in the current step text', async () => {
      setup({
        snapshot: {
          ...snapshot,
          items: [
            {
              id: 'glass',
              text: 'Drink a full glass of water',
              order: 0,
            },
          ],
        },
      });
      await flush();

      const textStyle = StyleSheet.flatten(
        screen.getByText('Drink a full glass of water').props.style,
      );
      expect(textStyle.lineHeight).toBeGreaterThan(textStyle.fontSize);
    });

    it('waits for the Android voice run startup before speaking the first item', async () => {
      let resolveStartup!: () => void;
      const startupFinished = new Promise<void>((resolve) => {
        resolveStartup = resolve;
      });
      const { playback, recognition } = setup({
        onVoiceRunStart: jest.fn(() => startupFinished),
      });
      await flush();

      expect(playback.spoken).toEqual([]);
      expect(recognition.startCount).toBe(0);

      await act(async () => {
        resolveStartup();
        await startupFinished;
      });
      await flush();

      expect(playback.spoken).toEqual(['Item one']);
      expect(recognition.startCount).toBe(0);
    });

    it('does not start recognition while speaking', async () => {
      const { recognition } = setup();
      await flush();
      expect(recognition.startCount).toBe(0);
      expect(recognition.isListening()).toBe(false);
    });

    it('starts recognition once playback finishes', async () => {
      const { playback, recognition } = setup();
      await flush();

      playback.completePlayback();
      await flush();

      expect(recognition.startCount).toBe(1);
      expect(recognition.isListening()).toBe(true);
    });
  });
});
