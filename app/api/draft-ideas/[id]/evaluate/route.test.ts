import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  draftIdea: { findUnique: vi.fn() },
  draftIdeaCommentVote: { aggregate: vi.fn() },
};

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor: currentTenantIdForMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = await import("./route");

function requestWithId(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/draft-ideas/${id}/evaluate`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/draft-ideas/[id]/evaluate", () => {
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
      status: "draft",
    });
    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(404);
  });

  it("returns threshold not met when votes below threshold", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 2 } });

    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.voteCount).toBe(2);
    expect(json.threshold).toBe(3);
    expect(json.thresholdMet).toBe(false);
    expect(json.canPromote).toBe(false);
  });

  it("returns threshold met when votes reach threshold", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "draft",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 3 } });

    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.voteCount).toBe(3);
    expect(json.thresholdMet).toBe(true);
    expect(json.canPromote).toBe(true);
  });

  it("returns canPromote=false when status is not draft even with enough votes", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.findUnique.mockResolvedValue({
      id: "di-1",
      tenantId: "tenant-1",
      status: "structured",
    });
    prismaMock.draftIdeaCommentVote.aggregate.mockResolvedValue({ _count: { id: 5 } });

    const response = await GET(requestWithId("di-1"), { params: Promise.resolve({ id: "di-1" }) });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.voteCount).toBe(5);
    expect(json.thresholdMet).toBe(true);
    expect(json.canPromote).toBe(false);
  });
});

describe("unsupported methods on /api/draft-ideas/[id]/evaluate", () => {
  it("returns 405 for POST", async () => {
    const response = POST();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
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
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
  });
});
