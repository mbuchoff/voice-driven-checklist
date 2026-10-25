import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { formatTimerLong } from '../timerFormat';
import { stepCaption, stepWords, type StepperState } from '../timers';
import { EditorSheet, SheetActions, SheetButton, SheetTitle } from './EditorSheet';
import { PanelQuickPicks } from './TimerChips';

/** A held − or + presses again after this long, then repeatedly. */
export const HOLD_REPEAT_DELAY_MS = 400;
export const HOLD_REPEAT_MS = 150;

function StepperButton({
  colors,
  dir,
  stepper,
  disabled,
  onPress,
}: {
  colors: EditorColors;
  dir: -1 | 1;
  stepper: StepperState;
  disabled: boolean;
  onPress: () => void;
}) {
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const pressRef = useRef(onPress);
  pressRef.current = onPress;
  const stop = () => {
    if (delay.current) clearTimeout(delay.current);
    if (repeat.current) clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  };
  useEffect(() => stop, []);
  const words = stepWords(stepper, dir);
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable
        testID={dir < 0 ? 'timer-minus' : 'timer-plus'}
        accessibilityRole="button"
        accessibilityLabel={`${dir < 0 ? 'Subtract' : 'Add'} ${words}`}
        accessibilityState={{ disabled }}
        onPressIn={() => {
          if (disabled) return;
          pressRef.current();
          stop();
          delay.current = setTimeout(() => {
            repeat.current = setInterval(() => pressRef.current(), HOLD_REPEAT_MS);
          }, HOLD_REPEAT_DELAY_MS);
        }}
        onPressOut={stop}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Icon name={dir < 0 ? 'minus' : 'plus'} color={colors.ink} size={22} strokeWidth={2.5} />
      </Pressable>
      <Text
        accessible={false}
        style={{ color: colors.muted, fontSize: 15, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}
      >
        {stepCaption(stepper, dir)}
      </Text>
    </View>
  );
}

export function TimerPanel({
  colors,
  stepNumber,
  stepText,
  value,
  stepper,
  quickPicks,
  quickPickWidths,
  onStep,
  onPick,
  onClear,
  onDone,
}: {
  colors: EditorColors;
  stepNumber: number;
  stepText: string;
  value: number | null;
  stepper: StepperState;
  quickPicks: number[];
  /** How wide each quick pick is (ChipWidths.panel). */
  quickPickWidths: Record<number, number>;
  onStep: (dir: -1 | 1) => void;
  onPick: (seconds: number) => void;
  onClear: () => void;
  onDone: () => void;
}) {
  return (
    <EditorSheet colors={colors} onDismiss={onDone} testID="timer-panel" accessibilityLabel="Timer">
      {/* One block, so the sheet's gap doesn't space out the panel's parts. */}
      <View>
      <SheetTitle colors={colors}>Timer</SheetTitle>
      <Text
        numberOfLines={1}
        style={{ color: colors.muted, fontSize: 16, lineHeight: 19, marginTop: -4, marginBottom: 6 }}
      >
        {`Step ${stepNumber}: ${stepText}`}
      </Text>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Timer length"
        style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 18, paddingTop: 6, paddingBottom: 4 }}
      >
        <StepperButton colors={colors} dir={-1} stepper={stepper} disabled={!value} onPress={() => onStep(-1)} />
        <View style={{ minWidth: 130, height: 56, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            testID="timer-readout"
            accessibilityLiveRegion="polite"
            style={{
              fontSize: 30,
              lineHeight: 36,
              fontWeight: value ? '800' : '700',
              color: value ? colors.ink : colors.muted,
              fontVariant: ['tabular-nums'],
            }}
          >
            {value ? formatTimerLong(value) : 'Off'}
          </Text>
        </View>
        <StepperButton colors={colors} dir={1} stepper={stepper} disabled={false} onPress={() => onStep(1)} />
      </View>
      <PanelQuickPicks colors={colors} candidates={quickPicks} widths={quickPickWidths} selected={value} onPick={onPick} />
      <SheetActions>
        <SheetButton
          colors={colors}
          variant="keep"
          label="No timer"
          testID="timer-none"
          disabled={!value}
          onPress={onClear}
        />
        <SheetButton colors={colors} variant="done" label="Done" testID="timer-done" onPress={onDone} />
      </SheetActions>
      </View>
    </EditorSheet>
  );
}
