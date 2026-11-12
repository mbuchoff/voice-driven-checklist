import { scrollToKeepAboveKeyboard } from './keepAboveKeyboard';

// A list whose viewport starts 112 dp down the screen, with the keyboard's
// top at 552 dp: 440 dp of the list show above it.
const screen = { viewportTop: 112, keyboardTop: 552, margin: 24 };

describe('scrollToKeepAboveKeyboard', () => {
  it('leaves the list alone when the whole step already shows above the keyboard', () => {
    expect(scrollToKeepAboveKeyboard({ ...screen, top: 300, bottom: 356, scrollY: 0 })).toBeNull();
  });

  it('scrolls just far enough for the step’s bottom, chips included, to clear the keyboard', () => {
    // The step and its chips end at 560 in the list; 560 + 24 must be at most
    // scrollY + 440.
    expect(scrollToKeepAboveKeyboard({ ...screen, top: 454, bottom: 560, scrollY: 0 })).toBe(144);
  });

  it('keeps the step’s top in view when the step is taller than the room above the keyboard', () => {
    expect(scrollToKeepAboveKeyboard({ ...screen, top: 600, bottom: 1200, scrollY: 0 })).toBe(576);
  });

  it('scrolls back up to a step whose top is hidden above the list', () => {
    expect(scrollToKeepAboveKeyboard({ ...screen, top: 100, bottom: 156, scrollY: 300 })).toBe(76);
  });
});
