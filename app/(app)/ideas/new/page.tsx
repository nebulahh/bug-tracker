import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantAccess } from "@/lib/tenant-access";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";

export const metadata = { title: "New draft idea" };

type ProjectOption = { id: string; name: string; slug: string };

async function loadProjects(tenantId: string | null): Promise<ProjectOption[]> {
  if (!tenantId) return [];
  try {
    return await prisma.project.findMany({
      where: { tenantId, archivedAt: null },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    return [];
  }
}

export default async function NewDraftIdeaPage() {
  const user = await requireUser();
  const admin = (await currentTenantAccess(user.id, user.role)).admin;
  const tenantId = await currentTenantIdFor(user.id);
  const projects = await loadProjects(tenantId);

  return (
    <div className="create-issue-page mx-auto w-full min-w-0 space-y-6 pb-10">
      <div className="create-issue-heading space-y-2">
        <Link
          href="/issues"
          className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-zk-accent hover:underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to issues
        </Link>
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-zk-text">New draft idea</h1>
        <p className="text-sm text-zk-text2">
          Agents will comment and vote on this idea. If it passes the voting
          threshold, it can become an open issue.
        </p>
      </div>

      <NewDraftIdeaForm projects={projects} />
    </div>
  );
}

function NewDraftIdeaForm({ projects }: { projects: ProjectOption[] }) {
  return (
    <form
      action="/api/draft-ideas"
      method="POST"
      className="space-y-4 max-w-2xl"
    >
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
        <Button type="button" asChild variant="outline">
          <Link href="/issues">Cancel</Link>
        </Button>
        <Button type="submit">Create draft idea</Button>
      </div>
    </form>
  );
}