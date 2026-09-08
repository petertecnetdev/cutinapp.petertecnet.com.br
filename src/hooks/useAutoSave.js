import { useCallback, useEffect, useRef, useState } from "react";

const defaultSerialize = (value) => JSON.stringify(value);

/**
 * Autosave para formulários de edição.
 *
 * - não salva o valor inicial carregado do servidor;
 * - salva depois de um pequeno período sem alterações;
 * - flush() força o salvamento (ideal para onBlur do formulário);
 * - serializa as requisições para evitar respostas fora de ordem;
 * - não envia enquanto validate() retornar false.
 */
export default function useAutoSave({
  value,
  onSave,
  enabled = true,
  delay = 800,
  validate = () => true,
  serialize = defaultSerialize,
}) {
  const [status, setStatus] = useState("idle");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const timerRef = useRef(null);
  const initializedRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const currentSnapshotRef = useRef("");
  const currentValueRef = useRef(value);
  const onSaveRef = useRef(onSave);
  const validateRef = useRef(validate);
  const serializeRef = useRef(serialize);

  useEffect(() => { currentValueRef.current = value; }, [value]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { validateRef.current = validate; }, [validate]);
  useEffect(() => { serializeRef.current = serialize; }, [serialize]);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const runSave = useCallback(async (nextValue = currentValueRef.current, snapshot = currentSnapshotRef.current) => {
    clearTimer();
    if (!enabled || !initializedRef.current || !snapshot || snapshot === lastSavedSnapshotRef.current) return false;

    if (!validateRef.current(nextValue)) {
      setStatus("dirty");
      return false;
    }

    if (savingRef.current) {
      queuedRef.current = true;
      return false;
    }

    savingRef.current = true;
    setStatus("saving");
    setSaveError(null);

    try {
      await onSaveRef.current(nextValue);
      lastSavedSnapshotRef.current = snapshot;
      setLastSavedAt(new Date());
      setStatus(currentSnapshotRef.current === snapshot ? "saved" : "dirty");
      return true;
    } catch (error) {
      setSaveError(error);
      setStatus("error");
      return false;
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        const latestSnapshot = currentSnapshotRef.current;
        const latestValue = currentValueRef.current;
        if (latestSnapshot && latestSnapshot !== lastSavedSnapshotRef.current) {
          window.setTimeout(() => runSave(latestValue, latestSnapshot), 0);
        }
      }
    }
  }, [clearTimer, enabled]);

  useEffect(() => {
    if (!enabled || value === null || value === undefined) return undefined;

    let snapshot;
    try {
      snapshot = serialize(value);
    } catch {
      return undefined;
    }

    currentSnapshotRef.current = snapshot;

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSavedSnapshotRef.current = snapshot;
      setStatus("idle");
      return undefined;
    }

    if (snapshot === lastSavedSnapshotRef.current) {
      if (!savingRef.current) setStatus("saved");
      return undefined;
    }

    setStatus("dirty");
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      runSave(currentValueRef.current, currentSnapshotRef.current);
    }, delay);

    return clearTimer;
  }, [value, enabled, delay, serialize, clearTimer, runSave]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const flush = useCallback(() => {
    if (!enabled || !initializedRef.current) return Promise.resolve(false);
    return runSave(currentValueRef.current, currentSnapshotRef.current);
  }, [enabled, runSave]);

  const reset = useCallback((nextValue = currentValueRef.current) => {
    clearTimer();
    let snapshot = "";
    try {
      snapshot = serializeRef.current(nextValue);
    } catch {
      snapshot = "";
    }
    currentValueRef.current = nextValue;
    currentSnapshotRef.current = snapshot;
    lastSavedSnapshotRef.current = snapshot;
    initializedRef.current = Boolean(snapshot);
    queuedRef.current = false;
    setSaveError(null);
    setStatus("idle");
  }, [clearTimer]);

  return {
    status,
    lastSavedAt,
    saveError,
    flush,
    reset,
    isSaving: status === "saving",
    isDirty: status === "dirty" || status === "error",
  };
}
