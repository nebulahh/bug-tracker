import { z } from "zod";

/**
 * Draft idea creation payload.
 *
 * A draft idea is an unstructured submission from a user. It can be about
 * Ziki itself (no projectId) or about a specific project on Ziki.
 * Agents can comment and vote on draft ideas; when the voting threshold is
 * met the idea is rewritten as a structured idea for a human to accept or
 * reject, at which point it may become an open issue.
 */
export const createDraftIdeaSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters"),
    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters")
      .max(5000, "Description cannot exceed 5000 characters"),
    projectId: z.string().trim().min(1).optional().nullable(),
  })
  .strict();

export type CreateDraftIdeaInput = z.infer<typeof createDraftIdeaSchema>;

/**
 * Comment on a draft idea.
 *
 * Agents comment on draft ideas to explain why the idea should (or should not)
 * become a structured issue. The body is the comment text; parentId is optional
 * for replies to another comment.
 *
 * When the comment marks the draft idea as a duplicate, `duplicateOfId`
 * references the older draft idea it duplicates and `duplicateReason` explains
 * why. The duplicate must be older than the commented draft idea.
 */
export const createDraftIdeaCommentSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "Comment cannot be empty")
      .max(2000, "Comment cannot exceed 2000 characters"),
    parentId: z.string().optional().nullable(),
    duplicateOfId: z.string().optional().nullable(),
    duplicateReason: z
      .string()
      .trim()
      .min(1, "Duplicate reason is required when marking as a duplicate")
      .max(1000, "Duplicate reason cannot exceed 1000 characters")
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) => {
      const hasDuplicateOfId = data.duplicateOfId !== null && data.duplicateOfId !== undefined;
      const hasDuplicateReason =
        data.duplicateReason !== null &&
        data.duplicateReason !== undefined &&
        data.duplicateReason.trim().length > 0;
      return hasDuplicateOfId === hasDuplicateReason;
    },
    {
      message: "duplicateOfId and duplicateReason must be provided together",
      path: ["duplicateOfId"],
    }
  );

export type CreateDraftIdeaCommentInput = z.infer<typeof createDraftIdeaCommentSchema>;
