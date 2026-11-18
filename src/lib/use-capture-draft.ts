import { useCallback, useEffect, useRef, useState } from "react";
import { deleteCaptureDraft, getCaptureDraft, putCaptureDraft, type CaptureDraft } from "./db";
import type { EditSettings } from "./imaging";

export function useCaptureDraft(id: string) {
  const [captured, setCaptured] = useState<File[]>([]);
  const [approved, setApproved] = useState<Set<File>>(new Set());
  const [reviewSettings, setReviewSettings] = useState<Map<File, EditSettings>>(new Map());
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    setReady(false);
    void getCaptureDraft(id)
      .then((draft) => {
        if (!active) return;
        const items = draft?.items ?? [];
        const files = items.map(
          (item, i) =>
            new File([item.file], item.name ?? item.file.name ?? `capture-${i}.jpg`, {
              type: item.file.type,
              lastModified: item.lastModified ?? item.file.lastModified,
            }),
        );
        setCaptured(files);
        setApproved(new Set(files.filter((_, i) => items[i].approved)));
        setReviewSettings(new Map(files.map((file, i) => [file, items[i].settings])));
        setReady(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const persist = useCallback((draft: CaptureDraft) => {
    const version = ++generation.current;
    setSaving(true);
    const pending = queue.current
      .catch(() => {})
      .then(() => (draft.items.length ? putCaptureDraft(draft) : deleteCaptureDraft(draft.id)));
    queue.current = pending;
    void pending.then(
      () => {
        if (version === generation.current) {
          setError(false);
          setSaving(false);
        }
      },
      () => {
        if (version === generation.current) {
          setError(true);
          setSaving(false);
        }
      },
    );
    return pending;
  }, []);
  const save = useCallback(
    (files: File[], settings: Map<File, EditSettings>, approvals: Set<File>) => {
      return persist({
        id,
        updatedAt: Date.now(),
        items: files.map((file) => ({
          file,
          name: file.name,
          lastModified: file.lastModified,
          settings: settings.get(file)!,
          approved: approvals.has(file),
        })),
      });
    },
    [id, persist],
  );
  useEffect(() => {
    if (ready) void save(captured, reviewSettings, approved).catch(() => {});
  }, [ready, captured, reviewSettings, approved, save]);

  async function replace(files: File[], settings = reviewSettings, approvals = approved) {
    const nextSettings = new Map(files.map((file) => [file, settings.get(file)!]));
    const nextApproved = new Set(files.filter((file) => approvals.has(file)));
    await save(files, nextSettings, nextApproved);
    setCaptured(files);
    setReviewSettings(nextSettings);
    setApproved(nextApproved);
  }
  return {
    captured,
    setCaptured,
    approved,
    setApproved,
    reviewSettings,
    setReviewSettings,
    ready,
    saving,
    error,
    flush: () => queue.current,
    retry: () => {
      if (ready) return save(captured, reviewSettings, approved);
      setReload((old) => old + 1);
      return Promise.resolve();
    },
    replace,
  };
}
