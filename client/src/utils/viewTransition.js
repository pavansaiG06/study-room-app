import { flushSync } from 'react-dom';

/**
 * Progressively runs DOM/React state updates inside document.startViewTransition()
 * when supported and reduced-motion is not active, then moves focus to the view root
 * for keyboard & screen-reader continuity.
 */
export function runViewTransition(updateFn, focusTargetRef = null) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const routeFocus = () => {
    if (focusTargetRef?.current) {
      requestAnimationFrame(() => {
        focusTargetRef.current?.focus({ preventScroll: true });
      });
    }
  };

  if (typeof document !== 'undefined' && document.startViewTransition && !prefersReduced) {
    try {
      const transition = document.startViewTransition(() => {
        flushSync(() => {
          updateFn();
        });
      });
      transition.finished.finally(routeFocus);
      return;
    } catch {
      // Fall through to synchronous update
    }
  }

  updateFn();
  routeFocus();
}
