import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { Database } from '@/src/db/database';
import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { LibraryScreen } from './LibraryScreen';
import {
  createChecklist,
  getChecklist,
  listChecklists,
} from './repository';

async function setupDb(): Promise<Database> {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

describe('LibraryScreen', () => {
  it('shows an empty state when there are no checklists', async () => {
    const database = await setupDb();
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );

    await waitFor(() => {
      expect(screen.getByText(/no checklists yet/i)).toBeOnTheScreen();
    });
  });

  it('renders each saved checklist with its title and item count', async () => {
    const database = await setupDb();
    await createChecklist(database, {
      title: 'Morning routine',
      items: [{ text: 'Wake up' }, { text: 'Brush teeth' }],
    });
    await createChecklist(database, { title: 'Empty draft', items: [] });

    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );

    await waitFor(() => {
      expect(screen.getByText('Morning routine')).toBeOnTheScreen();
    });
    expect(screen.getByText(/2 items/i)).toBeOnTheScreen();
    expect(screen.getByText('Empty draft')).toBeOnTheScreen();
    expect(screen.getByText(/0 items/i)).toBeOnTheScreen();
  });

  it('uses singular wording for a checklist with exactly one item', async () => {
    const database = await setupDb();
    await createChecklist(database, { title: 'Solo', items: [{ text: 'just one' }] });
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );
    await waitFor(() => screen.getByText('Solo'));
    expect(screen.getByText('1 item')).toBeOnTheScreen();
  });

  it('invokes onCreate when the new-checklist button is pressed', async () => {
    const onCreate = jest.fn();
    const database = await setupDb();
    await renderWithDatabase(
      <LibraryScreen onCreate={onCreate} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );

    fireEvent.press(screen.getByRole('button', { name: /new checklist/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('invokes onEdit with the checklist id when Edit is pressed', async () => {
    const database = await setupDb();
    const created = await createChecklist(database, {
      title: 'Errands',
      items: [{ text: 'Bank' }],
    });
    const onEdit = jest.fn();
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={onEdit} onStart={jest.fn()} />,
      { database },
    );

    await waitFor(() => screen.getByText('Errands'));
    fireEvent.press(screen.getByTestId(`edit-${created.id}`));
    expect(onEdit).toHaveBeenCalledWith(created.id);
  });

  it('invokes onStart with the checklist id when Start is pressed on a non-empty checklist', async () => {
    const database = await setupDb();
    const created = await createChecklist(database, {
      title: 'Errands',
      items: [{ text: 'Bank' }],
    });
    const onStart = jest.fn();
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={onStart} />,
      { database },
    );

    await waitFor(() => screen.getByText('Errands'));
    fireEvent.press(screen.getByTestId(`start-${created.id}`));
    expect(onStart).toHaveBeenCalledWith(created.id);
  });

  it('blocks Start for a zero-item checklist and shows a validation message on the row', async () => {
    const database = await setupDb();
    const empty = await createChecklist(database, { title: 'Draft', items: [] });
    const onStart = jest.fn();
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={onStart} />,
      { database },
    );

    await waitFor(() => screen.getByText('Draft'));
    expect(screen.getByText(/add at least one item/i)).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId(`start-${empty.id}`));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('asks for confirmation before deleting and only deletes after confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const database = await setupDb();
    const created = await createChecklist(database, {
      title: 'Doomed',
      items: [{ text: 'Bye' }],
    });
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );
    await waitFor(() => screen.getByText('Doomed'));

    fireEvent.press(screen.getByTestId(`delete-${created.id}`));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    const deleteButton = buttons.find((b) => /delete/i.test(b.text ?? ''));
    expect(deleteButton).toBeDefined();
    deleteButton?.onPress?.();

    await waitFor(async () => {
      expect(await getChecklist(database, created.id)).toBeNull();
    });
    alertSpy.mockRestore();
  });

  it('does not delete when the user cancels the confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const database = await setupDb();
    const created = await createChecklist(database, {
      title: 'Saved',
      items: [{ text: 'Stay' }],
    });
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );
    await waitFor(() => screen.getByText('Saved'));

    fireEvent.press(screen.getByTestId(`delete-${created.id}`));
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    const cancelButton = buttons.find((b) => /cancel/i.test(b.text ?? ''));
    cancelButton?.onPress?.();

    const remaining = await listChecklists(database);
    expect(remaining.map((r) => r.id)).toContain(created.id);
    alertSpy.mockRestore();
  });
});
