import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  bug: { create: vi.fn() },
  $transaction: vi.fn(),
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

function requestWithId(id: string, body: unknown): Request {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/convert`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-ideas/[id]/convert", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(429);
  });

  it("returns 404 when the draft idea does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 404 when the draft idea belongs to another tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-2",
      status: "accepted",
    });
    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 when draft idea is not in accepted status", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("converts an accepted structured idea to an open bug", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "accepted",
      title: "Accepted idea",
      description: "Detailed description",
      projectId: "proj-1",
      createdByUserId: "u1",
    });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "proj-1",
      tenantId: "tenant-1",
    });
    prismaMock.$transaction.mockImplementation(async (callback) => {
      const bug = { id: "bug-1", number: 42, title: "Accepted idea", status: "open", tenantId: "tenant-1", projectId: "proj-1", reporterId: "u1", createdAt: new Date() };
      return callback({
        bug: { create: async () => bug },
        draftIdea: { update: async () => ({ id: "di-1", status: "converted" }) },
      });
    });

    const response = await POST(requestWithId("di-1", {}), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("bug-1");
    expect(json.number).toBe(42);
    expect(json.status).toBe("open");
  });
});
describe("unsupported methods on /api/draft-ideas/[id]/convert", () => {
  it("returns 405 for GET", async () => {
    const response = GET(requestWithId("di-1", {}));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("returns 405 for PUT", async () => {
    const response = PUT(requestWithId("di-1", {}));
    expect(response.status).toBe(405);
  });

  it("returns 405 for PATCH", async () => {
    const response = PATCH(requestWithId("di-1", {}));
    expect(response.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const response = DELETE(requestWithId("di-1", {}));
    expect(response.status).toBe(405);
  });

  it("returns 204 for OPTIONS", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });
});
