import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { fromZodError } from "@/lib/form-errors";
import { createDraftIdeaCommentSchema } from "@/lib/validations/idea";

/** POST /api/draft-ideas/[id]/comments — comment on a draft idea.
 *
 * Body: { body, parentId?, duplicateOfId?, duplicateReason? }
 * The signed-in user is the comment author. The draft idea must belong to the
 * caller's tenant.
 *
 * When `duplicateOfId` is provided, the comment marks the draft idea as a
 * duplicate of another draft idea. The referenced draft idea must exist in the
 * same tenant, be in draft status, and be older than the commented draft idea.
 * `duplicateReason` explains why it is a duplicate.
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
    `add-draft-idea-comment:${userId}`,
    ACTION_RATE_LIMITS.addDraftIdeaComment,
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

  const parsed = createDraftIdeaCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fromZodError(parsed.error, "Invalid comment input"),
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

  // The draft idea being commented on must exist and belong to the caller's tenant.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: { id: true, tenantId: true, status: true, createdAt: true },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  // Only allow comments on draft ideas (not yet converted/closed).
  if (draftIdea.status !== "draft") {
    return NextResponse.json(
      { error: "Comments are only allowed on draft ideas." },
      { status: 400 },
    );
  }

  // If parentId is given, the parent comment must exist on the same draft idea.
  if (parsed.data.parentId) {
    const parent = await prisma.draftIdeaComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, draftIdeaId: true },
    });
    if (!parent || parent.draftIdeaId !== id) {
      return NextResponse.json(
        { error: "Parent comment not found on this draft idea." },
        { status: 400 },
      );
    }
  }

  // If duplicateOfId is given, validate the referenced duplicate idea.
  if (parsed.data.duplicateOfId) {
    const duplicate = await prisma.draftIdea.findUnique({
      where: { id: parsed.data.duplicateOfId },
      select: { id: true, tenantId: true, status: true, createdAt: true },
    });

    if (!duplicate || duplicate.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Duplicate draft idea not found in your workspace." },
        { status: 400 },
      );
    }

    if (duplicate.status !== "draft") {
      return NextResponse.json(
        { error: "Duplicate draft idea must be in draft status." },
        { status: 400 },
      );
    }

    // The duplicate must be older than the commented draft idea.
    if (duplicate.createdAt >= draftIdea.createdAt) {
      return NextResponse.json(
        { error: "Duplicate draft idea must be older than this draft idea." },
        { status: 400 },
      );
    }

    // Cannot mark an idea as a duplicate of itself.
    if (duplicate.id === id) {
      return NextResponse.json(
        { error: "A draft idea cannot be a duplicate of itself." },
        { status: 400 },
      );
    }
  }

  const comment = await prisma.draftIdeaComment.create({
    data: {
      draftIdeaId: id,
      authorId: userId,
      body: parsed.data.body,
      parentId: parsed.data.parentId ?? null,
      duplicateOfId: parsed.data.duplicateOfId ?? null,
      duplicateReason: parsed.data.duplicateReason ?? null,
    },
    select: {
      id: true,
      draftIdeaId: true,
      authorId: true,
      agentId: true,
      body: true,
      parentId: true,
      duplicateOfId: true,
      duplicateReason: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(comment, { status: 201 });
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
