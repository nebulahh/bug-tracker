import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { z } from "zod";

const decideSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(1000).optional().nullable(),
});

/** POST /api/draft-ideas/[id]/decide — human accepts or rejects a structured idea.
 *
 * Body: { decision: "accept" | "reject", reason? }
 *
 * Only a human user (not an agent) can decide. Agents are not permitted to
 * reject ideas — this endpoint requires a session user, which agents do not
 * have (they authenticate via API keys on agent routes).
 *
 * If accepted: status → "accepted" (eligible for conversion to an open issue).
 * If rejected: status → "rejected".
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // requireUser resolves a human User (not an agent API key).
  const user = await requireUser();
  const userId = user.id;

  const limit = checkRateLimit(
    `decide-draft-idea:${userId}`,
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

  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid decision input", fieldErrors: parsed.error.flatten().fieldErrors },
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

  // The draft idea must exist, be in structured status, and belong to the caller's tenant.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: { id: true, tenantId: true, status: true },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  if (draftIdea.status !== "structured") {
    return NextResponse.json(
      { error: `Cannot decide on a draft idea in ${draftIdea.status} status.` },
      { status: 400 },
    );
  }

  const nextStatus = parsed.data.decision === "accept" ? "accepted" : "rejected";

  const decided = await prisma.draftIdea.update({
    where: { id },
    data: {
      status: nextStatus,
    },
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      tenantId: true,
      createdByUserId: true,
      status: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(decided, { status: 200 });
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
