import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgent, agentErrorResponse } from "@/lib/agents/require-agent";

const noteSchema = z.object({
  note: z.string().trim().min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await requireAgent(request);
  if (!agent.ok) return agentErrorResponse(agent.error);

  const { id: bugId } = await params;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid note" },
      { status: 400 }
    );
  }

  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    select: { id: true, tenantId: true, status: true, assigneeId: true, reporterId: true },
  });
  if (!bug) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const isReporterOrAdmin = agent.userId === bug.reporterId || agent.userId === bug.assigneeId;
  if (!isReporterOrAdmin) {
    return NextResponse.json(
      { error: "Only the reporter or an org admin can leave a note" },
      { status: 403 }
    );
  }

  if (bug.status !== "in_progress") {
    return NextResponse.json(
      { error: "Issue is not in progress" },
      { status: 400 }
    );
  }

  const activeClaim = await prisma.issueClaim.findFirst({
    where: { bugId, status: "active", releasedAt: null },
    select: { id: true, agentId: true },
  });
  if (!activeClaim) {
    return NextResponse.json(
      { error: "No active agent claim on this issue" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.agentEvent.create({
      data: {
        tenantId: bug.tenantId,
        type: "issue.human_note",
        payload: { bugId, note: parsed.data.note, projectId, leftBy: agent.userId },
        actorAgentId: activeClaim.agentId,
        bugId,
        projectId,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
