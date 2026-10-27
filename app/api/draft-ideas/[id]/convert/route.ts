import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { z } from "zod";

const convertSchema = z.object({
  projectId: z.string().optional().nullable(),
});

/** POST /api/draft-ideas/[id]/convert — convert an accepted structured idea into an open issue.
 *
 * Body: { projectId? }
 *
 * Only a human user can convert. The draft idea must be in "accepted" status.
 * Creates a Bug record from the draft idea's title/description and sets the
 * draft idea status to "converted".
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
    `convert-draft-idea:${userId}`,
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

  const parsed = convertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid convert input", fieldErrors: parsed.error.flatten().fieldErrors },
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
    select: {
      id: true,
      tenantId: true,
      status: true,
      title: true,
      description: true,
      projectId: true,
      createdByUserId: true,
    },
  });

  if (!draftIdea || draftIdea.tenantId !== tenantId) {
    return NextResponse.json({ error: "Draft idea not found." }, { status: 404 });
  }

  if (draftIdea.status !== "accepted") {
    return NextResponse.json(
      { error: `Cannot convert a draft idea in ${draftIdea.status} status.` },
      { status: 400 },
    );
  }

  // Determine project: use the provided one, fall back to the draft idea's project.
  const targetProjectId = parsed.data.projectId ?? draftIdea.projectId;

  if (targetProjectId) {
    const project = await prisma.project.findUnique({
      where: { id: targetProjectId },
      select: { id: true, tenantId: true },
    });
    if (!project || project.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Project not found in your workspace." },
        { status: 400 },
      );
    }
  }

  const bug = await prisma.$transaction(async (tx) => {
    const createdBug = await tx.bug.create({
      data: {
        title: draftIdea.title,
        description: draftIdea.description,
        status: "open",
        severity: "medium",
        reporterId: draftIdea.createdByUserId,
        beneficiaryUserId: draftIdea.createdByUserId,
        tenantId,
        projectId: targetProjectId ?? "",
        createdByAgentId: null,
      },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        tenantId: true,
        projectId: true,
        reporterId: true,
        createdAt: true,
      },
    });

    await tx.draftIdea.update({
      where: { id },
      data: { status: "converted" },
    });

    return createdBug;
  });

  return NextResponse.json(bug, { status: 201 });
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
