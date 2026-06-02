import type { ChecklistInput } from './types';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  parseBackup,
  serializeBackup,
} from './backup';

describe('checklist backup', () => {
  it('round-trips checklist inputs', () => {
    const inputs: ChecklistInput[] = [
      {
        title: 'Morning routine',
        items: [{ text: 'Wake up' }, { text: 'Brush teeth' }],
      },
      { title: 'Empty draft', items: [] },
    ];

    expect(parseBackup(serializeBackup(inputs))).toEqual(inputs);
  });

  it('serializes a versioned backup envelope', () => {
    const parsed = JSON.parse(serializeBackup([{ title: 'Trip', items: [] }]));

    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);
  });

  it('rejects a file with the wrong format brand', () => {
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: 'something-else',
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          checklists: [],
        }),
      ),
    ).toThrow(/not a Voice Checklist backup/i);
  });

  it('rejects a backup from a newer version', () => {
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 999,
          exportedAt: new Date().toISOString(),
          checklists: [],
        }),
      ),
    ).toThrow(/newer version/i);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseBackup('{')).toThrow(/not valid JSON/i);
  });

  it.each([
    ['missing checklists', { format: BACKUP_FORMAT, version: BACKUP_VERSION }],
    [
      'non-array checklists',
      { format: BACKUP_FORMAT, version: BACKUP_VERSION, checklists: {} },
    ],
  ])('rejects %s', (_name, backup) => {
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/checklists/i);
  });

  it.each([
    [
      'missing title',
      {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        checklists: [{ items: [] }],
      },
    ],
    [
      'items not array',
      {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        checklists: [{ title: 'Trip', items: {} }],
      },
    ],
    [
      'item missing text',
      {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        checklists: [{ title: 'Trip', items: [{}] }],
      },
    ],
  ])('rejects a bad entry shape with %s', (_name, backup) => {
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/backup/i);
  });

  it('trims titles and item texts in the parsed result', () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      checklists: [{ title: '  Trip  ', items: [{ text: '  Pack  ' }] }],
    });

    expect(parseBackup(json)).toEqual([{ title: 'Trip', items: [{ text: 'Pack' }] }]);
  });

  it('round-trips an empty library', () => {
    expect(parseBackup(serializeBackup([]))).toEqual([]);
  });
});
