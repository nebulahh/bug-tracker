"use client";

import { useRef, useState } from "react";
import { z } from "zod";

const noteSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty.").max(500, "Note is too long (max 500 characters)."),
});

export function HumanNoteDialog({
  bugId,
  projectId,
}: {
  bugId: string;
  projectId: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  const show = () => {
    setOpen(true);
    setStatus("idle");
    setError(null);
    setNoteValue("");
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const parsed = noteSchema.safeParse({ note: noteValue });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid note.");
      }
      const res = await fetch(
        `/api/v1/issues/${bugId}/human-note?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: parsed.data.note }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to add note (${res.status}).`);
      }
      setStatus("success");
      setTimeout(() => close(), 600);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to add note.");
    }
  };

  return (
    <>
      {status === "idle" && (
        <button
          type="button"
          onClick={show}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface px-3 text-[13px] font-medium text-zk-text hover:bg-zk-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong print:hidden"
          title="Leave an instruction note for the agent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add instruction note
        </button>
      )}
      <dialog
        ref={dialogRef}
        aria-label="Add instruction note"
        onClose={() => setOpen(false)}
        className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-zk-border bg-zk-surface p-0 text-zk-text shadow-[0_24px_56px_rgba(11,23,51,0.22)] backdrop:bg-black/40"
      >
        <div className="relative p-5 sm:p-6">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-zk-muted hover:bg-zk-chip hover:text-zk-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
          <h2 className="mb-3 text-sm font-semibold text-zk-text">Instruction note for the agent</h2>
          <p className="mb-4 text-xs text-zk-muted">
            This note is sent to the agent as a real-time event. Keep it short and actionable.
          </p>
          {open ? (
            <form onSubmit={onSubmit} className="space-y-3">
              {status === "error" && error && (
                <div className="rounded-lg border border-zk-bad-bd bg-zk-bad-bg/10 p-3 text-sm text-zk-bad-fg">{error}</div>
              )}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zk-text">Note</label>
                <textarea
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-zk-border bg-zk-surface px-3 py-2 text-sm text-zk-text focus:outline-none focus:ring-2 focus:ring-electric-blue-strong"
                  placeholder="e.g. Check edge cases on the login flow..."
                  maxLength={500}
                />
                <p className="text-xs text-zk-muted">{noteValue.length}/500 characters</p>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={status === "submitting"}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface px-3 text-[13px] font-medium text-zk-text hover:bg-zk-chip disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface px-3 py-0 text-[13px] font-medium text-zk-text hover:bg-zk-chip disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong ${
                    status === "success" ? "border-zk-ok-bd bg-zk-ok-bg text-zk-ok-fg" : ""
                  }`}
                >
                  {status === "success" ? "Added" : "Add note"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
