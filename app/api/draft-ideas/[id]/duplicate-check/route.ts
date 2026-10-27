import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

/** GET /api/draft-ideas/[id]/duplicate-check
 *
 * Checks whether the draft idea with the given id is a *complete duplicate*
 * of another draft idea in the same tenant — i.e. another draft idea with the
 * exact same title and description (after trimming).
 *
 * Returns the matching duplicate if one exists, otherwise null.
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
    `duplicate-check-draft-idea:${userId}`,
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

  // The draft idea being checked must belong to the caller's tenant.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, tenantId: true },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json(
      { error: "Draft idea not found." },
      { status: 404 },
    );
  }

  // A complete duplicate: same title AND same description in the same tenant,
  // excluding the idea itself.
  const duplicate = await prisma.draftIdea.findFirst({
    where: {
      tenantId,
      id: { not: id },
      title: draftIdea.title,
      description: draftIdea.description,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      createdByUserId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    isDuplicate: Boolean(duplicate),
    duplicate: duplicate ?? null,
  });
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
