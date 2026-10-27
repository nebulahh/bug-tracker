import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const requireUserMock = vi.hoisted(() => vi.fn());
const currentTenantIdForMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const prismaMock = {
  project: { findUnique: vi.fn() },
  draftIdea: { create: vi.fn() },
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

function jsonBody(body: unknown): Request {
  return new NextRequest("http://localhost/api/draft-ideas", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterMs: 0 });
});

describe("POST /api/draft-ideas", () => {
  it("returns 401 when not signed in", async () => {
    authMock.mockResolvedValue({});
    const response = await POST(jsonBody({ title: "x", description: "y" }));
    expect(response.status).toBe(401);
  });

  it("returns 403 when the user has no tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue(null);
    const response = await POST(
      jsonBody({ title: "Valid title", description: "Valid description here" }),
    );
    expect(response.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterMs: 5000 });
    const response = await POST(jsonBody({ title: "x", description: "y" }));
    expect(response.status).toBe(429);
  });

  it("returns 400 for invalid body", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    const response = await POST(jsonBody({ title: "ab", description: "short" }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("Title must be at least 3 characters");
  });

  it("returns 400 when projectId is not in the same tenant", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.project.findUnique.mockResolvedValue(null);
    const response = await POST(
      jsonBody({ title: "Valid title", description: "Valid description here", projectId: "proj-other" }),
    );
    expect(response.status).toBe(400);
  });

  it("creates a draft idea and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.project.findUnique.mockResolvedValue({ id: "proj-1", tenantId: "tenant-1" });
    prismaMock.draftIdea.create.mockResolvedValue({
      id: "di-1", title: "Valid title", description: "Valid description here",
      projectId: "proj-1", tenantId: "tenant-1", createdByUserId: "u1",
      status: "draft", createdAt: new Date(), updatedAt: new Date(),
    });

    const response = await POST(
      jsonBody({ title: "Valid title", description: "Valid description here", projectId: "proj-1" }),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("di-1");
    expect(json.title).toBe("Valid title");
    expect(json.status).toBe("draft");
    expect(prismaMock.draftIdea.create).toHaveBeenCalledWith({
      data: { title: "Valid title", description: "Valid description here", projectId: "proj-1", tenantId: "tenant-1", createdByUserId: "u1" },
      select: expect.any(Object),
    });
  });

  it("creates a draft idea without projectId (about Ziki itself)", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } });
    requireUserMock.mockResolvedValue({ id: "u1", role: "user" });
    currentTenantIdForMock.mockResolvedValue("tenant-1");
    prismaMock.draftIdea.create.mockResolvedValue({
      id: "di-2", title: "Ziki idea", description: "About Ziki itself",
      projectId: null, tenantId: "tenant-1", createdByUserId: "u1",
      status: "draft", createdAt: new Date(), updatedAt: new Date(),
    });

    const response = await POST(jsonBody({ title: "Ziki idea", description: "About Ziki itself" }));
    expect(response.status).toBe(201);
    expect(prismaMock.draftIdea.create).toHaveBeenCalledWith({
      data: { title: "Ziki idea", description: "About Ziki itself", projectId: null, tenantId: "tenant-1", createdByUserId: "u1" },
      select: expect.any(Object),
    });
  });
});

describe("unsupported methods on /api/draft-ideas", () => {
  it("returns 405 for GET", async () => {
    const response = GET(new NextRequest("http://localhost/api/draft-ideas"));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("returns 405 for PUT", async () => {
    const response = PUT(new NextRequest("http://localhost/api/draft-ideas"));
    expect(response.status).toBe(405);
  });

  it("returns 405 for PATCH", async () => {
    const response = PATCH(new NextRequest("http://localhost/api/draft-ideas"));
    expect(response.status).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const response = DELETE(new NextRequest("http://localhost/api/draft-ideas"));
    expect(response.status).toBe(405);
  });

  it("returns 204 for OPTIONS", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });
});