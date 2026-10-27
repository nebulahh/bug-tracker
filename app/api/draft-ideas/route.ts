import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { checkRateLimit, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { fromZodError } from "@/lib/form-errors";
import { createDraftIdeaSchema } from "@/lib/validations/idea";

/** POST /api/draft-ideas — create an unstructured draft idea.
 *
 * Body: { title, description, projectId? }
 * The signed-in user is the creator. The tenant is resolved from the user's
 * membership. projectId is optional: when set the idea is about that project;
 * when null it is about Ziki itself.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const user = await requireUser();
  const userId = user.id;

  const limit = checkRateLimit(
    `create-draft-idea:${userId}`,
    ACTION_RATE_LIMITS.createDraftIdea,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE, retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createDraftIdeaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      fromZodError(parsed.error, "Invalid draft idea input"),
      { status: 400 },
    );
  }

  const tenantId = await currentTenantIdFor(userId);
  if (!tenantId) {
    return NextResponse.json(
      { error: "You're not a member of a workspace yet, so you can't create ideas here." },
      { status: 403 },
    );
  }

  // Validate projectId belongs to the same tenant when provided.
  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { id: true, tenantId: true },
    });
    if (!project || project.tenantId !== tenantId) {
      return NextResponse.json(
        { error: "Project not found in your workspace." },
        { status: 400 },
      );
    }
  }

  const draftIdea = await prisma.draftIdea.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      projectId: parsed.data.projectId ?? null,
      tenantId,
      createdByUserId: userId,
    },
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

  return NextResponse.json(draftIdea, { status: 201 });
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
