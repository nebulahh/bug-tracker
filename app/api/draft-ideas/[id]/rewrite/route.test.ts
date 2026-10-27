import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  agentApiKey: { findUnique: vi.fn() },
  agentAuditEvent: { create: vi.fn() },
  draftIdea: { findUnique: vi.fn(), update: vi.fn() },
  draftIdeaComment: { findMany: vi.fn() },
  bug: { create: vi.fn() },
  rateLimitHit: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const budget = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agents/rate-budget", () => ({
  consumeAgentBudget: budget,
}));

const { POST, GET, PUT, PATCH, DELETE, OPTIONS } = await import("./route");

function requestWithId(id: string, body: unknown, key = true): NextRequest {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/rewrite`, {
    method: "POST",
    headers: { ...(key ? { authorization: "Bearer ziki_test-key" } : {}), "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.agentApiKey.findUnique.mockResolvedValue({
    id: "key-a",
    revokedAt: null,
    agent: {
      id: "agent-a",
      name: "Agent A",
      ownerUserId: "owner-a",
      tenantId: "tenant-a",
      level: "reviewer",
      burst: false,
      revokedAt: null,
      owner: { role: "user", memberships: [{ tenantId: "tenant-a" }] },
    },
  });
  budget.mockResolvedValue({ allowed: true, kind: "write", limit: 30, windowSeconds: 3600 });
  db.rateLimitHit.create.mockResolvedValue({ id: "rl-1" });
  db.agentAuditEvent.create.mockResolvedValue({ id: "audit-1" });
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/draft-ideas/[id]/rewrite", () => {
  const context = { params: Promise.resolve({ id: "di-1" }) };
  const validBody = {
    title: "Rewritten issue title",
    description: "Detailed rewritten description based on agent conversation.",
  };

  it("returns 401 without agent key", async () => {
    const response = await POST(requestWithId("di-1", validBody, false), context);
    expect(response.status).toBe(401);
  });

  it("returns 403 when agent level is below reviewer", async () => {
    db.agentApiKey.findUnique.mockResolvedValue({
      id: "key-a",
      revokedAt: null,
      agent: {
        id: "agent-a",
        name: "Agent A",
        ownerUserId: "owner-a",
        tenantId: "tenant-a",
        level: "observer",
        burst: false,
        revokedAt: null,
        owner: { role: "user", memberships: [{ tenantId: "tenant-a" }] },
      },
    });
    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(403);
  });

  it("returns 404 when draft idea does not exist", async () => {
    db.draftIdea.findUnique.mockResolvedValue(null);
    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(404);
  });

  it("returns 404 when draft idea belongs to another tenant", async () => {
    db.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-b",
      status: "accepted",
      assignedAgentId: "agent-a",
      convertedToBugId: null,
    });
    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(404);
  });

  it("returns 400 when draft idea is not accepted", async () => {
    db.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-a",
      status: "draft",
      assignedAgentId: "agent-a",
      convertedToBugId: null,
    });
    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(400);
  });

  it("returns 403 when agent is not the assigned agent", async () => {
    db.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-a",
      status: "accepted",
      assignedAgentId: "agent-other",
      convertedToBugId: null,
    });
    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(403);
  });

  it("returns 400 when draft idea already converted", async () => {
    db.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-a",
      status: "accepted",
      assignedAgentId: "agent-a",
      convertedToBugId: "bug-existing",
    });
    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid body", async () => {
    db.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-a",
      status: "accepted",
      assignedAgentId: "agent-a",
      convertedToBugId: null,
    });
    const badRequest = new NextRequest(`http://localhost/api/draft-ideas/di-1/rewrite`, {
      method: "POST",
      headers: { authorization: "Bearer ziki_test-key", "content-type": "application/json" },
      body: JSON.stringify({ title: "ab" }),
    });
    const response = await POST(badRequest, context);
    expect(response.status).toBe(400);
  });

  it("rewrites accepted draft idea into an open bug", async () => {
    db.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-a",
      status: "accepted",
      title: "Original title",
      description: "Original description",
      assignedAgentId: "agent-a",
      convertedToBugId: null,
      projectId: "proj-1",
    });
    db.draftIdeaComment.findMany.mockResolvedValue([
      {
        id: "c-1",
        body: "This is a duplicate.",
        authorId: "u1",
        agentId: null,
        duplicateOfId: "di-0",
        duplicateReason: "Same as di-0, filed earlier.",
        createdAt: new Date("2026-10-27T09:00:00Z"),
      },
    ]);
    db.bug.create.mockResolvedValue({
      id: "bug-1",
      number: 42,
      title: "Rewritten issue title",
      description: "Detailed rewritten description based on agent conversation.",
      status: "open",
      tenantId: "tenant-a",
      projectId: "proj-1",
      reporterId: "owner-a",
      createdByAgentId: "agent-a",
      createdAt: new Date(),
    });
    db.draftIdea.update.mockResolvedValue({
      id: "di-1",
      status: "converted",
      convertedToBugId: "bug-1",
    });

    const response = await POST(requestWithId("di-1", validBody), context);
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.bug.id).toBe("bug-1");
    expect(json.bug.number).toBe(42);
    expect(json.bug.status).toBe("open");
    expect(json.draftIdeaId).toBe("di-1");
    expect(json.convertedToBugId).toBe("bug-1");
    expect(db.bug.create).toHaveBeenCalledWith({
      data: {
        title: "Rewritten issue title",
        description: "Detailed rewritten description based on agent conversation.",
        status: "open",
        severity: "medium",
        reporterId: "owner-a",
        beneficiaryUserId: "owner-a",
        tenantId: "tenant-a",
        projectId: "proj-1",
        createdByAgentId: "agent-a",
      },
      select: expect.any(Object),
    });
    expect(db.draftIdea.update).toHaveBeenCalledWith({
      where: { id: "di-1" },
      data: { status: "converted", convertedToBugId: "bug-1" },
    });
  });
});

describe("unsupported methods on /api/draft-ideas/[id]/rewrite", () => {
  const context = { params: Promise.resolve({ id: "di-1" }) };

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
