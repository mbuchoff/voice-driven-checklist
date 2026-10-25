import { useRef } from 'react';
import type { GestureResponderEvent, NativeTouchEvent } from 'react-native';

import { routineHoldShouldYield } from './routineMotion';

// Pressability forwards responder payloads for pointers, but Android's
// ViewGroupClickEvent supplies an empty nativeEvent for accessibility clicks.
type ActivationEvent = {
  nativeEvent: Partial<Pick<NativeTouchEvent, 'pageX' | 'pageY' | 'touches'>>;
};

export function useRoutinePressGuard({
  gestureEnabled,
  isGestureCancelled,
  isSuppressed,
}: {
  gestureEnabled: boolean;
  isGestureCancelled: () => boolean;
  isSuppressed: () => boolean;
}) {
  const contact = useRef<{
    x: number;
    y: number;
    cancelled: boolean;
    checkGesture: boolean;
  } | null>(null);

  const trackMovement = ({ nativeEvent }: ActivationEvent) => {
    const current = contact.current;
    if (!current) return;
    if ((nativeEvent.touches?.length ?? 0) > 1 || (
      typeof nativeEvent.pageX === 'number' && typeof nativeEvent.pageY === 'number'
      && routineHoldShouldYield(nativeEvent.pageX - current.x, nativeEvent.pageY - current.y)
    )) current.cancelled = true;
  };

  return {
    onTouchStart: ({ nativeEvent }: GestureResponderEvent) => {
      contact.current = {
        x: nativeEvent.pageX,
        y: nativeEvent.pageY,
        cancelled: nativeEvent.touches.length !== 1,
        // Keep the owner for this whole contact, even if saving finishes before
        // release. Disabled recognizers never receive this pointer's down event.
        checkGesture: gestureEnabled,
      };
    },
    onTouchMove: trackMovement,
    onTouchCancel: () => {
      if (contact.current) contact.current.cancelled = true;
    },
    allowsPress: (event?: ActivationEvent) => {
      // The short post-drop cooldown gates all selections while cards settle.
      if (isSuppressed()) return false;
      if (event?.nativeEvent.touches === undefined) return true;
      trackMovement(event);
      if (contact.current?.cancelled) return false;
      // No RN-to-UI reset: disabled contacts are decided entirely on RN, while
      // enabled contacts still honor UI-owned drag/second-pointer cancellation.
      return contact.current?.checkGesture === false || !isGestureCancelled();
    },
  };
}

export type RoutinePressGuard = ReturnType<typeof useRoutinePressGuard>;
