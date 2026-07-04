import { requestRunStopConfirmation, RUN_STOP_CONFIRMATION } from './stopConfirmation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('requestRunStopConfirmation', () => {
  it('keeps the active run open when stop confirmation is canceled', async () => {
    const confirm = jest.fn().mockResolvedValue(false);
    const exitRun = jest.fn();
    const pendingRef = { current: false };

    await requestRunStopConfirmation({ confirm, exitRun, pendingRef });

    expect(confirm).toHaveBeenCalledWith(RUN_STOP_CONFIRMATION);
    expect(exitRun).not.toHaveBeenCalled();
    expect(pendingRef.current).toBe(false);
  });

  it('exits the run when stop confirmation is accepted', async () => {
    const confirm = jest.fn().mockResolvedValue(true);
    const exitRun = jest.fn();
    const pendingRef = { current: false };

    await requestRunStopConfirmation({ confirm, exitRun, pendingRef });

    expect(exitRun).toHaveBeenCalledTimes(1);
    expect(pendingRef.current).toBe(false);
  });

  it('ignores duplicate stop requests while confirmation is pending and recovers afterward', async () => {
    const confirmation = deferred<boolean>();
    const confirm = jest.fn().mockReturnValueOnce(confirmation.promise).mockResolvedValueOnce(false);
    const exitRun = jest.fn();
    const pendingRef = { current: false };

    const firstRequest = requestRunStopConfirmation({ confirm, exitRun, pendingRef });
    await requestRunStopConfirmation({ confirm, exitRun, pendingRef });

    expect(confirm).toHaveBeenCalledTimes(1);

    confirmation.resolve(false);
    await firstRequest;
    await requestRunStopConfirmation({ confirm, exitRun, pendingRef });

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(exitRun).not.toHaveBeenCalled();
    expect(pendingRef.current).toBe(false);
  });

  it('reports pending state while stop confirmation is open', async () => {
    const confirmation = deferred<boolean>();
    const confirm = jest.fn().mockReturnValue(confirmation.promise);
    const setPending = jest.fn();
    const pendingRef = { current: false };

    const request = requestRunStopConfirmation({
      confirm,
      exitRun: jest.fn(),
      pendingRef,
      setPending,
    });

    expect(setPending).toHaveBeenCalledWith(true);

    confirmation.resolve(false);
    await request;

    expect(setPending).toHaveBeenLastCalledWith(false);
  });
});
