import { validateChecklistTitle, validateChecklistItemText } from './validation';

describe('validateChecklistTitle', () => {
  it('accepts a non-empty title and returns the trimmed value', () => {
    expect(validateChecklistTitle('  Morning routine  ')).toEqual({
      ok: true,
      value: 'Morning routine',
    });
  });

  it('rejects an empty string', () => {
    expect(validateChecklistTitle('')).toEqual({
      ok: false,
      error: 'Title is required.',
    });
  });

  it('rejects whitespace-only input', () => {
    expect(validateChecklistTitle('   \t  \n')).toEqual({
      ok: false,
      error: 'Title is required.',
    });
  });
});

describe('validateChecklistItemText', () => {
  it('accepts non-empty text and returns the trimmed value', () => {
    expect(validateChecklistItemText('  Brush teeth  ')).toEqual({
      ok: true,
      value: 'Brush teeth',
    });
  });

  it('rejects an empty string', () => {
    expect(validateChecklistItemText('')).toEqual({
      ok: false,
      error: 'Item text is required.',
    });
  });

  it('rejects whitespace-only input', () => {
    expect(validateChecklistItemText('  \n ')).toEqual({
      ok: false,
      error: 'Item text is required.',
    });
  });
});
