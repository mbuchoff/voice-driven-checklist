import {
  Fragment,
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
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';

import { notify } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useDevicePreferences } from '@/src/features/settings/DevicePreferencesProvider';
import { useTheme } from '@/src/theme/useTheme';

import { editorColors } from './editorColors';
import { AddStepButton } from './editor/AddStepButton';
import { DragPreview } from './editor/DragPreview';
import { EditorTopBar } from './editor/EditorTopBar';
import { DeleteRoutineSheet, LeaveSheet } from './editor/LeaveSheets';
import { SaveBar } from './editor/SaveBar';
import { RoutineHeroCard } from './editor/RoutineHeroCard';
import { DeletedStepRow, StepRow } from './editor/StepRow';
import { KeyboardHolder, useStepFocus } from './editor/stepFocus';
import { CHIP_FOLD_MS, STEP_OPEN_MS } from './editor/motion';
import { chipStripRoom } from './editor/stepRowMetrics';
import { StepTimerChips, useChipWidths } from './editor/TimerChips';
import { TimerPanel } from './editor/TimerPanel';
import { glideLength } from './editor/wordGlidePlan';
import { createRoutine, deleteRoutine, updateRoutine } from './repository';
import { moveItem } from './reorder';
import {
  addStep,
  canRun,
  canSave,
  countedStepCount,
  createEditorState,
  deleteStep,
  displayTitle,
  editorSnapshot,
  expireDeletedStep,
  expireDeletedSteps,
  isDirty,
  leaveOpenStep,
  moveStep,
  needsSave,
  openStep,
  pressEnter,
  realSteps,
  refreshOpenCandidates,
  routineInput,
  setColor,
  setStepText,
  setStepTimer,
  setTitle,
  timedTotal,
  undoDeleteStep,
  type EditorRow,
  type EditorState,
} from './routineEditorModel';
import { routineColor } from './routineColors';
import { countLine } from './timerFormat';
import {
  chipCandidates,
  initialStepper,
  pressStepper,
  TIMER_FILLERS,
  type StepperState,
} from './timers';
import type { DeletedRoutine, Routine } from './types';
import { scrollToKeepAboveKeyboard } from './keepAboveKeyboard';
import { STEP_MAKE_ROOM, useStepReorder } from './useStepReorder';

const EDITOR_KEYBOARD_OFFSET = 24;
const NO_CANDIDATES: number[] = [];

/** A new routine, with the color it starts with, or a saved one to edit. */
export type EditorMode =
  | { kind: 'new'; colorKey: string }
  | {
      kind: 'edit';
      routine: Routine;
      onDeleted: (deleted: DeletedRoutine) => void;
      /** Start a run of the saved routine. */
      onRun: (routine: Routine) => void;
    };

export type RoutineEditorProps = {
  mode: EditorMode;
  onSaved: (saved: Routine) => void;
  /** Leave without saving (nothing changed, or the changes were discarded). */
  onCancel: () => void;
};

type PanelState = {
  stepId: string;
  openedValue: number | null;
  stepper: StepperState;
  quickPicks: number[];
};
type Sheet = 'leave' | 'delete' | null;

/**
 * The rows as shown: each step with its number among the steps (`index`)
 * and its place among the steps that aren't being dragged (`dropIndex`,
 * where the drag's slot can go; null for the dragged step).
 */
/** A few frames for the rows' last places to arrive after a change. */
const LAST_LAYOUTS_MS = 50;

/**
 * How long lifting a step takes to change where the other steps are: the
 * open step closes (its number, time and chips come back while its words
 * glide to their closed lines) and UNDO rows go.
 */
function liftSettleMs(state: EditorState): number {
  const open = state.openId ? realSteps(state).find((step) => step.localId === state.openId) : undefined;
  const clearsUndoRows = state.rows.some((row) => row.kind === 'deleted');
  if (!open && !clearsUndoRows) return 0;
  const words = open?.text.trim() ? open.text.trim().split(/\s+/).length : 0;
  const closing = open ? Math.max(STEP_OPEN_MS, CHIP_FOLD_MS, words ? glideLength(words) : 0) : 0;
  return closing + LAST_LAYOUTS_MS;
}

type ShownRow =
  | { kind: 'deleted'; row: Extract<EditorRow, { kind: 'deleted' }>; rowIndex: number }
  | { kind: 'step'; row: Extract<EditorRow, { kind: 'step' }>; rowIndex: number; index: number; dropIndex: number | null };

