import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: { findUnique: vi.fn() },
  draftIdeaComment: { findUnique: vi.fn(), create: vi.fn() },
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

function requestWithId(id: string): Request {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "This draft idea should become an issue." }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-ideas/[id]/comments", () => {
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

  it("returns 400 for invalid body", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    const badRequest = new NextRequest(`http://localhost/api/draft-ideas/di-1/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "" }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(badRequest, { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("Comment cannot be empty");
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

  it("returns 400 when the draft idea is not in draft status", async () => {
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
  });  it("returns 400 when parent comment is not on the same draft idea", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-other",
      draftIdeaId: "di-other",
    });
    const replyRequest = new NextRequest(`http://localhost/api/draft-ideas/di-1/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "Reply", parentId: "c-other" }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(replyRequest, { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("creates a comment and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaComment.create.mockResolvedValue({
      id: "c-1",
      draftIdeaId: "di-1",
      authorId: "u1",
      agentId: null,
      body: "This draft idea should become an issue.",
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("c-1");
    expect(json.body).toBe("This draft idea should become an issue.");
    expect(prismaMock.draftIdeaComment.create).toHaveBeenCalledWith({
      data: {
        draftIdeaId: "di-1",
        authorId: "u1",
        body: "This draft idea should become an issue.",
        parentId: null,
        duplicateOfId: null,
        duplicateReason: null,
      },
      select: expect.any(Object),
    });
  });

  it("creates a reply to a comment on the same draft idea", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaComment.findUnique.mockResolvedValue({
      id: "c-parent",
      draftIdeaId: "di-1",
    });
    prismaMock.draftIdeaComment.create.mockResolvedValue({
      id: "c-reply",
      draftIdeaId: "di-1",
      authorId: "u1",
      agentId: null,
      body: "I agree, this needs to be an issue.",
      parentId: "c-parent",
      duplicateOfId: null,
      duplicateReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const replyRequest = new NextRequest(`http://localhost/api/draft-ideas/di-1/comments`, {
      method: "POST",
      body: JSON.stringify({ body: "I agree, this needs to be an issue.", parentId: "c-parent" }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(replyRequest, { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("c-reply");
    expect(json.parentId).toBe("c-parent");
  });

  it("creates a comment with a valid duplicate reference", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-old",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T09:00:00Z"),
    });
    prismaMock.draftIdeaComment.create.mockResolvedValue({
      id: "c-dup",
      draftIdeaId: "di-new",
      authorId: "u1",
      agentId: null,
      body: "This is a duplicate.",
      parentId: null,
      duplicateOfId: "di-old",
      duplicateReason: "Same title and description as di-old, filed earlier.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "This is a duplicate.",
        duplicateOfId: "di-old",
        duplicateReason: "Same title and description as di-old, filed earlier.",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-new" }) });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.duplicateOfId).toBe("di-old");
    expect(json.duplicateReason).toBe("Same title and description as di-old, filed earlier.");
  });

  it("returns 400 when duplicateOfId does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce(null);

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateOfId: "di-nonexistent",
        duplicateReason: "It is a duplicate.",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-new" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when duplicate is in another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-old",
      tenantId: "tenant-2",
      status: "draft",
      createdAt: new Date("2026-10-27T09:00:00Z"),
    });

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateOfId: "di-old",
        duplicateReason: "It is a duplicate.",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-new" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when duplicate is not older", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T09:00:00Z"),
    });
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-old",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });

    const dupRequest2 = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateOfId: "di-old",
        duplicateReason: "It is a duplicate.",
      }),
      headers: { "content-type": "application/json" },
    });
    const response2 = await POST(dupRequest2, { params: Promise.resolve({ id: "di-new" }) });
    expect(response2.status).toBe(400);
  });

  it("returns 400 when duplicateOfId references itself", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });
    prismaMock.draftIdea.findUnique.mockResolvedValueOnce({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T09:00:00Z"),
    });

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-1/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateOfId: "di-1",
        duplicateReason: "Self-reference.",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when duplicateOfId is provided without duplicateReason", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateOfId: "di-old",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-new" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when duplicateReason is provided without duplicateOfId", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateReason: "It is a duplicate.",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-new" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when duplicateReason is empty", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-new",
      tenantId: "tenant-1",
      status: "draft",
      createdAt: new Date("2026-10-27T10:00:00Z"),
    });

    const dupRequest = new NextRequest(`http://localhost/api/draft-ideas/di-new/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: "Duplicate.",
        duplicateOfId: "di-old",
        duplicateReason: "   ",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(dupRequest, { params: Promise.resolve({ id: "di-new" }) });
    expect(response.status).toBe(400);
  });
});

describe("unsupported methods on /api/draft-ideas/[id]/comments", () => {
  it("returns 405 for GET", async () => {
    const response = GET(requestWithId("di-1"));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("returns 405 for PUT", async () => {
    const response = PUT(requestWithId("di-1"));
    expect(response.status).toBe(405);
  });

  it("returns 405 for PATCH", async () => {
    const response = PATCH(requestWithId("di-1"));
    expect(response.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const response = DELETE(requestWithId("di-1"));
    expect(response.status).toBe(405);
  });

  it("returns 204 for OPTIONS", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });
});


