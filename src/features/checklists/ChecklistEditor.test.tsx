import { fireEvent, screen } from '@testing-library/react-native';

import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { ChecklistEditor } from './ChecklistEditor';
import { createChecklist, getChecklist } from './repository';

async function setupDb() {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

describe('ChecklistEditor', () => {
  describe('create mode', () => {
    it('renders an empty form with a single blank item row by default', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      expect(screen.getByTestId('title-input').props.value).toBe('');
      expect(screen.getByTestId('item-text-0').props.value).toBe('');
      expect(screen.queryByTestId('item-text-1')).toBeNull();
    });

    it('adds a new blank item row when Add item is pressed', async () => {
      const database = await setupDb();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={jest.fn()} />,
        { database },
      );

      fireEvent.press(screen.getByTestId('add-item'));
      expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
    });

    it('persists a new checklist with trimmed title and trimmed item text on save', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );

      fireEvent.changeText(screen.getByTestId('title-input'), '  Groceries  ');
      fireEvent.changeText(screen.getByTestId('item-text-0'), '  Milk  ');
      fireEvent.press(screen.getByTestId('add-item'));
      fireEvent.changeText(screen.getByTestId('item-text-1'), '  Bread  ');

      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      expect(onSaved).toHaveBeenCalledTimes(1);
      const saved = onSaved.mock.calls[0][0];
      expect(saved.title).toBe('Groceries');
      expect(saved.items.map((i: { text: string }) => i.text)).toEqual(['Milk', 'Bread']);

      const reloaded = await getChecklist(database, saved.id);
      expect(reloaded?.title).toBe('Groceries');
      expect(reloaded?.items.map((i) => i.text)).toEqual(['Milk', 'Bread']);
    });

    it('blocks save and shows a validation error when the title is blank', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'valid');
      fireEvent.press(screen.getByTestId('save'));

      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByText(/title is required/i)).toBeOnTheScreen();
    });

    it('blocks save and shows a validation error when any item text is blank', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent.changeText(screen.getByTestId('title-input'), 'Title');
      fireEvent.press(screen.getByTestId('add-item'));
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'valid');
      // Leave item-text-1 blank.
      fireEvent.press(screen.getByTestId('save'));

      expect(onSaved).not.toHaveBeenCalled();
      expect(screen.getByTestId('item-error-1')).toBeOnTheScreen();
    });

    it('allows saving a draft checklist with no items as long as the title is valid', async () => {
      const database = await setupDb();
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={onSaved} onCancel={jest.fn()} />,
        { database },
      );
      fireEvent.changeText(screen.getByTestId('title-input'), 'Draft');
      fireEvent.press(screen.getByTestId('item-delete-0'));
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      expect(onSaved).toHaveBeenCalledTimes(1);
      const saved = onSaved.mock.calls[0][0];
      expect(saved.items).toEqual([]);
    });

    it('calls onCancel when the cancel button is pressed', async () => {
      const database = await setupDb();
      const onCancel = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor onSaved={jest.fn()} onCancel={onCancel} />,
        { database },
      );

      fireEvent.press(screen.getByTestId('cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit mode', () => {
    it('pre-fills the form from the initial checklist and updates it on save', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'Original',
        items: [{ text: 'one' }, { text: 'two' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      expect(screen.getByTestId('title-input').props.value).toBe('Original');
      expect(screen.getByTestId('item-text-0').props.value).toBe('one');
      expect(screen.getByTestId('item-text-1').props.value).toBe('two');

      fireEvent.changeText(screen.getByTestId('title-input'), 'Renamed');
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'uno');
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const saved = onSaved.mock.calls[0][0];
      expect(saved.id).toBe(existing.id);
      expect(saved.title).toBe('Renamed');
      expect(saved.items.map((i: { text: string }) => i.text)).toEqual(['uno', 'two']);
    });

    it('removes an item and shifts positions contiguously after save', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'x',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent.press(screen.getByTestId('item-delete-1')); // remove 'b'
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const reloaded = await getChecklist(database, existing.id);
      expect(reloaded?.items.map((i) => ({ text: i.text, order: i.order }))).toEqual([
        { text: 'a', order: 0 },
        { text: 'c', order: 1 },
      ]);
    });

    it('reorders items using move-up and move-down', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'reorder me',
        items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
      });
      const onSaved = jest.fn();
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={onSaved}
          onCancel={jest.fn()}
        />,
        { database },
      );

      fireEvent.press(screen.getByTestId('item-move-down-0')); // a,b,c -> b,a,c
      fireEvent.press(screen.getByTestId('item-move-up-2')); // b,a,c -> b,c,a
      fireEvent.press(screen.getByTestId('save'));

      await screen.findByTestId('save');
      const reloaded = await getChecklist(database, existing.id);
      expect(reloaded?.items.map((i) => i.text)).toEqual(['b', 'c', 'a']);
    });

    it('disables move-up on the first row and move-down on the last row', async () => {
      const database = await setupDb();
      const existing = await createChecklist(database, {
        title: 'x',
        items: [{ text: 'a' }, { text: 'b' }],
      });
      await renderWithDatabase(
        <ChecklistEditor
          initialChecklist={existing}
          onSaved={jest.fn()}
          onCancel={jest.fn()}
        />,
        { database },
      );

      expect(screen.getByTestId('item-move-up-0').props.accessibilityState?.disabled).toBe(true);
      expect(screen.getByTestId('item-move-down-1').props.accessibilityState?.disabled).toBe(true);
    });
  });
});
