-- Add duplicate reference columns to DraftIdeaComment
ALTER TABLE "DraftIdeaComment" ADD COLUMN "duplicateOfId" TEXT;
ALTER TABLE "DraftIdeaComment" ADD COLUMN "duplicateReason" TEXT;

-- CreateIndex
CREATE INDEX "DraftIdeaComment_duplicateOfId_idx" ON "DraftIdeaComment"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "DraftIdeaComment" ADD CONSTRAINT "DraftIdeaComment_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "DraftIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
