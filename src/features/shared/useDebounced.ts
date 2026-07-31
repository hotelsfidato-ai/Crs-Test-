import { useEffect, useState } from "react";

/**
 * Trails a value by `delay` ms.
 *
 * ⚠️ Used to gate Firestore queries behind typing. Every keystroke that
 * reaches a query is a document read, and on the Spark plan those come
 * out of a 50k daily budget shared with everything else.
 */
export function useDebounced<T>(value: T, delay = 400): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
