import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

/** GET /api/draft-ideas/[id]/agents — list agents eligible to rewrite a draft idea.
 *
 * Returns all agents in the same tenant who are not revoked and have reviewer-level
 * or higher. Each agent is annotated with `online` (recent API key activity).
 * Only callable on an accepted draft idea by the person who accepted it
 * or a tenant admin.
 *
 * If no agent is online, the human may still assign any eligible agent.
 * The assignment is held pending and the agent is notified when they come online.
 */
export async function GET(
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
    `list-draft-idea-agents:${userId}`,
    ACTION_RATE_LIMITS.createDraftIdea,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE, retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const { id } = await context.params;

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
    select: { id: true, tenantId: true, status: true },
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

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // All eligible agents in the tenant: not revoked, reviewer level or higher.
  const agents = await prisma.agent.findMany({
    where: {
      tenantId,
      revokedAt: null,
      level: {
        in: ["reviewer", "merger", "dispatcher", "admin_merger"],
      },
    },
    select: {
      id: true,
      name: true,
      model: true,
      level: true,
      ownerUserId: true,
      createdAt: true,
      apiKeys: {
        select: { lastUsedAt: true },
        take: 1,
        orderBy: { lastUsedAt: "desc" },
      },
    },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  });

  // An agent is "online" if their most recent API key was used within 10 minutes.
  const agentsWithOnline = agents.map((agent) => {
    const lastUsed = agent.apiKeys[0]?.lastUsedAt;
    const online = lastUsed ? lastUsed.getTime() >= tenMinutesAgo.getTime() : false;
    return { ...agent, online };
  });

  return NextResponse.json({ agents: agentsWithOnline });
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { error: "method_not_allowed", message: "Method not allowed." },
    { status: 405, headers: { allow: "GET, OPTIONS" } },
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { allow: "GET, OPTIONS" },
  });
}
