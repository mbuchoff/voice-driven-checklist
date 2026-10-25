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
  setStepText,
  setStepTimer,
  setTitle,
  timedTotal,
  undoDeleteStep,
  type EditorState,
} from './routineEditorModel';
import type { Routine } from './types';

const saved: Routine = {
  id: 'r1',
  title: 'Morning stretch',
  colorKey: 'teal-1',
  steps: [
    { id: 's1', text: 'Neck rolls', order: 0, timerSeconds: 30 },
    { id: 's2', text: 'Breathe', order: 1, timerSeconds: null },
  ],
};

function texts(state: EditorState) {
  return realSteps(state).map((step) => step.text);
}

describe('routine editor model', () => {
  describe('leaving a step', () => {
    it('gives an emptied existing step back the words it had when opened', () => {
      let state = createEditorState({ routine: saved });
      const id = realSteps(state)[0].localId;
      state = openStep(state, id);
      state = setStepText(state, id, '');
      state = leaveOpenStep(state);
      expect(texts(state)).toEqual(['Neck rolls', 'Breathe']);
      expect(state.openId).toBeNull();
    });

    it('drops a new step left blank, including a timer set on it', () => {
      let state = createEditorState({ routine: saved });
      state = addStep(state, 'n1');
      state = setStepTimer(state, 'n1', 45);
      state = leaveOpenStep(state);
      expect(texts(state)).toEqual(['Neck rolls', 'Breathe']);
    });

    it('keeps a new step once it has words', () => {
      let state = createEditorState({ routine: saved });
      state = addStep(state, 'n1');
      state = setStepText(state, 'n1', 'Plank');
      state = openStep(state, realSteps(state)[0].localId);
      expect(texts(state)).toEqual(['Neck rolls', 'Breathe', 'Plank']);
    });
  });

  describe('Enter', () => {
    it('closes an existing step', () => {
      let state = createEditorState({ routine: saved });
      state = openStep(state, realSteps(state)[1].localId);
      state = pressEnter(state, 'unused');
      expect(state.openId).toBeNull();
      expect(texts(state)).toEqual(['Neck rolls', 'Breathe']);
    });

    it('keeps a new step with words and opens another new step at the end', () => {
      let state = createEditorState({ routine: saved });
      state = addStep(state, 'n1');
      state = setStepText(state, 'n1', 'Plank');
      state = pressEnter(state, 'n2');
      expect(state.openId).toBe('n2');
      expect(realSteps(state).map((step) => step.localId).slice(-2)).toEqual(['n1', 'n2']);
    });

    it('removes a blank new step', () => {
      let state = createEditorState({ routine: saved });
      state = addStep(state, 'n1');
      state = pressEnter(state, 'n2');
      expect(state.openId).toBeNull();
      expect(texts(state)).toEqual(['Neck rolls', 'Breathe']);
    });
  });

  describe('counting', () => {
    it('counts a new step only once it has words', () => {
      let state = createEditorState({ routine: saved });
      state = addStep(state, 'n1');
      expect(countedStepCount(state)).toBe(2);
      state = setStepText(state, 'n1', 'P');
      expect(countedStepCount(state)).toBe(3);
    });

    it('totals the timers of counted steps', () => {
      let state = createEditorState({ routine: saved });
      state = setStepTimer(state, realSteps(state)[1].localId, 90);
      expect(timedTotal(state)).toBe(120);
    });
  });

  describe('deleting by swipe', () => {
    it('leaves an undo row in the step’s place and restores the step, timer included', () => {
      let state = createEditorState({ routine: saved });
      const first = realSteps(state)[0].localId;
      state = deleteStep(state, first);
      expect(texts(state)).toEqual(['Breathe']);
      expect(state.rows[0]).toMatchObject({ kind: 'deleted' });

      state = undoDeleteStep(state, first);
      expect(realSteps(state).map(({ text, timerSeconds }) => ({ text, timerSeconds }))).toEqual([
        { text: 'Neck rolls', timerSeconds: 30 },
        { text: 'Breathe', timerSeconds: null },
      ]);
    });

    it('closes up the undo row when it expires', () => {
      let state = createEditorState({ routine: saved });
      const first = realSteps(state)[0].localId;
      state = expireDeletedStep(deleteStep(state, first), first);
      expect(state.rows).toHaveLength(1);
      expect(texts(state)).toEqual(['Breathe']);
    });
  });

  describe('reordering', () => {
    it('leaves an undo row in its place when another step moves, so UNDO puts the step back there', () => {
      let state = createEditorState({
        routine: { ...saved, steps: ['A', 'B', 'C', 'D'].map((text, order) => ({ id: text, text, order, timerSeconds: null })) },
      });
      const b = realSteps(state)[1].localId;
      state = deleteStep(state, b);
      state = moveStep(state, 2, 1);
      expect(state.rows.map((row) => (row.kind === 'deleted' ? 'undo' : row.text))).toEqual(['A', 'undo', 'D', 'C']);

      state = undoDeleteStep(state, b);
      expect(texts(state)).toEqual(['A', 'B', 'D', 'C']);
    });

    it('moves a step among the real steps, skipping undo rows', () => {
      let state = createEditorState({ routine: saved });
      state = addStep(state, 'n1');
      state = setStepText(state, 'n1', 'Plank');
      state = leaveOpenStep(state);
      state = deleteStep(state, realSteps(state)[1].localId);
      state = moveStep(state, 1, 0);
      expect(texts(state)).toEqual(['Plank', 'Neck rolls']);
    });
  });

  describe('saving', () => {
    it('needs a name for every routine and, for a new one, a step with words', () => {
      let fresh = createEditorState({ colorKey: 'slate' });
      expect(canSave(fresh)).toBe(false);
      fresh = setTitle(fresh, 'Night');
      expect(canSave(fresh)).toBe(false);
      fresh = addStep(fresh, 'n1');
      fresh = setStepText(fresh, 'n1', 'Lights off');
      expect(canSave(fresh)).toBe(true);

      let existing = createEditorState({ routine: saved });
      for (const step of realSteps(existing)) existing = deleteStep(existing, step.localId);
      expect(canSave(existing)).toBe(true);
      expect(canSave(setTitle(existing, '  '))).toBe(false);
    });

    it('keeps a name on one line, turning pasted line breaks into spaces', () => {
      const state = setTitle(createEditorState({ routine: saved }), 'End of day\nlockup\r\n for the building');
      expect(state.title).toBe('End of day lockup for the building');
    });

    it('saves trimmed words and timers, dropping steps without words', () => {
      let state = createEditorState({ routine: saved });
      state = setTitle(state, '  Evening stretch ');
      state = addStep(state, 'n1');
      state = setStepTimer(state, 'n1', 60);
      state = setStepText(state, realSteps(state)[1].localId, ' Breathe deeply ');
      expect(routineInput(state)).toEqual({
        title: 'Evening stretch',
        colorKey: 'teal-1',
        steps: [
          { text: 'Neck rolls', timerSeconds: 30 },
          { text: 'Breathe deeply', timerSeconds: null },
        ],
      });
    });

    it('treats only changes that saving would keep as unsaved changes', () => {
      const start = createEditorState({ routine: saved });
      const baseline = editorSnapshot(start);
      expect(isDirty(start, baseline)).toBe(false);

      let blankTimed = addStep(start, 'n1');
      blankTimed = setStepTimer(blankTimed, 'n1', 30);
      expect(isDirty(blankTimed, baseline)).toBe(false);

      expect(isDirty(setStepTimer(start, realSteps(start)[1].localId, 15), baseline)).toBe(true);
      expect(isDirty(deleteStep(start, realSteps(start)[0].localId), baseline)).toBe(true);
      expect(isDirty({ ...start, colorKey: 'slate' }, baseline)).toBe(true);
    });
  });
});
