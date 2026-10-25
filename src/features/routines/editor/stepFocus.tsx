import { forwardRef, useEffect, useRef, type ComponentRef } from 'react';
import { Keyboard, TextInput } from 'react-native';

type Field = ComponentRef<typeof TextInput>;

/**
 * Where focus and the keyboard go as the open step changes.
 *
 * On Android, when the focused field disappears, focus jumps to the next
 * focusable view (often the name) and the keyboard stays up; and Android
 * ignores a request to show the keyboard for a field it hasn't laid out yet.
 * So a tap or Enter that opens a step hands the keyboard to a hidden holder
 * first, and the step's field takes it once it exists (which also keeps it up
 * between two steps); one that closes the open step lets go of the keyboard
 * while its field is still there. The timer panel puts typing aside while
 * its step stays open.
 */
export function useStepFocus(openId: string | null) {
  const holderRef = useRef<Field>(null);
  const fields = useRef<Record<string, Field | null>>({});
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  // The timer panel is up: the open step's field has let go on purpose.
  const panelUp = useRef(false);

  useEffect(() => {
    if (!openId) return;
    const frame = requestAnimationFrame(() => fields.current[openId]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [openId]);

  return {
    holderRef,
    fieldRef: (id: string) => (field: Field | null) => {
      fields.current[id] = field;
    },
    /** A tap or Enter moved the open step from `from` to `to`. */
    handOff(from: string | null, to: string | null) {
      if (to && to !== from) holderRef.current?.focus();
      else if (from && !to) Keyboard.dismiss();
    },
    /** The timer panel opens over the open step. */
    putTypingAside() {
      panelUp.current = true;
      Keyboard.dismiss();
    },
    /** The timer panel closed: back to typing in step `id` if it's still open. */
    resumeTyping(id: string) {
      requestAnimationFrame(() => {
        panelUp.current = false;
        if (openIdRef.current === id) fields.current[id]?.focus();
      });
    },
    /**
     * Step `id`'s field lost focus. Unless the timer panel took it, or the
     * field has it again (focus moving between views), `close` runs.
     */
    fieldBlurred(id: string, close: () => void) {
      if (panelUp.current) return;
      setTimeout(() => {
        if (panelUp.current || fields.current[id]?.isFocused?.()) return;
        close();
      }, 0);
    },
  };
}

/**
 * Holds the keyboard between one step's field and the next. It types like a
 * step's field, so the keyboard doesn't change, and keeps nothing typed.
 */
export const KeyboardHolder = forwardRef<TextInput>(function KeyboardHolder(_props, ref) {
  return (
    <TextInput
      ref={ref}
      testID="keyboard-holder"
      value=""
      multiline
      submitBehavior="submit"
      returnKeyType="done"
      caretHidden
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, padding: 0, opacity: 0 }}
    />
  );
});
