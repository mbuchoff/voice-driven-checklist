import { parseCommand } from './commandParser';

describe('parseCommand', () => {
  it.each(['next', 'NEXT', '  Next  '])('parses %j as "next"', (input) => {
    expect(parseCommand(input)).toBe('next');
  });

  it.each(['repeat', 'REPEAT', '  RePeAt  '])('parses %j as "repeat"', (input) => {
    expect(parseCommand(input)).toBe('repeat');
  });

  it.each(['previous', 'PREVIOUS', '  Previous '])('parses %j as "previous"', (input) => {
    expect(parseCommand(input)).toBe('previous');
  });

  // The recognizer frequently returns the keyword inside a longer phrase or
  // with a trailing plural ("next it", "repeats"). Match the keyword wherever
  // it lands as a word.
  it.each([
    ['next it', 'next'],
    ['next item', 'next'],
    ['go next', 'next'],
    ['go to the next one please', 'next'],
    ['nexts', 'next'],
    ['repeats', 'repeat'],
    ['repeat that', 'repeat'],
    ['the previous one', 'previous'],
  ])('parses %j as %j', (input, expected) => {
    expect(parseCommand(input)).toBe(expected);
  });

  it('returns the first command keyword when several are present', () => {
    expect(parseCommand('next then repeat')).toBe('next');
  });

  it.each(['hello world', '', '   ', 'nope', 'go back', 'context'])(
    'returns null when no command keyword is present %j',
    (input) => {
      expect(parseCommand(input)).toBeNull();
    },
  );
});
