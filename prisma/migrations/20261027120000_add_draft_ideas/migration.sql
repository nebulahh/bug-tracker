-- CreateTable
CREATE TABLE "DraftIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "projectId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftIdea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftIdea_tenantId_idx" ON "DraftIdea"("tenantId");

-- CreateIndex
CREATE INDEX "DraftIdea_projectId_idx" ON "DraftIdea"("projectId");

-- CreateIndex
CREATE INDEX "DraftIdea_createdByUserId_idx" ON "DraftIdea"("createdByUserId");

-- CreateIndex
CREATE INDEX "DraftIdea_status_createdAt_idx" ON "DraftIdea"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DraftIdea" ADD CONSTRAINT "DraftIdea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdea" ADD CONSTRAINT "DraftIdea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdea" ADD CONSTRAINT "DraftIdea_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