function editorRows(rows: EditorRow[], draggedId: string | undefined): ShownRow[] {
  let index = 0;
  let dropIndex = 0;
  return rows.map((row, rowIndex) => {
    if (row.kind === 'deleted') return { kind: 'deleted', row, rowIndex };
    const dragged = row.localId === draggedId;
    return { kind: 'step', row, rowIndex, index: index++, dropIndex: dragged ? null : dropIndex++ };
  });
}

export function RoutineEditor({ mode, onSaved, onCancel }: RoutineEditorProps) {
  const database = useDatabase();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences, rememberTimerSeconds } = useDevicePreferences();
  const [model, setModel] = useState<EditorState>(() => createEditorState(mode));
  const [baseline] = useState(() => editorSnapshot(model));
  // Every change goes through `update`, so this is always the latest model,
  // even before it renders.
  const modelRef = useRef(model);
  const update = (change: (state: EditorState) => EditorState): EditorState => {
    const next = change(modelRef.current);
    modelRef.current = next;
    setModel(next);
    return next;
  };
  const focus = useStepFocus(model.openId);
  /** A tap or Enter: the model changes and the keyboard follows the open step. */
  const updateAndHandOff = (change: (state: EditorState) => EditorState) => {
    const from = modelRef.current.openId;
    focus.handOff(from, update(change).openId);
  };
  const recent = preferences.recentTimerSeconds;
  const colors = useMemo(() => editorColors(theme, model.colorKey), [theme, model.colorKey]);

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const titleRef = useRef<ComponentRef<typeof TextInput>>(null);
  const keyboardTop = useRef<number | null>(null);
  const heroY = useRef(0);
  const titleRow = useRef<{ y: number; height: number } | null>(null);
  const sectionY = useRef(0);
  const groupY = useRef(0);
  /** Where a point `y` down the steps' card sits in the scrolled content. */
  const contentYOfStepsCard = (y: number) => sectionY.current + groupY.current + y;
  const scrollToId = useRef<string | null>(null);

  const [panel, setPanel] = useState<PanelState | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [keyboardClearance, setKeyboardClearance] = useState(0);
  // Every step row is as wide; its chips' room follows from that.
  const [rowWidth, setRowWidth] = useState(0);
  const [saveBarHeight, setSaveBarHeight] = useState(0);
  const [busy, setBusy] = useState(false);

  const steps = realSteps(model);
  // Every time a chip could show: the fillers, the recent ones, the steps'
  // own, and the sets on show.
  const chipWidths = useChipWidths(colors, [
    ...TIMER_FILLERS,
    ...recent,
    ...steps.flatMap((step) => (step.timerSeconds ? [step.timerSeconds] : [])),
    ...model.openCandidates,
    ...(panel?.quickPicks ?? []),
  ]);
  const counted = countedStepCount(model);
  const summary = countLine(counted, timedTotal(model));
  const wantsSave = needsSave(model, baseline);
  const saveAllowed = canSave(model);
  const runnable = canRun(model, baseline);
  const colorLabel = routineColor(model.colorKey).name;

  const reorder = useStepReorder({
    items: steps.map(({ localId, text }) => ({ localId, text })),
    onMove: (from, to) => update((state) => moveStep(state, from, to)),
    scrollRef,
    onDragStart: () => {
      // The keyboard has already been let go of.
      const settleMs = liftSettleMs(modelRef.current);
      update((state) => leaveOpenStep(expireDeletedSteps(state)));
      return settleMs;
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

  // Row places, scroll and viewport come from the reorder hook.
  const { geometry } = reorder;
  const scrollOpenStepIntoView = useCallback(() => {
    const id = modelRef.current.openId;
    const row = id ? geometry.layoutOf(id) : null;
    if (!row || keyboardTop.current == null) return;
    const top = contentYOfStepsCard(row.y);
    const target = scrollToKeepAboveKeyboard({
      top,
      bottom: top + row.height,
      scrollY: geometry.scrollY(),
      viewportTop: geometry.viewport().top,
      keyboardTop: keyboardTop.current,
      margin: EDITOR_KEYBOARD_OFFSET,
    });
    if (target != null) scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [geometry]);

  useEffect(() => {
    if (!model.openId || keyboardClearance <= 0) return;
    const frame = requestAnimationFrame(scrollOpenStepIntoView);
    return () => cancelAnimationFrame(frame);
  }, [model.openId, keyboardClearance, scrollOpenStepIntoView]);

  // Before a sheet opens or the editor leaves: a native tap doesn't blur
  // the field being typed in, so the keyboard would stay up over the sheet.
  const settle = (): EditorState => {
    Keyboard.dismiss();
    return update(leaveOpenStep);
  };

  const open = (id: string) => {
    setColorsOpen(false);
    updateAndHandOff((state) => openStep(state, id, recent));
  };

  const add = () => {
    const id = uuidv4();
    setColorsOpen(false);
    scrollToId.current = id;
    updateAndHandOff((state) => addStep(state, id, recent));
  };

  const enter = () => {
    const id = uuidv4();
    scrollToId.current = id;
    updateAndHandOff((state) => pressEnter(state, id, recent));
  };

  const onStepBlur = (id: string) =>
    focus.fieldBlurred(id, () => update((state) => (state.openId === id ? leaveOpenStep(state) : state)));

  // The times stay while the step is open; "No timer" isn't remembered.
  const pickChip = (id: string, seconds: number | null) => {
    update((state) => setStepTimer(state, id, seconds));
    if (seconds) void rememberTimerSeconds(seconds);
  };

  const openPanel = (id: string) => {
    const step = steps.find((candidate) => candidate.localId === id);
    if (!step) return;
    focus.putTypingAside();
    setPanel({
      stepId: id,
      openedValue: step.timerSeconds,
      stepper: initialStepper(),
      quickPicks: chipCandidates(step.timerSeconds, recent),
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
    update((state) => refreshOpenCandidates(state, recent));
    focus.resumeTyping(stepId);
  };

  const stepPanel = (dir: -1 | 1) => {
    if (!panel || !panelStep) return;
    const next = pressStepper(panel.stepper, panelStep.timerSeconds, dir);
    setPanel({ ...panel, stepper: next.state });
    update((state) => setStepTimer(state, panel.stepId, next.value));
  };

  // Picking the time the step already has does nothing (the stepper keeps
  // its level).
  const pickPanelTime = (seconds: number | null) => {
    if (!panel || seconds === (panelStep?.timerSeconds ?? null)) return;
    setPanel({ ...panel, stepper: initialStepper() });
    update((state) => setStepTimer(state, panel.stepId, seconds));
  };

  const removeStep = (id: string, height: number) => {
    update((state) => deleteStep(state, id, height));
    void AccessibilityInfo.announceForAccessibility?.('Step deleted');
  };

  const persist = async (state: EditorState): Promise<Routine> => {
    const input = routineInput(state);
    return mode.kind === 'edit'
      ? updateRoutine(database, mode.routine.id, input)
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
    if (mode.kind === 'edit') mode.onRun(mode.routine);
  };

  const back = () => {
    const settled = settle();
    if (isDirty(settled, baseline)) setSheet('leave');
    else onCancel();
  };

  const confirmDelete = async () => {
    if (mode.kind !== 'edit') return;
    setSheet(null);
    try {
      const deleted = await deleteRoutine(database, mode.routine.id);
      if (deleted) mode.onDeleted(deleted);
      else onCancel();
    } catch {
      await notify('Delete failed', 'Your routine was not deleted. Try again.');
    }
  };

  // Android Back: the keyboard closes first (by the system), then an open
  // panel, sheet or color grid, then it works like the back arrow.
  const onBack = useRef(() => {});
  onBack.current = () => {
    if (panel) closePanel();
    else if (sheet) setSheet(null);
    else if (colorsOpen) setColorsOpen(false);
    else back();
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    reorder.onScroll(event);
    const y = event.nativeEvent.contentOffset.y;
    // The bar folds once the name has scrolled up under it.
    const row = titleRow.current;
    setCollapsed(!!row && y > heroY.current + row.y + row.height);
  };

  const onRowLayout = (localId: string, event: LayoutChangeEvent) => {
    reorder.onRowLayout(localId, event);
    const { y, height, width } = event.nativeEvent.layout;
    if (width > 0 && Math.abs(width - rowWidth) > 0.5) setRowWidth(width);
    if (scrollToId.current === localId) {
      scrollToId.current = null;
      const target = contentYOfStepsCard(y + height / 2) - geometry.viewport().height / 2;
      scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
    }
  };

  // While a step is dragged, the numbers follow it.
  const drag = reorder.drag;
  const ids = steps.map((step) => step.localId);
  const numbers = Object.fromEntries(
    (drag ? moveItem(ids, drag.from, drag.to) : ids).map((id, index) => [id, index + 1]),
  );

  const fabVisible = !model.openId;
  const fabBottom = (wantsSave ? saveBarHeight : insets.bottom) + 16;

  // One slot that moves along (and glides, like the steps) as the dragged
  // step passes others.
  const renderDropSlot = (index: number) =>
    drag?.to === index ? (
      <Animated.View
        key="drop-slot"
        testID={`step-drop-target-${index}`}
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
        title={displayTitle(model)}
        countLine={summary}
        canRun={runnable}
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
        onLayout={reorder.onViewportLayout}
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
            onChangeTitle={(title) => update((state) => setTitle(state, title))}
            onTitleFocus={() => update(leaveOpenStep)}
            onOpenColors={() => {
              settle();
              setColorsOpen(true);
            }}
            onCloseColors={() => setColorsOpen(false)}
            onPickColor={(key) => {
              update((state) => setColor(state, key));
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
            {editorRows(model.rows, drag?.localId).map((item) => {
              if (item.kind === 'deleted') {
                const { row, rowIndex } = item;
                return (
                  <DeletedStepRow
                    key={row.localId}
                    // Counts rows, deleted ones too (step test IDs count steps).
                    index={rowIndex}
                    colors={colors}
                    height={row.height}
                    first={rowIndex === 0}
                    onUndo={() => update((state) => undoDeleteStep(state, row.localId))}
                    onExpired={() => update((state) => expireDeletedStep(state, row.localId))}
                  />
                );
              }
              const { row, rowIndex, index, dropIndex } = item;
              const isActive = dropIndex === null;
              const slot = isActive ? null : renderDropSlot(dropIndex);
              const isOpen = model.openId === row.localId;
              // The open step's times fold open with it (and away while the
              // timer panel shows); every time's chip is measured ahead, so
              // they're ready the moment it opens.
              const chipsOpen = isOpen && !panel;
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
                    makesRoom={reorder.makingRoom && row.localId !== reorder.heldId}
                    holdGesture={reorder.gestureFor({ localId: row.localId, text: row.text }, index)}
                    inputRef={focus.fieldRef(row.localId)}
                    onLayout={(event) => onRowLayout(row.localId, event)}
                    onOpen={() => open(row.localId)}
                    onChangeText={(text) => update((state) => setStepText(state, row.localId, text))}
                    onEnter={enter}
                    onBlur={() => onStepBlur(row.localId)}
                    onDelete={(height) => removeStep(row.localId, height)}
                    onMoveEarlier={() => reorder.moveItemByAction(index, -1)}
                    onMoveLater={() => reorder.moveItemByAction(index, 1)}
                    chips={
                      <StepTimerChips
                        colors={colors}
                        index={index}
                        open={chipsOpen}
                        candidates={isOpen ? model.openCandidates : NO_CANDIDATES}
                        widths={chipWidths.widths}
                        room={chipStripRoom(rowWidth)}
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
            top={contentYOfStepsCard(reorder.dragPreview.top)}
            height={reorder.dragPreview.height}
            number={reorder.dragPreview.to + 1}
            text={reorder.dragPreview.text}
            style={reorder.dragPreviewStyle}
          />
        ) : null}
      </ScrollView>

      <AddStepButton colors={colors} visible={fabVisible} bottom={fabBottom} onPress={add} />
      <KeyboardHolder ref={focus.holderRef} />
      {chipWidths.measurer}

      {wantsSave ? (
        <SaveBar
          colors={colors}
          isNew={model.isNew}
          enabled={saveAllowed}
          bottomInset={insets.bottom}
          onHeight={setSaveBarHeight}
          onSave={() => void save()}
        />
      ) : null}

      {panel && panelStep ? (
        <TimerPanel
          colors={colors}
          stepNumber={numbers[panel.stepId] ?? 1}
          stepText={panelStep.text}
          value={panelStep.timerSeconds}
          stepper={panel.stepper}
          quickPicks={panel.quickPicks}
          quickPickWidths={chipWidths.widths.panel}
          onStep={stepPanel}
          onPick={(seconds) => pickPanelTime(seconds)}
          onClear={() => pickPanelTime(null)}
          onDone={closePanel}
        />
      ) : null}

      {sheet === 'leave' ? (
        <LeaveSheet
          colors={colors}
          isNew={model.isNew}
          saveAllowed={saveAllowed}
          onKeepEditing={() => setSheet(null)}
          onDiscard={() => {
            setSheet(null);
            onCancel();
          }}
          onSave={() => {
            setSheet(null);
            void save();
          }}
        />
      ) : null}

      {sheet === 'delete' ? (
        <DeleteRoutineSheet
          colors={colors}
          title={displayTitle(model, mode.kind === 'edit' ? mode.routine.title : undefined)}
          onCancel={() => setSheet(null)}
          onDelete={() => void confirmDelete()}
        />
      ) : null}
    </SafeAreaView>
  );
}
