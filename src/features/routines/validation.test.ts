import { validateRoutineTitle, validateStepText } from './validation';

describe('validateRoutineTitle', () => {
  it('accepts a non-empty title and returns the trimmed value', () => {
    expect(validateRoutineTitle('  Morning routine  ')).toEqual({
      ok: true,
      value: 'Morning routine',
    });
  });

  it('rejects an empty string', () => {
    expect(validateRoutineTitle('')).toEqual({
      ok: false,
      error: 'Title is required.',
    });
  });

  it('rejects whitespace-only input', () => {
    expect(validateRoutineTitle('   \t  \n')).toEqual({
      ok: false,
      error: 'Title is required.',
    });
  });
});

describe('validateStepText', () => {
  it('accepts non-empty text and returns the trimmed value', () => {
    expect(validateStepText('  Brush teeth  ')).toEqual({
      ok: true,
      value: 'Brush teeth',
    });
  });

  it('rejects an empty string', () => {
    expect(validateStepText('')).toEqual({
      ok: false,
      error: 'Step text is required.',
    });
  });

  it('rejects whitespace-only input', () => {
    expect(validateStepText('  \n ')).toEqual({
      ok: false,
      error: 'Step text is required.',
    });
  });
});
