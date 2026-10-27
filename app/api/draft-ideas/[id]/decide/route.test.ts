import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: { findUnique: vi.fn(), update: vi.fn() },
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

function requestWithId(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/decide`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-ideas/[id]/decide", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(429);
  });

  it("returns 404 when the draft idea does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 404 when the draft idea belongs to another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-2",
      status: "structured",
    });
    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 when draft idea is not in structured status", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });  it("returns 400 for invalid body", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "structured",
    });
    const badRequest = new NextRequest(`http://localhost/api/draft-ideas/di-1/decide`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(badRequest, { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("accepts a structured idea and returns accepted status", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "structured",
    });
    prismaMock.draftIdea.update.mockResolvedValue({
      id: "di-1",
      title: "Structured idea",
      description: "Detailed description",
      projectId: null,
      tenantId: "tenant-1",
      createdByUserId: "u1",
      status: "accepted",
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1", { decision: "accept" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("accepted");
    expect(prismaMock.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { status: "accepted" },
      select: expect.any(Object),
    });
  });

  it("rejects a structured idea and returns rejected status", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "structured",
    });
    prismaMock.draftIdea.update.mockResolvedValue({
      id: "di-1",
      title: "Structured idea",
      description: "Detailed description",
      projectId: null,
      tenantId: "tenant-1",
      createdByUserId: "u1",
      status: "rejected",
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1", { decision: "reject" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("rejected");
    expect(prismaMock.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { status: "rejected" },
      select: expect.any(Object),
    });
  });
});
describe("unsupported methods on /api/draft-ideas/[id]/decide", () => {
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
