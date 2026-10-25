import { fadeThrough, glideLength, planWordGlide, spotsFromLefts, wordProgress, type WordSpot } from './wordGlidePlan';

const LINE = 26;

// "Drink a full glass of / water before making / breakfast" closed, and
// "Drink a full glass of water before making / breakfast" open.
const words = ['Drink', 'a', 'full', 'glass', 'of', 'water', 'before', 'making', 'breakfast'];
const closed: WordSpot[] = [
  { x: 0, line: 0 }, { x: 60, line: 0 }, { x: 78, line: 0 }, { x: 118, line: 0 }, { x: 175, line: 0 },
  { x: 0, line: 1 }, { x: 58, line: 1 }, { x: 125, line: 1 },
  { x: 0, line: 2 },
];
const open: WordSpot[] = [
  ...closed.slice(0, 5),
  { x: 200, line: 0 }, { x: 258, line: 0 }, { x: 325, line: 0 },
  { x: 0, line: 1 },
];

describe('planning how a long step’s words reach their new lines', () => {
  it('leaves the words alone when none of them changes lines', () => {
    const wider = closed.map((spot) => ({ ...spot }));
    expect(planWordGlide(closed, wider, -34, LINE)).toBeNull();
  });

  it('slides the words that keep their line and fades the ones that change lines, one after another', () => {
    const plan = planWordGlide(closed, open, -34, LINE)!;

    expect(plan).toHaveLength(words.length);
    // "Drink" keeps its line: it slides from where it was, 34 to the right
    // of where the opened box starts.
    expect(plan[0]).toEqual({ kind: 'slide', dx: 34, dy: 0, delay: 0 });
    // "water" moves up a line: it fades out where it was and in where it lands.
    expect(plan[5]).toEqual({ kind: 'fade', dx: 0 - 200 + 34, dy: LINE, delay: 5 * 12 });
    expect(plan[8]).toEqual({ kind: 'fade', dx: 34, dy: LINE, delay: 8 * 12 });
  });

  it('works the same way back when the step closes', () => {
    const plan = planWordGlide(open, closed, 34, LINE)!;
    expect(plan[0]).toEqual({ kind: 'slide', dx: -34, dy: 0, delay: 0 });
    expect(plan[5]).toEqual({ kind: 'fade', dx: 200 - 0 - 34, dy: -LINE, delay: 60 });
  });
});

describe('timing', () => {
  it('lasts 160 ms for the last word to start 12 ms after each word before it', () => {
    expect(glideLength(words.length)).toBe(160 + 8 * 12);
    expect(glideLength(1)).toBe(160);
  });

  it('starts each word 12 ms after the one before it, easing its progress', () => {
    const linear = (t: number) => t;
    expect(wordProgress(0, 0, linear)).toBe(0);
    expect(wordProgress(80, 0, linear)).toBe(0.5);
    expect(wordProgress(12, 1, linear)).toBe(0);
    expect(wordProgress(92, 1, linear)).toBe(0.5);
    expect(wordProgress(400, 1, linear)).toBe(1);
  });

  it('fades a word out where it was, then in where it lands', () => {
    expect(fadeThrough(0)).toEqual({ opacity: 1, atStart: true });
    expect(fadeThrough(0.225).atStart).toBe(true);
    expect(fadeThrough(0.225).opacity).toBeCloseTo(0.5);
    expect(fadeThrough(0.5)).toEqual({ opacity: 0, atStart: false });
    expect(fadeThrough(0.775).atStart).toBe(false);
    expect(fadeThrough(0.775).opacity).toBeCloseTo(0.5);
    expect(fadeThrough(1)).toEqual({ opacity: 1, atStart: false });
  });
});

describe('finding each word’s line from where it starts', () => {
  it('starts a new line wherever a word starts back at the left', () => {
    expect(spotsFromLefts([0, 51, 67, 100, 153, 0, 55, 118, 0])).toEqual([
      { x: 0, line: 0 }, { x: 51, line: 0 }, { x: 67, line: 0 }, { x: 100, line: 0 }, { x: 153, line: 0 },
      { x: 0, line: 1 }, { x: 55, line: 1 }, { x: 118, line: 1 },
      { x: 0, line: 2 },
    ]);
  });
});
