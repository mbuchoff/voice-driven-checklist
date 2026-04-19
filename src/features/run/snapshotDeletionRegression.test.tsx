import { fireEvent, screen, render, act } from '@testing-library/react-native';

import { runMigrations } from '@/src/db/migrations';
import {
  createChecklist,
  deleteChecklist,
  getChecklist,
} from '@/src/features/checklists/repository';
import { createSnapshot } from '@/src/features/run/snapshot';
import { RunScreen } from '@/src/features/run/RunScreen';
import {
  FakeSpeechPlaybackAdapter,
  FakeSpeechRecognitionAdapter,
} from '@/src/services/speech/fakes';
import { createTestDatabase } from '@/src/test/createTestDatabase';

async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe('regression: snapshot survives source deletion mid-run', () => {
  it('finishes the run from the in-memory snapshot even after the source checklist is deleted from SQLite', async () => {
    const db = createTestDatabase();
    await runMigrations(db);
    const created = await createChecklist(db, {
      title: 'Doomed',
      items: [{ text: 'first' }, { text: 'second' }],
    });
    const snapshot = createSnapshot(created);

    const playback = new FakeSpeechPlaybackAdapter();
    const recognition = new FakeSpeechRecognitionAdapter();
    const onExit = jest.fn();
    const onCompletion = jest.fn();

    render(
      <RunScreen
        snapshot={snapshot}
        playback={playback}
        recognition={recognition}
        initialAvailability={{ spokenPlaybackAvailable: true, voiceControlAvailable: true }}
        onExit={onExit}
        onCompletion={onCompletion}
      />,
    );
    await flush();

    // Delete the source while the run is in progress.
    await deleteChecklist(db, created.id);
    expect(await getChecklist(db, created.id)).toBeNull();

    // The run continues from the in-memory snapshot.
    fireEvent.press(screen.getByTestId('manual-next'));
    await flush();
    fireEvent.press(screen.getByTestId('manual-next'));
    await flush();

    expect(screen.getByText(/checklist complete/i)).toBeOnTheScreen();
    expect(onCompletion).toHaveBeenCalledTimes(1);
    expect(playback.spoken).toEqual(['first', 'second']);
  });
});
