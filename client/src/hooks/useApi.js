import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Runs `fetchFn` on mount and whenever `deps` change.
 *
 * `deps` drives the refetch on its own — a memoized `fetchFn` closing over
 * newer state is not enough, because the effect only re-runs when `deps`
 * change. So whatever `fetchFn` is memoized on has to be repeated here:
 *
 *   const fetchFn = useCallback(() => api.getPosts({ page }), [page]);
 *   useApi(fetchFn, [page]);   // omitting [page] silently pins page 1
 *
 * Callers passing a stable reference (an api method, or a useCallback with no
 * dependencies of its own) can leave `deps` off.
 */
export function useApi(fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bumped on every run so a slow response from a superseded call (an earlier
  // filter selection, say) can't land on top of a newer one.
  const runIdRef = useRef(0);

  const execute = useCallback(async () => {
    const runId = ++runIdRef.current;
    const isCurrent = () => runIdRef.current === runId;

    setLoading(true);
    setError(null);
    try {
      const res = await fetchFn();
      if (isCurrent()) setData(res.data);
    } catch (err) {
      if (isCurrent()) {
        setError(err.response?.data?.message || err.message || 'Something went wrong');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { execute(); }, [execute]);

  return { data, loading, error, refetch: execute };
}
