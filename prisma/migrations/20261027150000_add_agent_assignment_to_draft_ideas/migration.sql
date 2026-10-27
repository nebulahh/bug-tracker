-- Add sourceDraftIdeaId to Bug
ALTER TABLE "Bug" ADD COLUMN "sourceDraftIdeaId" TEXT;

-- CreateIndex
CREATE INDEX "Bug_sourceDraftIdeaId_idx" ON "Bug"("sourceDraftIdeaId");

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_sourceDraftIdeaId_fkey" FOREIGN KEY ("sourceDraftIdeaId") REFERENCES "DraftIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add assignedAgentId and convertedToBugId to DraftIdea
ALTER TABLE "DraftIdea" ADD COLUMN "assignedAgentId" TEXT;
ALTER TABLE "DraftIdea" ADD COLUMN "convertedToBugId" TEXT;

-- CreateIndex
CREATE INDEX "DraftIdea_assignedAgentId_idx" ON "DraftIdea"("assignedAgentId");
CREATE INDEX "DraftIdea_convertedToBugId_idx" ON "DraftIdea"("convertedToBugId");

-- AddForeignKey
ALTER TABLE "DraftIdea" ADD CONSTRAINT "DraftIdea_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftIdea" ADD CONSTRAINT "DraftIdea_convertedToBugId_fkey" FOREIGN KEY ("convertedToBugId") REFERENCES "Bug"("id") ON DELETE SET NULL ON UPDATE CASCADE;
