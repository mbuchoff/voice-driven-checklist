import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Database } from '@/src/db/database';
import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { LibraryScreen } from './LibraryScreen';
import { createChecklist } from './repository';

async function setupDb(): Promise<Database> {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

describe('LibraryScreen', () => {
  it('shows an empty state without rendering routine cards', async () => {
    const database = await setupDb();
    await renderWithDatabase(
      <LibraryScreen
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onStart={jest.fn()}
      />,
      { database },
    );

    await waitFor(() => {
      expect(screen.getByTestId('library-empty-state')).toBeOnTheScreen();
    });
    expect(screen.queryByTestId(/^routine-card-/)).toBeNull();
  });

  it('renders every saved step inside a fixed-height, clipped routine card', async () => {
    const database = await setupDb();
    const routine = await createChecklist(database, {
      title: 'Morning routine with a deliberately long title',
      items: [
        { text: 'Open blinds' },
        { text: 'Drink a full glass of water before making breakfast' },
        { text: 'Leave with keys, phone, wallet, and packed lunch' },
      ],
    });

    await renderWithDatabase(
      <LibraryScreen
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onStart={jest.fn()}
      />,
      { database },
    );

    const card = await screen.findByTestId(`routine-card-${routine.id}`);
    expect(within(card).getByText(routine.title)).toBeOnTheScreen();
    expect(within(card).getByText(/3 steps/i)).toBeOnTheScreen();
    const stepList = within(card).getByTestId(
      `routine-step-list-${routine.id}`,
    );
    expect(stepList.props.children).toContain('Open blinds');
    expect(stepList.props.children).toContain('packed lunch');
    expect(
      StyleSheet.flatten(
        within(card).getByTestId(`routine-card-content-${routine.id}`).props
          .style,
      ),
    ).toEqual(
      expect.objectContaining({
        justifyContent: 'flex-start',
        overflow: 'hidden',
      }),
    );
  });

  it('runs card, Play, New, and Settings actions after inward feedback', async () => {
    const database = await setupDb();
    const routine = await createChecklist(database, {
      title: 'Errands',
      items: [{ text: 'Bank' }],
    });
    const onCreate = jest.fn();
    const onEdit = jest.fn();
    const onStart = jest.fn();
    const onSettings = jest.fn();
    await renderWithDatabase(
      <LibraryScreen
        onCreate={onCreate}
        onEdit={onEdit}
        onStart={onStart}
        onSettings={onSettings}
      />,
      { database },
    );
    await screen.findByTestId(`routine-card-${routine.id}`);

    fireEvent.press(
      screen.getByRole('button', { name: `Edit ${routine.title}` }),
    );
    expect(onEdit).not.toHaveBeenCalled();
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(routine.id));

    fireEvent.press(
      screen.getByRole('button', { name: `Start ${routine.title}` }),
    );
    expect(onStart).not.toHaveBeenCalled();
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(routine.id));

    fireEvent.press(screen.getByRole('button', { name: /new checklist/i }));
    expect(onCreate).not.toHaveBeenCalled();
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByRole('button', { name: /settings/i }));
    expect(onSettings).not.toHaveBeenCalled();
    await waitFor(() => expect(onSettings).toHaveBeenCalledTimes(1));
  });

  it('keeps Play in place but disables it for an empty routine', async () => {
    const database = await setupDb();
    const empty = await createChecklist(database, {
      title: 'Draft',
      items: [],
    });
    const onStart = jest.fn();
    await renderWithDatabase(
      <LibraryScreen
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onStart={onStart}
      />,
      { database },
    );
    await screen.findByTestId(`routine-card-${empty.id}`);

    const play = screen.getByRole('button', { name: `Start ${empty.title}` });
    expect(play).toBeDisabled();
    fireEvent.press(play);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('does not expose separate Edit or Delete controls on a routine card', async () => {
    const database = await setupDb();
    const routine = await createChecklist(database, {
      title: 'Errands',
      items: [{ text: 'Bank' }],
    });
    await renderWithDatabase(
      <LibraryScreen
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onStart={jest.fn()}
      />,
      { database },
    );
    await screen.findByTestId(`routine-card-${routine.id}`);

    expect(screen.queryByTestId(`edit-${routine.id}`)).toBeNull();
    expect(screen.queryByTestId(`delete-${routine.id}`)).toBeNull();
    expect(screen.queryByTestId(`delete-icon-${routine.id}`)).toBeNull();
  });

  it('keeps the header sticky and below Android system insets', async () => {
    const database = await setupDb();
    await renderWithDatabase(
      <LibraryScreen
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onStart={jest.fn()}
      />,
      { database },
    );

    expect(screen.getByTestId('library-safe-area').props.edges.top).toBe(
      'additive',
    );
    expect(
      screen.getByTestId('library-scroll').props.stickyHeaderIndices,
    ).toEqual([0]);
    expect(
      screen.getByRole('button', { name: /new checklist/i }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /settings/i }),
    ).toBeOnTheScreen();
  });

  it('reloads the library when its refresh key changes', async () => {
    const database = await setupDb();
    const callbacks = {
      onCreate: jest.fn(),
      onEdit: jest.fn(),
      onStart: jest.fn(),
    };
    const view = await renderWithDatabase(
      <LibraryScreen {...callbacks} refreshKey={0} />,
      { database },
    );
    await screen.findByTestId('library-empty-state');
    const routine = await createChecklist(database, {
      title: 'Added elsewhere',
      items: [{ text: 'Return home' }],
    });

    view.rerender(<LibraryScreen {...callbacks} refreshKey={1} />);

    expect(
      await screen.findByTestId(`routine-card-${routine.id}`),
    ).toBeOnTheScreen();
  });

  it('keeps backup and restore out of the library surface', async () => {
    const database = await setupDb();
    await renderWithDatabase(
      <LibraryScreen
        onCreate={jest.fn()}
        onEdit={jest.fn()}
        onStart={jest.fn()}
      />,
      { database },
    );

    expect(screen.queryByTestId('export-checklists')).toBeNull();
    expect(screen.queryByTestId('import-checklists')).toBeNull();
  });
});
