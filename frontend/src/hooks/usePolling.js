import { useState, useEffect, useRef, useCallback } from 'react';

export function usePolling(fetchFn, interval = 2000, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) return;
    fetch_();
    timerRef.current = setInterval(fetch_, interval);
    return () => clearInterval(timerRef.current);
  }, [fetch_, interval, enabled]);

  return { data, error, loading, refetch: fetch_ };
}

export function useOnce(fetchFn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, error, loading, refetch: fetch_ };
}
