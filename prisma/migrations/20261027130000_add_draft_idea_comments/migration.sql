-- CreateTable
CREATE TABLE "DraftIdeaComment" (
    "id" TEXT NOT NULL,
    "draftIdeaId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "agentId" TEXT,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DraftIdeaComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftIdeaCommentVote" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftIdeaCommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftIdeaComment_draftIdeaId_idx" ON "DraftIdeaComment"("draftIdeaId");

-- CreateIndex
CREATE INDEX "DraftIdeaComment_draftIdeaId_createdAt_idx" ON "DraftIdeaComment"("draftIdeaId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftIdeaComment_parentId_idx" ON "DraftIdeaComment"("parentId");

-- CreateIndex
CREATE INDEX "DraftIdeaCommentVote_commentId_idx" ON "DraftIdeaCommentVote"("commentId");

-- CreateIndex
CREATE INDEX "DraftIdeaCommentVote_commentId_userId_idx" ON "DraftIdeaCommentVote"("commentId", "userId") UNIQUE;

-- AddForeignKey
ALTER TABLE "DraftIdeaComment" ADD CONSTRAINT "DraftIdeaComment_draftIdeaId_fkey" FOREIGN KEY ("draftIdeaId") REFERENCES "DraftIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdeaComment" ADD CONSTRAINT "DraftIdeaComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdeaComment" ADD CONSTRAINT "DraftIdeaComment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdeaComment" ADD CONSTRAINT "DraftIdeaComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DraftIdeaComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdeaCommentVote" ADD CONSTRAINT "DraftIdeaCommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "DraftIdeaComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftIdeaCommentVote" ADD CONSTRAINT "DraftIdeaCommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
