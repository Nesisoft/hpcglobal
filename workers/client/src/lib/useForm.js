import { useCallback, useRef, useState } from 'react';

/**
 * Form state with the server as the judge: the API answers a bad field with
 * `{ message, field }`, and the message is shown under that field (or above
 * the form when it names no field).
 */
export function useForm(initial) {
  const [values, setValuesState] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  // The fields the form has boxes for (its current values' names), read when
  // a refusal arrives.
  const initialFields = useRef(initial);
  const setValues = useCallback((next) => {
    setValuesState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      initialFields.current = value;
      return value;
    });
  }, []);

  const set = useCallback((name) => (e) => {
    const value = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((errs) => (errs[name] ? { ...errs, [name]: undefined } : errs));
  }, []);

  /** Run `action`; on a refusal, put its message where it belongs. Returns the result or undefined. */
  const submit = useCallback(async (action) => {
    setBusy(true);
    setFormError('');
    setErrors({});
    try {
      return await action();
    } catch (err) {
      const fieldErrors = err.body?.errors && Object.keys(err.body.errors).length
        ? err.body.errors
        : err.field ? { [err.field]: err.message } : null;
      if (fieldErrors) {
        setErrors(fieldErrors);
        // A problem with something the form has no box for would otherwise
        // show nowhere: say it above the form instead.
        const unshown = Object.entries(fieldErrors).filter(([name]) => !(name in (initialFields.current || {})));
        if (unshown.length) setFormError(unshown.map(([, message]) => message).join(' '));
      } else {
        setFormError(err.message);
      }
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { values, setValues, set, errors, setErrors, formError, setFormError, busy, submit };
}
