import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import type { Database } from '@/src/db/database';
import { runMigrations } from '@/src/db/migrations';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { LibraryScreen } from './LibraryScreen';
import { createRoutine, deleteRoutine, listRoutines } from './repository';
import { offerRoutineUndo } from './routineUndo';
import { routineColorShades } from './routineColors';

async function setupDb(): Promise<Database> {
  const db = createTestDatabase();
  await runMigrations(db);
  return db;
}

describe('LibraryScreen', () => {
  it('offers UNDO after a routine is deleted, putting it back in its place', async () => {
    const database = await setupDb();
    const last = await createRoutine(database, { title: 'Last', steps: [{ text: 'a' }] });
    const doomed = await createRoutine(database, { title: 'Doomed', steps: [{ text: 'b' }] });
    await createRoutine(database, { title: 'First', steps: [{ text: 'c' }] });
    offerRoutineUndo((await deleteRoutine(database, doomed.id))!);

    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );
    expect(await screen.findByText('“Doomed” deleted')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: /undo/i }));

    expect(await screen.findByTestId(`routine-card-${doomed.id}`)).toBeOnTheScreen();
    expect((await listRoutines(database)).map((routine) => routine.title)).toEqual(['First', 'Doomed', 'Last']);
    expect(screen.queryByText('“Doomed” deleted')).toBeNull();
    expect(last.id).toBeTruthy();
  });

  it('keeps the undo offer and reports a failed restore so UNDO can be tried again', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const database = await setupDb();
    const doomed = await createRoutine(database, { title: 'Doomed', steps: [{ text: 'b' }] });
    offerRoutineUndo((await deleteRoutine(database, doomed.id))!);
    await database.execAsync(`
      CREATE TRIGGER reject_restore BEFORE INSERT ON routines
      BEGIN SELECT RAISE(ABORT, 'simulated restore failure'); END;
    `);
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );
    expect(await screen.findByText('“Doomed” deleted')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: /undo/i }));

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(expect.stringMatching(/restore/i), expect.any(String));
    });
    expect(screen.getByText('“Doomed” deleted')).toBeOnTheScreen();
    expect(await listRoutines(database)).toEqual([]);

    await database.execAsync('DROP TRIGGER reject_restore');
    fireEvent.press(screen.getByRole('button', { name: /undo/i }));

    expect(await screen.findByTestId(`routine-card-${doomed.id}`)).toBeOnTheScreen();
    expect((await listRoutines(database)).map((routine) => routine.title)).toEqual(['Doomed']);
  });

  it('ends the undo offer when the routines screen is left', async () => {
    const database = await setupDb();
    const doomed = await createRoutine(database, { title: 'Doomed', steps: [] });
    offerRoutineUndo((await deleteRoutine(database, doomed.id))!);
    const callbacks = { onCreate: jest.fn(), onEdit: jest.fn(), onStart: jest.fn() };
    const view = await renderWithDatabase(<LibraryScreen {...callbacks} active />, { database });
    expect(await screen.findByText('“Doomed” deleted')).toBeOnTheScreen();

    view.rerender(<LibraryScreen {...callbacks} active={false} />);

    await waitFor(() => expect(screen.queryByText('“Doomed” deleted')).toBeNull());
  });

  it('paints each card in its routine’s stored color', async () => {
    const database = await setupDb();
    const slate = await createRoutine(database, {
      title: 'Slate routine', colorKey: 'slate', steps: [{ text: 'Step' }],
    });
    const amber = await createRoutine(database, {
      title: 'Amber routine', colorKey: 'amber-2', steps: [{ text: 'Step' }],
    });
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );

    for (const [routine, key] of [[slate, 'slate'], [amber, 'amber-2']] as const) {
      const card = await screen.findByTestId(`routine-card-${routine.id}`);
      expect(StyleSheet.flatten(card.props.style).backgroundColor).toBe(
        routineColorShades(key, 'light').fill,
      );
    }
  });

  it('shows a recoverable read error instead of claiming the saved library is empty', async () => {
    const database = await setupDb();
    const routine = await createRoutine(database, {
      title: 'Saved routine', steps: [{ text: 'Kept step' }],
    });
    jest.spyOn(database, 'getAllAsync').mockRejectedValueOnce(new Error('temporary read failure'));
    await renderWithDatabase(
      <LibraryScreen onCreate={jest.fn()} onEdit={jest.fn()} onStart={jest.fn()} />,
      { database },
    );
    expect(await screen.findByTestId('library-load-error')).toBeOnTheScreen();
    expect(screen.queryByTestId('library-empty-state')).toBeNull();
    fireEvent.press(screen.getByTestId('library-load-retry'));
    expect(await screen.findByTestId(`routine-card-${routine.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('library-load-error')).toBeNull();
  });

  it('hides stale routines after a failed refresh and restores the current library on retry', async () => {
    const database = await setupDb();
    const routine = await createRoutine(database, {
      title: 'Saved routine', steps: [{ text: 'Kept step' }],
    });
    await createRoutine(database, { title: 'Another routine', steps: [] });
    const callbacks = { onCreate: jest.fn(), onEdit: jest.fn(), onStart: jest.fn() };
    const view = await renderWithDatabase(
      <LibraryScreen {...callbacks} refreshKey={0} />,
      { database },
    );
    await screen.findByTestId(`routine-card-${routine.id}`);
    expect(screen.getByLabelText('Learn how to move routines')).toBeOnTheScreen();

    jest.spyOn(database, 'getAllAsync').mockRejectedValueOnce(new Error('temporary read failure'));
    view.rerender(<LibraryScreen {...callbacks} refreshKey={1} />);
    await screen.findByTestId('library-load-error');
    expect(screen.queryAllByTestId(/^routine-card-/)).toHaveLength(0);
    expect(screen.queryByLabelText('Learn how to move routines')).toBeNull();
    expect(screen.queryByTestId('library-empty-state')).toBeNull();

    const added = await createRoutine(database, { title: 'Added while away', steps: [] });
    fireEvent.press(screen.getByTestId('library-load-retry'));
    await screen.findByTestId(`routine-card-${added.id}`);
    expect(screen.getByTestId(`routine-card-${routine.id}`)).toBeOnTheScreen();
    expect(screen.getByLabelText('Learn how to move routines')).toBeOnTheScreen();
    expect(screen.queryByTestId('library-load-error')).toBeNull();
  });

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
    const routine = await createRoutine(database, {
      title: 'Morning routine with a deliberately long title',
      steps: [
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

  it('navigates immediately on successful releases but not cancelled card, Play, New, or Settings contacts', async () => {
    const database = await setupDb();
    const routine = await createRoutine(database, {
      title: 'Errands',
      steps: [{ text: 'Bank' }],
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

    // Scrolling can cancel press feedback; neither contact nor its cancellation
    // may navigate, even once the animation would have finished.
    jest.useFakeTimers();
    try {
      for (const name of [`Edit ${routine.title}`, `Start ${routine.title}`, 'New routine', 'Settings']) {
        const button = screen.getByRole('button', { name });
        fireEvent(button, 'pressIn');
        act(() => jest.advanceTimersByTime(120));
        fireEvent(button, 'pressOut');
        act(() => jest.advanceTimersByTime(500));
      }
      for (const callback of [onEdit, onStart, onCreate, onSettings]) {
        expect(callback).not.toHaveBeenCalled();
      }
    } finally { jest.useRealTimers(); }

    fireEvent.press(
      screen.getByRole('button', { name: `Edit ${routine.title}` }),
    );
    expect(onEdit).toHaveBeenCalledWith(routine.id);

    fireEvent.press(
      screen.getByRole('button', { name: `Start ${routine.title}` }),
    );
    expect(onStart).toHaveBeenCalledWith(routine.id);

    fireEvent.press(screen.getByRole('button', { name: /new routine/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole('button', { name: /settings/i }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps Play in place but disables it for an empty routine', async () => {
    const database = await setupDb();
    const empty = await createRoutine(database, {
      title: 'Draft',
      steps: [],
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
    const routine = await createRoutine(database, {
      title: 'Errands',
      steps: [{ text: 'Bank' }],
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

  it('keeps the header fixed outside the scrolling content and below Android system insets', async () => {
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
      within(screen.getByTestId('library-scroll')).queryByTestId(
        'library-header',
      ),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: /new routine/i }),
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
    const routine = await createRoutine(database, {
      title: 'Added elsewhere',
      steps: [{ text: 'Return home' }],
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
