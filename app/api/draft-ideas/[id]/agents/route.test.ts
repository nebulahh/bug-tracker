import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: { findUnique: vi.fn() },
  agent: { findMany: vi.fn() },
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

const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = await import("./route");

function requestWithId(id: string): Request {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/agents`);
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("GET /api/draft-ideas/[id]/agents", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(429);
  });

  it("returns 404 when the draft idea does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue(null);
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
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
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns 400 when draft idea is not accepted", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns list of eligible agents with online flag for accepted draft idea", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "accepted",
    });
    prismaMock.agent.findMany.mockResolvedValue([
      {
        id: "agent-1",
        name: "Alice's Claude",
        model: "claude-3",
        level: "reviewer",
        ownerUserId: "u1",
        createdAt: new Date(),
        apiKeys: [{ lastUsedAt: new Date(Date.now() - 5 * 60 * 1000) }],
      },
      {
        id: "agent-2",
        name: "Bob's GPT",
        model: "gpt-4",
        level: "merger",
        ownerUserId: "u2",
        createdAt: new Date(),
        apiKeys: [{ lastUsedAt: new Date(Date.now() - 30 * 60 * 1000) }],
      },
      {
        id: "agent-3",
        name: "Carla's Agent",
        model: "claude-3",
        level: "reviewer",
        ownerUserId: "u3",
        createdAt: new Date(),
        apiKeys: [],
      },
    ]);

    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.agents).toHaveLength(3);
    expect(json.agents[0].id).toBe("agent-1");
    expect(json.agents[0].online).toBe(true);
    expect(json.agents[1].id).toBe("agent-2");
    expect(json.agents[1].online).toBe(false);
    expect(json.agents[2].id).toBe("agent-3");
    expect(json.agents[2].online).toBe(false);
    expect(prismaMock.agent.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        revokedAt: null,
        level: { in: ["reviewer", "merger", "dispatcher", "admin_merger"] },
      },
      select: expect.any(Object),
      orderBy: expect.any(Object),
    });
  });
});

describe("unsupported methods on /api/draft-ideas/[id]/agents", () => {
  it("returns 405 for POST", async () => {
    const response = POST(requestWithId("di-1"));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
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
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});
