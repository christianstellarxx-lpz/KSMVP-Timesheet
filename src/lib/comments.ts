import "server-only";
import { prisma } from "./prisma";
import { formatEtDateTime } from "./time";
import type { CommentInput } from "./validation";

export type CommentTarget = "START" | "END" | "GENERAL";

/** Serializable view of a comment for client components. */
export interface CommentDTO {
  id: string;
  target: CommentTarget;
  /** Human label for the part of the entry this is about. */
  targetLabel: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAtLabel: string;
  /** The VA has not yet seen it (readAt is null) — drives "New" badges + the notification. */
  unread: boolean;
}

const TARGET_LABEL: Record<CommentTarget, string> = {
  START: "Start-of-day tasks",
  END: "End of Day Report",
  GENERAL: "General",
};

export function targetLabel(target: string): string {
  return TARGET_LABEL[target as CommentTarget] ?? TARGET_LABEL.GENERAL;
}

/** Prisma include that pulls an entry's comment thread with author names, oldest first. */
export const commentInclude = {
  comments: {
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

interface CommentRow {
  id: string;
  target: string;
  body: string;
  authorId: string;
  readAt: Date | null;
  createdAt: Date;
  author: { name: string };
}

export function toCommentDTO(row: CommentRow): CommentDTO {
  return {
    id: row.id,
    target: (row.target as CommentTarget) ?? "GENERAL",
    targetLabel: targetLabel(row.target),
    body: row.body,
    authorId: row.authorId,
    authorName: row.author.name,
    createdAtLabel: formatEtDateTime(row.createdAt),
    unread: row.readAt == null,
  };
}

export type AddCommentResult = { ok: true } | { ok: false; message: string };

/**
 * An admin (or VA admin) leaves feedback on a VA's time entry.
 * Authorization is enforced by the calling server action (requireAdmin).
 */
export async function addComment(
  authorId: string,
  input: CommentInput,
): Promise<AddCommentResult> {
  const entry = await prisma.timeEntry.findUnique({
    where: { id: input.entryId },
    select: { id: true },
  });
  if (!entry) return { ok: false, message: "That entry could not be found." };

  await prisma.comment.create({
    data: {
      entryId: input.entryId,
      authorId,
      target: input.target,
      body: input.body,
    },
  });
  return { ok: true };
}

/**
 * Delete a comment — only if `authorId` actually wrote it (an admin can remove
 * their own comments). Returns whether a row was deleted.
 */
export async function deleteOwnComment(
  commentId: string,
  authorId: string,
): Promise<boolean> {
  const res = await prisma.comment.deleteMany({
    where: { id: commentId, authorId },
  });
  return res.count > 0;
}

/**
 * Mark all comments the given VA has received as read, clearing their
 * notification. Returns how many were newly marked. Two-step (find then update
 * by id) so it doesn't depend on relation filters in updateMany.
 */
export async function markCommentsReadForVa(vaId: string): Promise<number> {
  const unread = await prisma.comment.findMany({
    where: { readAt: null, entry: { vaId } },
    select: { id: true },
  });
  if (unread.length === 0) return 0;

  await prisma.comment.updateMany({
    where: { id: { in: unread.map((c) => c.id) } },
    data: { readAt: new Date() },
  });
  return unread.length;
}
