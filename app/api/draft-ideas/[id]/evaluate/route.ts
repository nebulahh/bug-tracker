import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";

/** Number of upvotes required across comments before a draft idea can be promoted to structured. */
const PROMOTION_VOTE_THRESHOLD = 3;

/** GET /api/draft-ideas/[id]/evaluate
 *
 * Returns the total upvote count on comments for this draft idea and whether
 * the promotion threshold has been met. Only the idea's tenant members can
 * evaluate.
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

  const { id } = await context.params;

  const tenantId = await currentTenantIdFor(userId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "You're not a member of a workspace yet." },
      { status: 403 },
    );
  }

  // The draft idea must exist and belong to the caller's tenant.
  const draftIdea = await prisma.draftIdea.findUnique({
    where: { id },
    select: { id: true, tenantId: true, status: true },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  // Count total upvotes across all comments on this draft idea.
  const voteCount = await prisma.draftIdeaCommentVote.aggregate({
    where: {
      comment: { draftIdeaId: id },
    },
    _count: { id: true },
  });

  const totalVotes = voteCount._count.id ?? 0;
  const thresholdMet = totalVotes >= PROMOTION_VOTE_THRESHOLD;

  return NextResponse.json({
    draftIdeaId: id,
    status: draftIdea.status,
    voteCount: totalVotes,
    threshold: PROMOTION_VOTE_THRESHOLD,
    thresholdMet,
    canPromote: draftIdea.status === "draft" && thresholdMet,
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
