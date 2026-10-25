import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';

import { Icon } from '@/src/components/Icon';
import { notify } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useDevicePreferences } from '@/src/features/settings/DevicePreferencesProvider';
import { useTheme } from '@/src/theme/useTheme';

import { editorColors } from './editorColors';
import { EditorTopBar } from './editor/EditorTopBar';
import {
  EditorSheet,
  SheetActions,
  SheetBody,
  SheetButton,
  SheetTitle,
} from './editor/EditorSheet';
import { RoutineHeroCard } from './editor/RoutineHeroCard';
import { DeletedStepRow, StepRow } from './editor/StepRow';
import { NumberBadge } from './editor/NumberBadge';
import { STEP_WORDS, TEXT_PAD } from './editor/stepRowMetrics';
import { StepTimerChips } from './editor/TimerChips';
import { TimerPanel } from './editor/TimerPanel';
import { createRoutine, deleteRoutine, updateRoutine } from './repository';
import { moveItem } from './reorder';
import {
  addStep,
  canSave,
  countedStepCount,
  createEditorState,
  deleteStep,
  editorSnapshot,
  expireDeletedStep,
  isDirty,
  leaveOpenStep,
  moveStep,
  openStep,
  pressEnter,
  realSteps,
  routineInput,
  setColor,
  setStepText,
  setStepTimer,
  setTitle,
  timedTotal,
  undoDeleteStep,
  type EditorState,
} from './routineEditorModel';
import { routineColor } from './routineColors';
import {
  chipCandidates,
  countLine,
  initialStepper,
  pressStepper,
  type StepperState,
} from './timers';
import type { DeletedRoutine, Routine } from './types';
import { scrollToKeepAboveKeyboard } from './keepAboveKeyboard';
import { STEP_MAKE_ROOM, useStepReorder } from './useStepReorder';

const EDITOR_KEYBOARD_OFFSET = 24;
/** A swiped-away step's UNDO stays this long (longer if TalkBack asks). */
const STEP_UNDO_MS = 5000;
const UNDO_CLOSE_UP_MS = 280;

export type RoutineEditorProps = {
  initialRoutine?: Routine;
  /** The color a new routine starts with. */
  newColorKey?: string;
  onSaved: (saved: Routine) => void;
  /** Leave without saving (nothing changed, or the changes were discarded). */
  onCancel: () => void;
  onDeleted?: (deleted: DeletedRoutine) => void;
  /** Start a run of the saved routine. */
  onRun?: (routine: Routine) => void;
};

export function focusEditorInput(input: { focus: () => void } | null) {
  input?.focus();
}

type ChipsState = { stepId: string; candidates: number[] };
type PanelState = {
  stepId: string;
  openedValue: number | null;
  stepper: StepperState;
  quickPicks: number[];
};
type Sheet = 'leave' | 'delete' | null;

