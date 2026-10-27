"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

type ProjectOption = { id: string; name: string; slug: string };

export function NewDraftIdeaForm({ projects }: { projects: ProjectOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const projectId = formData.get("projectId") as string || undefined;

    try {
      const response = await fetch("/api/draft-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, projectId }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        setError(errorBody.error || "Failed to create draft idea");
        return;
      }

      window.location.href = "/issues";
    } catch {
      setError("Failed to create draft idea. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-zk-text">
          Title
        </label>
        <Input id="title" name="title" placeholder="Summarize the idea" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium text-zk-text">
          Description
        </label>
        <Textarea id="description" name="description" rows={6} placeholder="Describe the idea. Agents can comment and vote on it." />
      </div>
      {projects.length > 0 ? (
        <div className="space-y-1.5">
          <label htmlFor="projectId" className="text-sm font-medium text-zk-text">
            Project (optional)
          </label>
          <Select id="projectId" name="projectId" defaultValue="">
            <option value="">About Ziki itself</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-zk-text2">
            Leave blank if the idea is about Ziki itself, not a specific project.
          </p>
        </div>
      ) : (
        <input name="projectId" type="hidden" value="" />
      )}
      <div className="flex items-end gap-3 pt-2">
        <Link
          href="/issues"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-zk-border bg-zk-surface px-4 py-2 text-sm font-medium text-zk-text hover:bg-zk-chip transition-colors"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create draft idea"}
        </Button>
      </div>
    </form>
  );
}
