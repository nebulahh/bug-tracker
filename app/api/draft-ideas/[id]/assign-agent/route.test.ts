import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: { findUnique: vi.fn(), update: vi.fn() },
  agent: { findUnique: vi.fn() },
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
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/assign-agent`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-ideas/[id]/assign-agent", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(429);
  });

  it("returns 404 when the draft idea does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
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
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
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
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when agent does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "accepted",
    });
    prismaMock.agent.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", { agentId: "agent-999" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when agent is revoked", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "accepted",
    });
    prismaMock.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      tenantId: "tenant-1",
      revokedAt: new Date(),
      level: "reviewer",
    });
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("returns 400 when agent level is too low", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "accepted",
    });
    prismaMock.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      tenantId: "tenant-1",
      revokedAt: null,
      level: "observer",
    });
    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(400);
  });

  it("assigns an agent to an accepted draft idea", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "accepted",
      assignedAgentId: null,
    });
    prismaMock.agent.findUnique.mockResolvedValue({
      id: "agent-1",
      tenantId: "tenant-1",
      revokedAt: null,
      level: "reviewer",
    });
    prismaMock.draftIdea.update.mockResolvedValue({
      id: "di-1",
      title: "Draft idea",
      description: "Original description",
      status: "accepted",
      assignedAgentId: "agent-1",
      assignedAgent: {
        id: "agent-1",
        name: "Alice's Claude",
        level: "reviewer",
      },
      updatedAt: new Date(),
    });

    const response = await POST(requestWithId("di-1", { agentId: "agent-1" }), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.assignedAgentId).toBe("agent-1");
    expect(json.assignedAgent.name).toBe("Alice's Claude");
    expect(prismaMock.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { assignedAgentId: "agent-1" },
      select: expect.any(Object),
    });
  });
});