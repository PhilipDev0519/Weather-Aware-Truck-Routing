import { useEffect } from "react";

// Draw the rest of the layer's frames while the browser is idle, so scrubbing
// or playing never waits for a frame to be drawn.
export function usePrerender(frameUrl: ((hour: number) => string) | null, hours: number) {
  useEffect(() => {
    if (!frameUrl) return;
    const idle =
      window.requestIdleCallback ??
      ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 10 }), 50));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    let hour = 0;
    let handle = 0;
    const work = (deadline: IdleDeadline) => {
      while (hour <= hours && deadline.timeRemaining() > 5) frameUrl(hour++);
      if (hour <= hours) handle = idle(work);
    };
    handle = idle(work);
    return () => cancel(handle);
  }, [frameUrl, hours]);
}
