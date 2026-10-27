import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdeaComment: { findUnique: vi.fn() },
  draftIdeaCommentVote: {
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor: currentTenantIdForMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  ACTION_RATE_LIMITS: { addDraftIdeaComment: { max: 20, windowMs: 60 * 1000 } },
  RATE_LIMIT_MESSAGE: "You're doing that too fast. Please wait a moment.",
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { POST, GET, PUT, PATCH, DELETE, OPTIONS } = await import("./route");

function requestWithId(id: string, upvote: boolean): Request {
  return new NextRequest(`http://localhost/api/draft-idea-comments/${id}/vote`, {
    method: "POST",
    body: JSON.stringify({ upvote }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-idea-comments/[id]/vote", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(429);
  });

  it("returns 404 when the comment does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 404 when the comment belongs to another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      draftIdea: { id: "di-1", tenantId: "tenant-2" },
    });
    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      draftIdea: { id: "di-1", tenantId: "tenant-1" },
    });
    const badRequest = new NextRequest(`http://localhost/api/draft-idea-comments/c-1/vote`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(badRequest, { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(400);
  });  it("upvotes a comment and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      draftIdea: { id: "di-1", tenantId: "tenant-1" },
    });
    prismaMock.draftIdeaCommentVote.findFirst.mockResolvedValue(null);
    prismaMock.draftIdeaCommentVote.create.mockResolvedValue({
      id: "vote-1",
      commentId: "c-1",
      userId: "u1",
      createdAt: new Date(),
    });

    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.voted).toBe(true);
    expect(json.upvote).toBe(true);
    expect(prismaMock.draftIdeaCommentVote.create).toHaveBeenCalledWith({
      data: { commentId: "c-1", userId: "u1" },
    });
  });

  it("is idempotent when upvoting an already-upvoted comment", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      draftIdea: { id: "di-1", tenantId: "tenant-1" },
    });
    prismaMock.draftIdeaCommentVote.findFirst.mockResolvedValue({
      id: "vote-1",
      commentId: "c-1",
      userId: "u1",
    });

    const response = await POST(requestWithId("c-1", true), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.voted).toBe(true);
    expect(json.upvote).toBe(true);
    expect(prismaMock.draftIdeaCommentVote.create).not.toHaveBeenCalled();
  });

  it("removes an upvote when upvote=false and a vote exists", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      draftIdea: { id: "di-1", tenantId: "tenant-1" },
    });
    prismaMock.draftIdeaCommentVote.findFirst.mockResolvedValue({
      id: "vote-1",
      commentId: "c-1",
      userId: "u1",
    });
    prismaMock.draftIdeaCommentVote.delete.mockResolvedValue({ id: "vote-1" });

    const response = await POST(requestWithId("c-1", false), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.voted).toBe(false);
    expect(json.upvote).toBe(false);
    expect(prismaMock.draftIdeaCommentVote.delete).toHaveBeenCalledWith({
      where: { id: "vote-1" },
    });
  });

  it("is a no-op when upvote=false and no vote exists", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      draftIdea: { id: "di-1", tenantId: "tenant-1" },
    });
    prismaMock.draftIdeaCommentVote.findFirst.mockResolvedValue(null);

    const response = await POST(requestWithId("c-1", false), { params: Promise.resolve({ id: "c-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.voted).toBe(false);
    expect(json.upvote).toBe(false);
    expect(prismaMock.draftIdeaCommentVote.delete).not.toHaveBeenCalled();
  });
});

describe("unsupported methods on /api/draft-idea-comments/[id]/vote", () => {
  it("returns 405 for GET", async () => {
    const response = GET(requestWithId("c-1", true));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("returns 405 for PUT", async () => {
    const response = PUT(requestWithId("c-1", true));
    expect(response.status).toBe(405);
  });

  it("returns 405 for PATCH", async () => {
    const response = PATCH(requestWithId("c-1", true));
    expect(response.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const response = DELETE(requestWithId("c-1", true));
    expect(response.status).toBe(405);
  });

  it("returns 204 for OPTIONS", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });
});
