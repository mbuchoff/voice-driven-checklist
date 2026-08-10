import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRate = 44100;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(root, 'assets/audio/cues');

const families = {
  chime: {
    next: [[523.25, 0, 0.2, 'sine', 0.1], [659.25, 0.11, 0.3, 'sine', 0.08]],
    previous: [[659.25, 0, 0.18, 'sine', 0.09], [493.88, 0.1, 0.28, 'sine', 0.075]],
    repeat: [[587.33, 0, 0.16, 'sine', 0.085], [587.33, 0.17, 0.24, 'sine', 0.065]],
    complete: [[523.25, 0, 0.18, 'sine', 0.09], [659.25, 0.11, 0.24, 'sine', 0.08], [783.99, 0.23, 0.4, 'sine', 0.075]],
  },
  wood: {
    next: [[185, 0, 0.09, 'triangle', 0.13], [246.94, 0.045, 0.12, 'sine', 0.08]],
    previous: [[196, 0, 0.09, 'triangle', 0.12], [130.81, 0.045, 0.13, 'sine', 0.085]],
    repeat: [[164.81, 0, 0.08, 'triangle', 0.12], [164.81, 0.12, 0.1, 'triangle', 0.09]],
    complete: [[164.81, 0, 0.09, 'triangle', 0.12], [220, 0.08, 0.11, 'triangle', 0.11], [329.63, 0.18, 0.18, 'sine', 0.08]],
  },
  ping: {
    next: [[880, 0, 0.14, 'sine', 0.08], [1318.51, 0.07, 0.2, 'sine', 0.06]],
    previous: [[1046.5, 0, 0.13, 'sine', 0.075], [783.99, 0.07, 0.2, 'sine', 0.06]],
    repeat: [[987.77, 0, 0.11, 'sine', 0.07], [987.77, 0.14, 0.17, 'sine', 0.05]],
    complete: [[783.99, 0, 0.13, 'sine', 0.07], [1046.5, 0.09, 0.17, 'sine', 0.065], [1567.98, 0.2, 0.3, 'sine', 0.055]],
  },
};

function oscillator(type, phase) {
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  return Math.sin(phase);
}

function render(notes) {
  const seconds = Math.max(...notes.map(([, delay, duration]) => delay + duration)) + 0.02;
  const sampleCount = Math.ceil(seconds * sampleRate);
  const samples = new Int16Array(sampleCount);

  for (const [frequency, delay, duration, type, gain] of notes) {
    const start = Math.floor(delay * sampleRate);
    const length = Math.floor(duration * sampleRate);
    for (let index = 0; index < length && start + index < sampleCount; index += 1) {
      const elapsed = index / sampleRate;
      const attack = Math.min(1, elapsed / 0.012);
      const release = Math.max(0, 1 - elapsed / duration);
      const envelope = attack * release * release;
      const value = oscillator(type, 2 * Math.PI * frequency * elapsed) * gain * envelope;
      const mixed = samples[start + index] + Math.round(value * 32767);
      samples[start + index] = Math.max(-32768, Math.min(32767, mixed));
    }
  }

  const dataLength = samples.byteLength;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

mkdirSync(outputDirectory, { recursive: true });
for (const [family, actions] of Object.entries(families)) {
  for (const [action, notes] of Object.entries(actions)) {
    writeFileSync(resolve(outputDirectory, `${family}-${action}.wav`), render(notes));
  }
}
