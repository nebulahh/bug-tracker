import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  draftIdeaCommentVote: { aggregate: vi.fn() },
  draftIdeaComment: { findFirst: vi.fn() },
};

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor: currentTenantIdForMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  ACTION_RATE_LIMITS: { createDraftIdea: { max: 10, windowMs: 60 * 1000 } },
  RATE_LIMIT_MESSAGE: "You're doing that too fast. Please wait a moment.",
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST, GET, PUT, PATCH, DELETE, OPTIONS } = await import("./route");

function requestWithId(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/promote`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-ideas/[id]/promote", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(429);
  });

  it("returns 404 when the draft idea does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 404 when the draft idea belongs to another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-2",
      status: "draft",
    });
    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 when draft idea is not in draft status", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "structured",
    });
    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when votes below threshold", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 2 } });

    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.voteCount).toBe(2);
    expect(json.threshold).toBe(3);
  });

  it("promotes draft idea to structured when threshold met", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 3 } });
    prismaMock.draftIdeaComment.findFirst.mockResolvedValue(null);
    prismaMock.draftIdea.update.mockResolvedValue({
      id: "di-1",
      title: "Draft title",
      description: "Draft description",
      projectId: null,
      tenantId: "tenant-1",
      createdByUserId: "u1",
      status: "structured",
      assignedAgentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("structured");
    expect(json.assignedAgentId).toBeNull();
    expect(prismaMock.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { status: "structured" },
      select: expect.any(Object),
    });
  });

  it("auto-assigns the agent with the most upvoted comment", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 10 } });
    prismaMock.draftIdeaComment.findFirst.mockResolvedValue({
      id: "c-2",
      draftIdeaId: "di-1",
      agentId: "agent-a",
      _count: { votes: 5 },
    });
    prismaMock.draftIdea.update.mockResolvedValue({
      id: "di-1",
      title: "Draft title",
      description: "Draft description",
      projectId: null,
      tenantId: "tenant-1",
      createdByUserId: "u1",
      status: "structured",
      assignedAgentId: "agent-a",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("structured");
    expect(json.assignedAgentId).toBe("agent-a");
    expect(prismaMock.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { status: "structured", assignedAgentId: "agent-a" },
      select: expect.any(Object),
    });
  });

  it("does not assign agent when no comments have agents", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 5 } });
    prismaMock.draftIdeaComment.findFirst.mockResolvedValue(null);
    prismaMock.draftIdea.update.mockResolvedValue({
      id: "di-1",
      title: "Draft title",
      description: "Draft description",
      projectId: null,
      tenantId: "tenant-1",
      createdByUserId: "u1",
      status: "structured",
      assignedAgentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("structured");
    expect(json.assignedAgentId).toBeNull();
    expect(prismaMock.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { status: "structured" },
      select: expect.any(Object),
    });
  });
});

describe("unsupported methods on /api/draft-ideas/[id]/promote", () => {
  it("returns 405 for GET", async () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("returns 405 for PUT", async () => {
    const response = PUT();
    expect(response.status).toBe(405);
  });

  it("returns 405 for PATCH", async () => {
    const response = PATCH();
    expect(response.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const response = DELETE();
    expect(response.status).toBe(405);
  });

  it("returns 204 for OPTIONS", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });
});
