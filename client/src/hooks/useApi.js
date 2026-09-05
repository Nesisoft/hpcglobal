import { useState, useEffect, useRef, useCallback } from 'react';

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
