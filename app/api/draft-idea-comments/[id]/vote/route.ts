import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { fromZodError } from "@/lib/form-errors";
import { z } from "zod";

const voteSchema = z.object({
  upvote: z.boolean(),
});

/** POST /api/draft-idea-comments/[id]/vote — upvote or remove an upvote on a draft idea comment.
 *
 * Body: { upvote: boolean }
 * Only one upvote per user per comment. Toggling upvote=true when already
 * upvoted removes the vote; upvote=false is a no-op (downvotes not supported).
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
    `vote-draft-idea-comment:${userId}`,
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

  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fromZodError(parsed.error, "Invalid vote input"),
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

  // The comment must exist and belong to a draft idea in the caller's tenant.
  const comment = await prisma.draftIdeaComment.findUnique({
    where: { id },
    select: {
      id: true,
      draftIdeaId: true,
      draftIdea: { select: { id: true, tenantId: true } },
    },
  });

  if (!comment || comment.draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  const existingVote = await prisma.draftIdeaCommentVote.findFirst({
    where: { commentId: id, userId },
    select: { id: true },
  });

  if (parsed.data.upvote) {
    if (existingVote) {
      // Already upvoted — no-op (idempotent).
      return NextResponse.json({ voted: true, upvote: true });
    }
    await prisma.draftIdeaCommentVote.create({
      data: { commentId: id, userId },
    });
    return NextResponse.json({ voted: true, upvote: true }, { status: 201 });
  }

  // upvote=false: remove the vote if present, otherwise no-op.
  if (existingVote) {
    await prisma.draftIdeaCommentVote.delete({ where: { id: existingVote.id } });
    return NextResponse.json({ voted: false, upvote: false });
  }
  return NextResponse.json({ voted: false, upvote: false });
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
