export type ParsedCommand = 'next' | 'repeat' | 'previous' | null;

const COMMANDS = new Set(['next', 'repeat', 'previous']);

export function parseCommand(input: string): ParsedCommand {
  const normalized = input.trim().toLowerCase();
  return (COMMANDS.has(normalized) ? normalized : null) as ParsedCommand;
}
