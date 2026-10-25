import {
  chipCandidates,
  fitChips,
  initialStepper,
  pressStepper,
  rememberTime,
  stepCaption,
  stepWords,
  type StepperState,
} from './timers';

describe('timer chips', () => {
  it('offers the step’s own time, then recent times, then fillers, four in all', () => {
    expect(chipCandidates(null, [])).toEqual([30, 60, 120, 300]);
    expect(chipCandidates(null, [90, 150])).toEqual([90, 150, 30, 60]);
    expect(chipCandidates(45, [90, 150, 210, 270])).toEqual([45, 90, 150, 210]);
    expect(chipCandidates(150, [90, 150])).toEqual([150, 90, 30, 60]);
  });

  it('drops the last candidates until the chips and ⋯ fit, then sorts shortest first', () => {
    const widths = new Map([[1215, 62], [1335, 62], [1455, 62], [1545, 62], [30, 34]]);
    const width = (time: number) => widths.get(time)!;
    // 4 × 62 + 3 gaps of 4 + ⋯ 36 + its gap 4 = 300.
    expect(fitChips([1545, 1455, 1335, 1215], width, 300, 4, 36)).toEqual([1215, 1335, 1455, 1545]);
    expect(fitChips([1545, 1455, 1335, 1215], width, 299, 4, 36)).toEqual([1335, 1455, 1545]);
    // The step's own time, first, always stays.
    expect(fitChips([1545, 30], width, 10, 4, 36)).toEqual([1545]);
  });

  it('remembers a used time first, without duplicates, keeping four', () => {
    expect(rememberTime([], 90)).toEqual([90]);
    expect(rememberTime([30, 60, 90, 120], 90)).toEqual([90, 30, 60, 120]);
    expect(rememberTime([30, 60, 90, 120], 45)).toEqual([45, 30, 60, 90]);
  });
});

describe('timer panel stepper', () => {
  function presses(start: number | null, dirs: (1 | -1)[]) {
    let state: StepperState = initialStepper();
    let value = start;
    const values: (number | null)[] = [];
    for (const dir of dirs) {
      ({ state, value } = pressStepper(state, value, dir));
      values.push(value);
    }
    return values;
  }

  it('starts by moving a whole minute', () => {
    expect(presses(null, [1, 1])).toEqual([60, 120]);
    expect(presses(90, [1])).toEqual([150]);
  });

  it('drops to a finer step on each change of direction, down to one second', () => {
    expect(presses(null, [1, 1, -1, 1, -1])).toEqual([60, 120, 105, 110, 109]);
  });

  it('climbs back to the coarser step after moving a whole coarser step one way', () => {
    // 120 → 105 (15 s steps) → 90 → 75 → 60: four 15 s steps make a minute,
    // so the next press moves a minute again.
    expect(presses(null, [1, 1, -1, -1, -1, -1, -1])).toEqual([60, 120, 105, 90, 75, 60, null]);
  });

  it('lets minus reach Off and stops there', () => {
    expect(presses(30, [-1, -1])).toEqual([null, null]);
  });

  it('never goes past an hour', () => {
    expect(presses(3590, [1, 1])).toEqual([3600, 3600]);
  });

  it('labels each button with the step it would take next', () => {
    let state = initialStepper();
    expect([stepCaption(state, -1), stepCaption(state, 1)]).toEqual(['−1 min', '+1 min']);
    ({ state } = pressStepper(state, 60, 1));
    expect([stepCaption(state, -1), stepCaption(state, 1)]).toEqual(['−15s', '+1 min']);
    expect([stepWords(state, -1), stepWords(state, 1)]).toEqual(['15 seconds', '1 minute']);
  });
});
