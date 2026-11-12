import type { RoutineInput } from './types';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  parseBackup,
  serializeBackup,
} from './backup';

describe('routine backup', () => {
  it('round-trips routine inputs', () => {
    const inputs: RoutineInput[] = [
      {
        title: 'Morning routine',
        colorKey: 'teal-1',
        steps: [
          { text: 'Wake up', timerSeconds: null },
          { text: 'Stretch', timerSeconds: 90 },
        ],
      },
      { title: 'Empty draft', colorKey: 'slate', steps: [] },
    ];

    expect(parseBackup(serializeBackup(inputs))).toEqual(inputs);
  });

  it('serializes a versioned backup envelope', () => {
    const parsed = JSON.parse(serializeBackup([{ title: 'Trip', steps: [] }]));

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
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/routines/i);
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

    expect(parseBackup(json)).toEqual([
      { title: 'Trip', steps: [{ text: 'Pack', timerSeconds: null }] },
    ]);
  });

  it('round-trips an empty library', () => {
    expect(parseBackup(serializeBackup([]))).toEqual([]);
  });

  it('writes step timers and routine colors, leaving out timers a step does not have', () => {
    const parsed = JSON.parse(serializeBackup([
      {
        title: 'Stretch',
        colorKey: 'lime-1',
        steps: [{ text: 'Plank', timerSeconds: 45 }, { text: 'Rest', timerSeconds: null }],
      },
    ]));

    expect(parsed.version).toBe(1);
    expect(parsed.checklists).toEqual([
      {
        title: 'Stretch',
        color: 'lime-1',
        items: [{ text: 'Plank', timer: 45 }, { text: 'Rest' }],
      },
    ]);
  });

  it('reads a backup made before timers and colors as untimed steps without a color', () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      checklists: [{ title: 'Old', items: [{ text: 'Step' }] }],
    });

    expect(parseBackup(json)).toEqual([
      { title: 'Old', steps: [{ text: 'Step', timerSeconds: null }] },
    ]);
  });

  it('rejects a backup whose timers are not whole seconds from one second to an hour', () => {
    for (const timer of [0, 3601, 2.5, '30', null]) {
      const json = JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        checklists: [{ title: 'Bad', items: [{ text: 'Step', timer }] }],
      });
      expect(() => parseBackup(json)).toThrow(/timer/i);
    }
  });

  it('leaves out a color it does not recognize, so the routine gets a new one', () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      checklists: [{ title: 'Future', color: 'ultraviolet', items: [] }],
    });

    expect(parseBackup(json)).toEqual([{ title: 'Future', steps: [] }]);
  });
});