export function RoutineEditor({
  initialRoutine,
  newColorKey,
  onSaved,
  onCancel,
  onDeleted,
  onRun,
}: RoutineEditorProps) {
  const database = useDatabase();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences, rememberTimerSeconds } = useDevicePreferences();
  const [model, setModel] = useState<EditorState>(() =>
    createEditorState({ routine: initialRoutine, colorKey: newColorKey }),
  );
  const [baseline] = useState(() => editorSnapshot(model));
  const modelRef = useRef(model);
  modelRef.current = model;
  // When the focused field disappears, Android hands focus to the next
  // focusable view (often the name) and keeps the keyboard up. A step that
  // closes lets go of the keyboard while its field is still there.
  const releaseOpenStep = () => {
    if (modelRef.current.openId) Keyboard.dismiss();
  };
  // A tap that opens a step hands the keyboard to a hidden holder first, and
  // the step's field takes it from the holder once it exists. Android ignores
  // a request to show the keyboard for a field it hasn't laid out yet, and
  // moving from another step this way keeps the keyboard up while the old
  // field is still there, so the name never shows focus on the way.
  const keyboardHolderRef = useRef<ComponentRef<typeof TextInput>>(null);
  const holdKeyboard = () => keyboardHolderRef.current?.focus();
  const colors = useMemo(() => editorColors(theme, model.colorKey), [theme, model.colorKey]);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  const inputRefs = useRef<Record<string, ComponentRef<typeof TextInput> | null>>({});
  const viewportTop = useRef(0);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const viewportHeight = useRef(0);
  const heroY = useRef(0);
  const titleRow = useRef<{ y: number; height: number } | null>(null);
  const sectionY = useRef(0);
  const groupY = useRef(0);
  const rowLayouts = useRef<Record<string, { y: number; height: number }>>({});
  const scrollToId = useRef<string | null>(null);
  const keepOpenOnBlur = useRef(false);
  const undoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [chips, setChips] = useState<ChipsState | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [keyboardClearance, setKeyboardClearance] = useState(0);
  const [deletedHeights, setDeletedHeights] = useState<Record<string, number>>({});
  const [closingRows, setClosingRows] = useState<Record<string, boolean>>({});
  const [saveBarHeight, setSaveBarHeight] = useState(0);
  const [busy, setBusy] = useState(false);

  const steps = realSteps(model);
  const counted = countedStepCount(model);
  const summary = countLine(counted, timedTotal(model));
  const dirty = isDirty(model, baseline);
  const wantsSave = model.isNew || dirty;
  const saveAllowed = canSave(model);
  const canRun = !model.isNew && !dirty && steps.some((step) => step.text.trim());
  const colorLabel = routineColor(model.colorKey).name;

  const expireAllUndoRows = useCallback(() => {
    for (const timer of Object.values(undoTimers.current)) clearTimeout(timer);
    undoTimers.current = {};
    setModel((state) => ({ ...state, rows: state.rows.filter((row) => row.kind === 'step') }));
  }, []);

  const reorder = useStepReorder({
    items: steps.map(({ localId, text }) => ({ localId, text })),
    onMove: (from, to) => setModel((state) => moveStep(state, from, to)),
    scrollRef,
    onDragStart: () => {
      releaseOpenStep();
      expireAllUndoRows();
      setModel((state) => leaveOpenStep(state));
    },
  });

  // Keep the step being typed in, with its chips, above the keyboard.
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardClearance(Math.max(0, Dimensions.get('screen').height - event.endCoordinates.screenY));
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setKeyboardClearance(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const scrollOpenStepIntoView = useCallback(() => {
    const id = modelRef.current.openId;
    const row = id ? rowLayouts.current[id] : null;
    if (!row || keyboardTop.current == null) return;
    const top = sectionY.current + groupY.current + row.y;
    const target = scrollToKeepAboveKeyboard({
      top,
      bottom: top + row.height,
      scrollY: scrollY.current,
      viewportTop: viewportTop.current,
      keyboardTop: keyboardTop.current,
      margin: EDITOR_KEYBOARD_OFFSET,
    });
    if (target != null) scrollRef.current?.scrollTo({ y: target, animated: true });
  }, []);

  useEffect(() => {
    if (!model.openId) return;
    const frame = requestAnimationFrame(() => focusEditorInput(inputRefs.current[model.openId!]));
    return () => cancelAnimationFrame(frame);
  }, [model.openId]);

  useEffect(() => {
    if (!model.openId || keyboardClearance <= 0) return;
    const frame = requestAnimationFrame(scrollOpenStepIntoView);
    return () => cancelAnimationFrame(frame);
  }, [model.openId, keyboardClearance, scrollOpenStepIntoView]);

  // An open step shows its times, which stay the same while it's open so
  // they don't change under the finger.
  const recentTimes = useRef(preferences.recentTimerSeconds);
  recentTimes.current = preferences.recentTimerSeconds;
  const chipsFor = useCallback((id: string | null): ChipsState | null => {
    const step = id ? realSteps(modelRef.current).find((candidate) => candidate.localId === id) : undefined;
    return step ? { stepId: step.localId, candidates: chipCandidates(step.timerSeconds, recentTimes.current) } : null;
  }, []);
  useEffect(() => {
    setChips(chipsFor(model.openId));
  }, [chipsFor, model.openId]);

  useEffect(() => () => {
    for (const timer of Object.values(undoTimers.current)) clearTimeout(timer);
  }, []);

  // Before a sheet opens or the editor leaves: a native tap doesn't blur
  // the field being typed in, so the keyboard would stay up over the sheet.
  const settle = useCallback((): EditorState => {
    Keyboard.dismiss();
    const settled = leaveOpenStep(modelRef.current);
    modelRef.current = settled;
    setModel(settled);
    return settled;
  }, []);

  const open = (id: string) => {
    holdKeyboard();
    setColorsOpen(false);
    setModel((state) => openStep(state, id));
  };

  const add = () => {
    const id = uuidv4();
    holdKeyboard();
    setColorsOpen(false);
    scrollToId.current = id;
    setModel((state) => addStep(state, id));
  };

  const onStepBlur = (id: string) => {
    if (keepOpenOnBlur.current) return;
    setTimeout(() => {
      if (keepOpenOnBlur.current) return;
      const focused = inputRefs.current[id]?.isFocused?.();
      if (!focused && modelRef.current.openId === id) {
        setModel((state) => (state.openId === id ? leaveOpenStep(state) : state));
      }
    }, 0);
  };

  // The times stay while the step is open; "No timer" isn't remembered.
  const pickChip = (id: string, seconds: number | null) => {
    setModel((state) => setStepTimer(state, id, seconds));
    if (seconds) void rememberTimerSeconds(seconds);
  };

  const openPanel = (id: string) => {
    const step = steps.find((candidate) => candidate.localId === id);
    if (!step) return;
    keepOpenOnBlur.current = true;
    Keyboard.dismiss();
    setPanel({
      stepId: id,
      openedValue: step.timerSeconds,
      stepper: initialStepper(),
      quickPicks: chipCandidates(step.timerSeconds, preferences.recentTimerSeconds),
    });
  };

  const panelStep = panel ? steps.find((step) => step.localId === panel.stepId) : undefined;

  const closePanel = () => {
    if (!panel) return;
    const value = panelStep?.timerSeconds ?? null;
    if (value && value !== panel.openedValue) void rememberTimerSeconds(value);
    setPanel(null);
    const stepId = panel.stepId;
    // Back to typing, with the step's times again, its new one among them.
    if (modelRef.current.openId === stepId) setChips(chipsFor(stepId));
    requestAnimationFrame(() => {
      keepOpenOnBlur.current = false;
      if (modelRef.current.openId === stepId) focusEditorInput(inputRefs.current[stepId]);
    });
  };

  const stepPanel = (dir: -1 | 1) => {
    if (!panel || !panelStep) return;
    const next = pressStepper(panel.stepper, panelStep.timerSeconds, dir);
    setPanel({ ...panel, stepper: next.state });
    setModel((state) => setStepTimer(state, panel.stepId, next.value));
  };

  // Picking the time the step already has does nothing (the stepper keeps
  // its level).
  const pickPanelTime = (seconds: number | null) => {
    if (!panel || seconds === (panelStep?.timerSeconds ?? null)) return;
    setPanel({ ...panel, stepper: initialStepper() });
    setModel((state) => setStepTimer(state, panel.stepId, seconds));
  };

  const removeStep = (id: string, height: number) => {
    setChips((current) => (current?.stepId === id ? null : current));
    setDeletedHeights((current) => ({ ...current, [id]: height }));
    setModel((state) => deleteStep(state, id));
    void AccessibilityInfo.announceForAccessibility?.('Step deleted');
    const startExpiry = (ms: number) => {
      undoTimers.current[id] = setTimeout(() => {
        setClosingRows((current) => ({ ...current, [id]: true }));
        undoTimers.current[id] = setTimeout(() => {
          delete undoTimers.current[id];
          setModel((state) => expireDeletedStep(state, id));
          setClosingRows((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
        }, UNDO_CLOSE_UP_MS);
      }, ms);
    };
    if (Platform.OS === 'android' && AccessibilityInfo.getRecommendedTimeoutMillis) {
      void AccessibilityInfo.getRecommendedTimeoutMillis(STEP_UNDO_MS).then(
        (ms) => startExpiry(Math.max(STEP_UNDO_MS, ms)),
        () => startExpiry(STEP_UNDO_MS),
      );
    } else {
      startExpiry(STEP_UNDO_MS);
    }
  };

  const undoRemove = (id: string) => {
    clearTimeout(undoTimers.current[id]);
    delete undoTimers.current[id];
    setModel((state) => undoDeleteStep(state, id));
  };

  const persist = async (state: EditorState): Promise<Routine> => {
    const input = routineInput(state);
    return initialRoutine
      ? updateRoutine(database, initialRoutine.id, input)
      : createRoutine(database, input);
  };

  const save = async () => {
    const settled = settle();
    if (!canSave(settled) || busy) return;
    setBusy(true);
    try {
      onSaved(await persist(settled));
    } finally {
      setBusy(false);
    }
  };

  // ▶ only shows when nothing is unsaved, so the saved routine is what runs.
  const play = () => {
    Keyboard.dismiss();
    if (initialRoutine && onRun) onRun(initialRoutine);
  };

  const back = () => {
    const settled = settle();
    if (isDirty(settled, baseline)) setSheet('leave');
    else onCancel();
  };

  const confirmDelete = async () => {
    if (!initialRoutine || !onDeleted) return;
    setSheet(null);
    try {
      const deleted = await deleteRoutine(database, initialRoutine.id);
      if (deleted) onDeleted(deleted);
      else onCancel();
    } catch {
      await notify('Delete failed', 'Your routine was not deleted. Try again.');
    }
  };

  // Android Back: the keyboard closes first (by the system), then an open
  // panel, sheet or color grid, then it works like the back arrow.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panel) closePanel();
      else if (sheet) setSheet(null);
      else if (colorsOpen) setColorsOpen(false);
      else back();
      return true;
    });
    return () => subscription.remove();
  });

  const onScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    reorder.onScroll(event as never);
    const y = event.nativeEvent.contentOffset.y;
    scrollY.current = y;
    // The bar folds once the name has scrolled up under it.
    const row = titleRow.current;
    setCollapsed(!!row && y > heroY.current + row.y + row.height);
  };

  const onRowLayout = (localId: string, index: number, event: LayoutChangeEvent) => {
    reorder.onRowLayout(index, event);
    const { y, height } = event.nativeEvent.layout;
    rowLayouts.current[localId] = { y, height };
    if (scrollToId.current === localId) {
      scrollToId.current = null;
      const target = sectionY.current + groupY.current + y + height / 2 - viewportHeight.current / 2;
      scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
    }
  };

  // While a step is dragged, the numbers follow it.
  const drag = reorder.drag;
  const numbers = useMemo(() => {
    const order = drag ? moveItem(steps.map((step) => step.localId), drag.from, drag.to) : steps.map((step) => step.localId);
    return Object.fromEntries(order.map((id, index) => [id, index + 1]));
  }, [drag, steps]);

  const fabVisible = !model.openId;
  const fabBottom = (wantsSave ? saveBarHeight : insets.bottom) + 16;

  let stepIndex = 0;
  let dropIndex = 0;
  // One slot that moves along (and glides, like the steps) as the dragged
  // step passes others.
  const renderDropSlot = (index: number) =>
    drag?.to === index ? (
      <Animated.View
        key="drop-slot"
        testID={`item-drop-target-${index}`}
        layout={STEP_MAKE_ROOM}
        style={{ height: drag.height, backgroundColor: colors.dragSlot }}
      />
    ) : null;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="editor-safe-area"
      style={{ flex: 1, backgroundColor: colors.tint }}
    >
      <EditorTopBar
        colors={colors}
        collapsed={collapsed}
        isNew={model.isNew}
        title={model.title}
        countLine={summary}
        canRun={canRun}
        onBack={back}
        onDelete={() => {
          settle();
          setSheet('delete');
        }}
        onPlay={play}
      />
      <ScrollView
        ref={scrollRef}
        testID="routine-editor-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 96 + keyboardClearance,
          gap: 22,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        scrollEnabled={!drag}
        onLayout={(event) => {
          viewportTop.current = event.nativeEvent.layout.y;
          viewportHeight.current = event.nativeEvent.layout.height;
          reorder.onViewportLayout(event);
        }}
        onContentSizeChange={(_, height) => {
          reorder.setContentHeight(height);
          if (keyboardClearance > 0) scrollOpenStepIntoView();
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View onLayout={(event) => { heroY.current = event.nativeEvent.layout.y; }}>
          <RoutineHeroCard
            ref={titleRef}
            colors={colors}
            title={model.title}
            countLine={summary}
            colorKey={model.colorKey}
            colorLabel={colorLabel}
            colorsOpen={colorsOpen}
            onChangeTitle={(title) => setModel((state) => setTitle(state, title))}
            onTitleFocus={() => setModel((state) => leaveOpenStep(state))}
            onOpenColors={() => {
              settle();
              setColorsOpen(true);
            }}
            onCloseColors={() => setColorsOpen(false)}
            onPickColor={(key) => {
              setModel((state) => setColor(state, key));
              setColorsOpen(false);
            }}
            onTitleRowLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              titleRow.current = { y, height };
            }}
          />
        </View>

        <View
          style={{ gap: 10 }}
          onLayout={(event) => { sectionY.current = event.nativeEvent.layout.y; }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingHorizontal: 2 }}>
            <Text accessibilityRole="header" style={{ flex: 1, color: colors.text, fontSize: 16, lineHeight: 19, fontWeight: '700' }}>
              Steps
            </Text>
            <Text style={{ flexShrink: 1, color: colors.muted2, fontSize: 15, lineHeight: 18, textAlign: 'right' }}>
              Tap to edit · hold to move · swipe to delete
            </Text>
          </View>

          <View
            onLayout={(event) => { groupY.current = event.nativeEvent.layout.y; }}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 20,
              backgroundColor: colors.surface,
              boxShadow: `0 2px 6px ${colors.shadow}`,
              overflow: 'hidden',
            }}
          >
            {model.rows.length === 0 ? (
              <View style={{ minHeight: 56, paddingHorizontal: 16, justifyContent: 'center' }}>
                <Text style={{ color: colors.muted, fontSize: 15 }}>Tap + to add your first step</Text>
              </View>
            ) : null}
            {model.rows.map((row, rowIndex) => {
              if (row.kind === 'deleted') {
                return (
                  <DeletedStepRow
                    key={row.localId}
                    index={rowIndex}
                    colors={colors}
                    height={deletedHeights[row.localId] ?? 56}
                    first={rowIndex === 0}
                    closing={!!closingRows[row.localId]}
                    onUndo={() => undoRemove(row.localId)}
                  />
                );
              }
              const index = stepIndex;
              stepIndex += 1;
              const isActive = drag?.localId === row.localId;
              const slot = isActive ? null : renderDropSlot(dropIndex);
              if (!isActive) dropIndex += 1;
              const isOpen = model.openId === row.localId;
              // The open step's times fold open with it (and away while the
              // timer panel shows). Every step's chips are measured ahead of
              // time, so they're ready the moment it opens; the open step's
              // set then stays fixed.
              const chipsOpen = isOpen && !panel;
              const candidates = chips?.stepId === row.localId
                ? chips.candidates
                : chipCandidates(row.timerSeconds, preferences.recentTimerSeconds);
              return (
                <Fragment key={row.localId}>
                  {slot}
                  <StepRow
                    colors={colors}
                    index={index}
                    number={numbers[row.localId] ?? index + 1}
                    localId={row.localId}
                    text={row.text}
                    timerSeconds={row.timerSeconds}
                    open={isOpen}
                    first={rowIndex === 0 && !slot}
                    hidden={isActive}
                    makesRoom={!!drag && !isActive}
                    holdGesture={reorder.gestureFor({ localId: row.localId, text: row.text }, index)}
                    inputRef={(input) => { inputRefs.current[row.localId] = input; }}
                    onLayout={(event) => onRowLayout(row.localId, index, event)}
                    onOpen={() => open(row.localId)}
                    onChangeText={(text) => setModel((state) => setStepText(state, row.localId, text))}
                    onEnter={() => {
                      const id = uuidv4();
                      if (pressEnter(modelRef.current, id).openId) holdKeyboard();
                      else releaseOpenStep();
                      scrollToId.current = id;
                      setModel((state) => pressEnter(state, id));
                    }}
                    onBlur={() => onStepBlur(row.localId)}
                    onDelete={(height) => removeStep(row.localId, height)}
                    onMoveEarlier={() => reorder.moveItemByAction(index, -1)}
                    onMoveLater={() => reorder.moveItemByAction(index, 1)}
                    chips={
                      <StepTimerChips
                        colors={colors}
                        index={index}
                        open={chipsOpen}
                        candidates={candidates}
                        selected={row.timerSeconds}
                        stepNumber={numbers[row.localId] ?? index + 1}
                        onPick={(seconds) => pickChip(row.localId, seconds)}
                        onMore={() => openPanel(row.localId)}
                      />
                    }
                  />
                </Fragment>
              );
            })}
            {renderDropSlot(steps.length - 1)}
          </View>

          <Text style={{ color: colors.muted2, fontSize: 15, lineHeight: 20, paddingHorizontal: 4 }}>
            Press ✓ on the keyboard when you’re done with a step; your typing is kept either way.
          </Text>
        </View>
        {reorder.dragPreview ? (
          <DragPreview
            colors={colors}
            top={sectionY.current + groupY.current + reorder.dragPreview.top}
            height={reorder.dragPreview.height}
            number={reorder.dragPreview.to + 1}
            text={reorder.dragPreview.text}
            style={reorder.dragPreviewStyle}
          />
        ) : null}
      </ScrollView>

      <AddStepButton colors={colors} visible={fabVisible} bottom={fabBottom} onPress={add} />
      <KeyboardHolder ref={keyboardHolderRef} />

      {wantsSave ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(75)}
          onLayout={(event) => setSaveBarHeight(event.nativeEvent.layout.height)}
          style={{
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: 16 + insets.bottom,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.tint,
          }}
        >
          <Pressable
            testID="save"
            accessibilityRole="button"
            accessibilityState={{ disabled: !saveAllowed }}
            disabled={!saveAllowed}
            onPress={() => void save()}
            style={{
              height: 54,
              borderRadius: 17,
              backgroundColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: saveAllowed ? 1 : 0.4,
            }}
          >
            <Text style={{ color: colors.onInk, fontSize: 16, fontWeight: '700' }}>
              {model.isNew ? 'Create routine' : 'Save changes'}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {panel && panelStep ? (
        <TimerPanel
          colors={colors}
          stepNumber={numbers[panel.stepId] ?? 1}
          stepText={panelStep.text}
          value={panelStep.timerSeconds}
          stepper={panel.stepper}
          quickPicks={panel.quickPicks}
          onStep={stepPanel}
          onPick={(seconds) => pickPanelTime(seconds)}
          onClear={() => pickPanelTime(null)}
          onDone={closePanel}
        />
      ) : null}

      {sheet === 'leave' ? (
        <EditorSheet colors={colors} onDismiss={() => setSheet(null)} testID="leave-sheet">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <SheetTitle colors={colors}>
                {model.isNew ? 'Create this routine?' : 'Save your changes?'}
              </SheetTitle>
            </View>
            <Pressable
              testID="leave-keep-editing"
              accessibilityRole="button"
              accessibilityLabel="Keep editing"
              onPress={() => setSheet(null)}
              style={{ width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" color={colors.muted} size={18} />
            </Pressable>
          </View>
          <SheetBody colors={colors}>
            {!model.isNew
              ? 'You changed this routine. If you leave without saving, those changes are lost.'
              : saveAllowed
                ? 'It hasn’t been created yet.'
                : 'It needs a name and at least one step before it can be created.'}
          </SheetBody>
          <SheetActions>
            <SheetButton
              colors={colors}
              variant="discardSoft"
              label="Discard"
              testID="leave-discard"
              onPress={() => {
                setSheet(null);
                onCancel();
              }}
            />
            <SheetButton
              colors={colors}
              variant="strong"
              label={model.isNew ? 'Create' : 'Save'}
              testID="leave-save"
              disabled={!saveAllowed}
              onPress={() => {
                setSheet(null);
                void save();
              }}
            />
          </SheetActions>
        </EditorSheet>
      ) : null}

      {sheet === 'delete' ? (
        <EditorSheet colors={colors} onDismiss={() => setSheet(null)} testID="delete-sheet">
          <SheetTitle colors={colors}>Delete this routine?</SheetTitle>
          <SheetBody colors={colors}>
            {`“${model.title.trim() || initialRoutine?.title || 'Untitled routine'}” and its steps will be gone.`}
          </SheetBody>
          <SheetActions>
            <SheetButton colors={colors} variant="keep" label="Cancel" testID="delete-cancel" onPress={() => setSheet(null)} />
            <SheetButton
              colors={colors}
              variant="discard"
              label="Delete"
              testID="delete-confirm"
              onPress={() => void confirmDelete()}
            />
          </SheetActions>
        </EditorSheet>
      ) : null}
    </SafeAreaView>
  );
}

