import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { NewDraftIdeaForm } from "@/components/new-draft-idea-form";

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
