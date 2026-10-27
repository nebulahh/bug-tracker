import { NextResponse, type NextRequest } from "next/server";
import { requireAgent } from "@/lib/agents/require-agent";
import { agentErrorResponse } from "@/lib/agents/require-agent";
import { requireLevel } from "@/lib/agents/levels";
import { audit } from "@/lib/agents/audit";
import { consumeAgentBudget } from "@/lib/agents/rate-budget";
import { withAgentBudgetHeaders, type AgentBudgetQuota } from "@/lib/agents/rate-budget-headers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const rewriteSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title must be at most 200 characters"),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(5000, "Description cannot exceed 5000 characters"),
});

/** POST /api/draft-ideas/[id]/rewrite — assigned agent rewrites an accepted idea into an open issue.
 *
 * Body: { title, description }
 * The agent rewrites the draft idea with more detailed info from agent conversations,
 * creates an open Bug linked to the draft idea, and marks the draft as converted.
 *
 * Only the assigned agent can call this. Agent authenticates via API key.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let agent: import("@/lib/agents/require-agent").AgentContext;
  try {
    agent = await requireAgent(request);
    requireLevel(agent, "reviewer");
  } catch (error) {
    return agentErrorResponse(error);
  }
  const agentId = agent.agentId;
  const tenantId = agent.tenantId;

  // Charge agent budget for this write operation.
  const quota: AgentBudgetQuota = { kind: "write", cost: 1 };
  const budget = await consumeAgentBudget(agent, "write");

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rewriteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid rewrite input", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // The draft idea must exist, be accepted, belong to the same tenant, and be assigned to this agent.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      status: true,
      title: true,
      description: true,
      assignedAgentId: true,
      convertedToBugId: true,
    },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  if (draftIdea.status !== "accepted") {
    return NextResponse.json(
      { error: `Cannot rewrite a draft idea in ${draftIdea.status} status.` },
      { status: 400 },
    );
  }

  if (draftIdea.assignedAgentId !== agentId) {
    return NextResponse.json(
      { error: "You are not the assigned agent for this draft idea." },
      { status: 403 },
    );
  }

  if (draftIdea.convertedToBugId !== null) {
    return NextResponse.json(
      { error: "This draft idea has already been converted to an issue." },
      { status: 400 },
    );
  }

  // Collect all comments on this draft idea for context.
  const comments = await prisma.draftIdeaComment.findMany({
    where: { draftIdeaId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      authorId: true,
      agentId: true,
      duplicateOfId: true,
      duplicateReason: true,
      createdAt: true,
    },
  });

  // Create the open Bug (issue) from the rewritten content.
  const result = await prisma.$transaction(async (tx) => {
    const bug = await tx.bug.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        status: "open",
        severity: "medium",
        reporterId: agent.ownerId,
        beneficiaryUserId: agent.ownerId,
        tenantId,
        projectId: draftIdea.projectId ?? "",
        createdByAgentId: agentId,
      },
      select: {
        id: true,
        number: true,
        title: true,
        description: true,
        status: true,
        tenantId: true,
        projectId: true,
        reporterId: true,
        createdByAgentId: true,
        createdAt: true,
      },
    });

    // Link the draft idea to the created bug.
    await tx.draftIdea.update({
      where: { id },
      data: {
        status: "converted",
        convertedToBugId: bug.id,
      },
    });

    // Audit the conversion (inside transaction for atomicity).
    await audit(
      { agentId, tenantId },
      "draft_idea.converted",
      bug.id,
      {
        draftIdeaId: id,
        bugId: bug.id,
        rewrittenTitle: parsed.data.title,
        rewrittenDescriptionLength: parsed.data.description.length,
        commentCount: comments.length,
      },
      { db: tx },
    );

    return bug;
  });

  const response = NextResponse.json(
    {
      bug: result,
      draftIdeaId: id,
      convertedToBugId: result.id,
      commentCount: comments.length,
    },
    {
      status: 201,
    },
  );
  withAgentBudgetHeaders(response, budget);
  return response;
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { error: "method_not_allowed", message: "Method not allowed." },
    { status: 405, headers: { allow: "POST, OPTIONS" } },
  );
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { allow: "POST, OPTIONS" },
  });
}
