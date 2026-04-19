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

  it.each([
    'next item',
    'go next',
    'go to the next one please',
    'hello world',
    '',
    '   ',
    'nope',
  ])('returns null for non-command input %j', (input) => {
    expect(parseCommand(input)).toBeNull();
  });
});
