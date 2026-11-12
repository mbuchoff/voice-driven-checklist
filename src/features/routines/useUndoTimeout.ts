import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Calls `onTimeout` once, `ms` after mounting, or later if Android's
 * accessibility timeout asks for longer. Unmounting cancels it.
 */
export function useUndoTimeout(ms: number, onTimeout: () => void) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const start = (wait: number) => {
      if (!cancelled) timer = setTimeout(() => onTimeoutRef.current(), wait);
    };
    if (Platform.OS === 'android' && AccessibilityInfo.getRecommendedTimeoutMillis) {
      AccessibilityInfo.getRecommendedTimeoutMillis(ms).then(
        (recommended) => start(Math.max(ms, recommended)),
        () => start(ms),
      );
    } else {
      start(ms);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ms]);
}
