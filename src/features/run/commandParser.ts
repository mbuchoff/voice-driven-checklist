export type ParsedCommand = 'next' | 'repeat' | 'previous' | null;

const COMMANDS = new Set(['next', 'repeat', 'previous']);

// The speech recognizer often returns a command keyword embedded in a longer
// phrase ("next it", "go to the next one") or with a trailing plural
// ("repeats"). Scan the phrase word by word and return the first keyword we
// find so those near-misses still drive the run.
export function parseCommand(input: string): ParsedCommand {
  const words = input.toLowerCase().split(/[^a-z]+/).filter(Boolean);

  for (const word of words) {
    if (COMMANDS.has(word)) return word as ParsedCommand;
    // Tolerate a trailing plural "s" ("repeats" -> "repeat"). Checked after the
    // exact match so "previous" is never stripped to a non-command.
    if (word.endsWith('s') && COMMANDS.has(word.slice(0, -1))) {
      return word.slice(0, -1) as ParsedCommand;
    }
  }

  return null;
}
