import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

/** Number of upvotes required across comments before a draft idea can be promoted. */
const PROMOTION_VOTE_THRESHOLD = 3;

/** POST /api/draft-ideas/[id]/promote
 *
 * Promotes a draft idea to "structured" status when the comment upvote
 * threshold has been met. Only the idea's tenant members can promote.
 *
 * Body: {}
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
    `promote-draft-idea:${userId}`,
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

  // The draft idea must exist, be in draft status, and belong to the caller's tenant.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: { id: true, tenantId: true, status: true },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  if (draftIdea.status !== "draft") {
    return NextResponse.json(
      { error: `Draft idea is already ${draftIdea.status}, cannot promote.` },
      { status: 400 },
    );
  }

  // Count total upvotes across all comments on this draft idea.
  const voteCount = await prisma.draftIdeaCommentVote.aggregate({
    where: {
      comment: { draftIdeaId: id },
    },
    _count: { id: true },
  });

  const totalVotes = voteCount._count.id ?? 0;
  if (totalVotes < PROMOTION_VOTE_THRESHOLD) {
    return NextResponse.json(
      {
        error: `Not enough votes to promote. Need ${PROMOTION_VOTE_THRESHOLD}, have ${totalVotes}.`,
        voteCount: totalVotes,
        threshold: PROMOTION_VOTE_THRESHOLD,
      },
      { status: 400 },
    );
  }

  // Promote to structured status.
  const promoted = await prisma.draftIdea.update({
    where: { id },
    data: { status: "structured" },
    select: {
      id: true,
      title: true,
      description: true,
      projectId: true,
      tenantId: true,
      createdByUserId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(promoted, { status: 200 });
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
