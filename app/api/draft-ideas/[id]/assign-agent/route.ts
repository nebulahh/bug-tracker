import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { z } from "zod";

const assignAgentSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required"),
});

/** POST /api/draft-ideas/[id]/assign-agent — assign an agent to rewrite an accepted draft idea.
 *
 * Body: { agentId }
 * Only a human user can assign. The draft idea must be in "accepted" status and belong
 * to the caller's tenant. The agent must be online (not revoked, reviewer+ level, same tenant).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const user = await requireUser();
  const userId = user.id;

  const limit = checkRateLimit(
    `assign-draft-idea-agent:${userId}`,
    ACTION_RATE_LIMITS.createDraftIdea,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE, retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = assignAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const tenantId = await currentTenantIdFor(userId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "You're not a member of a workspace yet." },
      { status: 403 },
    );
  }

  // The draft idea must exist, be accepted, and belong to the caller's tenant.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: { id: true, tenantId: true, status: true, assignedAgentId: true },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  if (draftIdea.status !== "accepted") {
    return NextResponse.json(
      { error: `Cannot assign agents to a draft idea in ${draftIdea.status} status.` },
      { status: 400 },
    );
  }

  // Verify the agent exists, is online, and belongs to the same tenant.
  const agent = await prisma.agent.findUnique({
    where: { id: parsed.data.agentId },
    select: { id: true, tenantId: true, revokedAt: true, level: true },
  });

  if (!agent || agent.tenantId !== tenantId) {
    return NextResponse.json({ error: "Agent not found in your workspace." }, { status: 400 });
  }

  if (agent.revokedAt !== null) {
    return NextResponse.json({ error: "Agent is revoked and cannot be assigned." }, { status: 400 });
  }

  const eligibleLevels = ["reviewer", "merger", "dispatcher", "admin_merger"];
  if (!eligibleLevels.includes(agent.level)) {
    return NextResponse.json(
      { error: `Agent level ${agent.level} is not eligible to rewrite ideas.` },
      { status: 400 },
    );
  }

  // Assign the agent.
  const updated = await prisma.draftIdea.update({
    where: { id },
    data: { assignedAgentId: parsed.data.agentId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      assignedAgentId: true,
      assignedAgent: {
        select: { id: true, name: true, level: true },
      },
      updatedAt: true,
    },
  });

  return NextResponse.json(updated, { status: 200 });
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