function DragPreview({
  colors,
  top,
  height,
  number,
  text,
  style,
}: {
  colors: ReturnType<typeof editorColors>;
  top: number;
  height: number;
  number: number;
  text: string;
  style: object;
}) {
  return (
    <Animated.View
      testID="item-drag-preview"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top,
          left: 16,
          right: 16,
          minHeight: height,
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 16,
          backgroundColor: colors.fill,
          boxShadow: '0 16px 34px rgba(28, 48, 41, 0.3)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          zIndex: 30,
          transform: [{ scale: 1.04 }],
        },
        style,
      ]}
    >
      <NumberBadge number={number} color={colors.ink} background={colors.surface} />
      <Text
        testID="item-drag-preview-text"
        style={{ flex: 1, color: colors.text, ...STEP_WORDS, paddingHorizontal: TEXT_PAD.x }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * Holds the keyboard between one step's field and the next. It types like a
 * step's field, so the keyboard doesn't change, and keeps nothing typed.
 */
const KeyboardHolder = forwardRef<TextInput>(function KeyboardHolder(_props, ref) {
  return (
    <TextInput
      ref={ref}
      testID="keyboard-holder"
      value=""
      multiline
      submitBehavior="submit"
      returnKeyType="done"
      caretHidden
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, padding: 0, opacity: 0 }}
    />
  );
});

function AddStepButton({
  colors,
  visible,
  bottom,
  onPress,
}: {
  colors: ReturnType<typeof editorColors>;
  visible: boolean;
  bottom: number;
  onPress: () => void;
}) {
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    // It hides at once and comes back with a 200 ms grow.
    shown.value = visible ? withTiming(1, { duration: 200 }) : 0;
  }, [shown, visible]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.25),
    transform: [{ scale: 0.6 + 0.4 * shown.value }],
  }));
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[{ position: 'absolute', right: 16, bottom, zIndex: 6 }, style]}
    >
      <Pressable
        testID="add-step"
        accessibilityRole="button"
        accessibilityLabel="Add a step"
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
        onPress={onPress}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(28, 48, 41, 0.3), 0 2px 4px rgba(28, 48, 41, 0.2)',
        }}
      >
        <Icon name="plus" color={colors.onInk} size={24} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}
