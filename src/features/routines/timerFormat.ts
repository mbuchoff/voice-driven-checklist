/** How timer lengths read: on chips and clocks, aloud, and in a routine's count line. */

/** Chips, step clocks, the timer panel's readout and the routine total: 1 min 30s. */
export function formatTimerLong(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest ? ` ${rest}s` : ''}`;
}

/** Spoken by TalkBack: 1 minute 30 seconds. */
export function formatTimerWords(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (minutes) parts.push(minutes === 1 ? '1 minute' : `${minutes} minutes`);
  if (rest || !minutes) parts.push(rest === 1 ? '1 second' : `${rest} seconds`);
  return parts.join(' ');
}

/** "14 steps · 10 min timed", "1 step", "No steps yet". */
export function countLine(stepCount: number, timedSeconds: number): string {
  if (stepCount === 0) return 'No steps yet';
  const steps = stepCount === 1 ? '1 step' : `${stepCount} steps`;
  return timedSeconds > 0 ? `${steps} · ${formatTimerLong(timedSeconds)} timed` : steps;
}
