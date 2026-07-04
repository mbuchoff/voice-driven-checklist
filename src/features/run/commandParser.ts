export type ParsedCommand = 'next' | 'repeat' | 'previous' | null;

const COMMANDS = new Set(['next', 'repeat', 'previous']);
const INTERIM_SUFFIXES: Record<Exclude<ParsedCommand, null>, Set<string>> = {
  next: new Set(['item', 'one', 'please']),
  repeat: new Set(['that', 'please']),
  previous: new Set(['item', 'one', 'please']),
};

function wordsFor(input: string): string[] {
  return input.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

// The speech recognizer often returns a command keyword embedded in a longer
// phrase ("next it", "go to the next one") or with a trailing plural
// ("repeats"). Scan the phrase word by word and return the first keyword we
// find so those near-misses still drive the run.
export function parseCommand(input: string): ParsedCommand {
  const words = wordsFor(input);

  for (const word of words) {
    if (COMMANDS.has(word)) return word as ParsedCommand;
    // Tolerate a trailing plural "s" ("repeats" -> "repeat", "nexts" -> "next").
    if (word.endsWith('s') && COMMANDS.has(word.slice(0, -1))) {
      return word.slice(0, -1) as ParsedCommand;
    }
  }

  return null;
}

export function parseInterimCommand(input: string): ParsedCommand {
  const words = wordsFor(input);
  if (words.length < 1 || words.length > 2) return null;

  const command = words[0];
  if (!COMMANDS.has(command)) return null;
  if (words.length === 1) return command as Exclude<ParsedCommand, null>;

  const parsed = command as Exclude<ParsedCommand, null>;
  return INTERIM_SUFFIXES[parsed].has(words[1]) ? parsed : null;
}
