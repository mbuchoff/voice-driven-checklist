import { countLine, formatTimerLong, formatTimerWords } from './timerFormat';

describe('timer formats', () => {
  it('shows minutes as "min" and seconds as "s"', () => {
    expect([45, 60, 90, 600, 3600].map(formatTimerLong)).toEqual([
      '45s', '1 min', '1 min 30s', '10 min', '60 min',
    ]);
  });

  it('reads timers out in full words', () => {
    expect([1, 30, 60, 61, 90, 3600].map(formatTimerWords)).toEqual([
      '1 second', '30 seconds', '1 minute', '1 minute 1 second',
      '1 minute 30 seconds', '60 minutes',
    ]);
  });


  it('summarizes a routine as steps plus the timed total', () => {
    expect(countLine(0, 0)).toBe('No steps yet');
    expect(countLine(1, 0)).toBe('1 step');
    expect(countLine(14, 600)).toBe('14 steps · 10 min timed');
    expect(countLine(3, 90)).toBe('3 steps · 1 min 30s timed');
  });
});
