"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { draftEndOfDayAction } from "@/app/va/actions";

/**
 * The End of Day Report textarea, prefilled with a draft of that day's Start of
 * Day rewritten in past tense (Gemini, or the Start of Day itself as a
 * fallback). It is only a draft — the VA edits it to what actually happened.
 */
export function EndOfDayField({
  entryId,
  error,
}: {
  entryId: string;
  error?: string;
}) {
  const [text, setText] = useState("");
  const [ai, setAi] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Once the VA has typed, the first (automatic) draft must not overwrite them.
  const edited = useRef(false);

  function loadDraft(force: boolean) {
    startTransition(async () => {
      const res = await draftEndOfDayAction(entryId);
      if (!res.ok) {
        setNote(res.message);
        return;
      }
      if (force || !edited.current) {
        setText(res.text);
        edited.current = false;
      }
      setAi(res.ai);
      setNote(null);
    });
  }

  useEffect(() => {
    loadDraft(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor="endOfDayTasks" className="field-label mb-0">
          End of Day Report <span className="text-brand-orange-600">*</span>
        </label>
        <button
          type="button"
          onClick={() => loadDraft(true)}
          disabled={pending}
          className="text-xs font-heading font-semibold text-brand-blue-700 underline underline-offset-2 hover:text-brand-blue-800 disabled:opacity-50"
        >
          {pending ? "Writing your draft…" : "Regenerate draft"}
        </button>
      </div>
      <textarea
        id="endOfDayTasks"
        name="endOfDayTasks"
        required
        rows={6}
        value={text}
        onChange={(e) => {
          edited.current = true;
          setText(e.target.value);
        }}
        className="field-textarea"
        placeholder={
          pending ? "Writing your draft from your Start of Day…" : "What did you accomplish today?"
        }
        aria-busy={pending}
        aria-invalid={!!error}
        aria-describedby="endOfDayHint"
      />
      {error && <p className="field-error">{error}</p>}
      <p id="endOfDayHint" className="field-hint">
        {note ??
          (ai
            ? "Drafted by AI from your Start of Day. Edit it so it matches what you actually did."
            : "Prefilled from your Start of Day. Edit it so it matches what you actually did.")}
      </p>
    </div>
  );
}
