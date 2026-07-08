import "server-only";
import { prisma } from "./prisma";
import { formatEtDateTime } from "./time";
import {
  CHANNEL_LABEL,
  getRecipientIdsForChannel,
  type NoticeChannel,
} from "./sales";

/** Serializable view of a notice for client components. */
export interface NoticeDTO {
  id: string;
  channel: NoticeChannel;
  channelLabel: string;
  body: string;
  senderName: string;
  createdAtLabel: string;
}

export interface CreateNoticeInput {
  channel: NoticeChannel;
  body: string;
  senderId: string;
}

/**
 * Post a Sales Desk notice: one row per recipient so each person's read state
 * is independent. Returns the number of recipients it reached.
 * Authorization is enforced by the calling server action (requireSalesProducer).
 */
export async function createSalesNotice(
  input: CreateNoticeInput,
): Promise<number> {
  const recipientIds = await getRecipientIdsForChannel(input.channel);
  if (recipientIds.length === 0) return 0;

  await prisma.notice.createMany({
    data: recipientIds.map((recipientId) => ({
      channel: input.channel,
      body: input.body,
      senderId: input.senderId,
      recipientId,
    })),
  });
  return recipientIds.length;
}

interface NoticeRow {
  id: string;
  channel: string;
  body: string;
  createdAt: Date;
  sender: { name: string };
}

function toNoticeDTO(row: NoticeRow): NoticeDTO {
  return {
    id: row.id,
    channel: (row.channel as NoticeChannel) ?? "ADMIN_INQUIRY",
    channelLabel: CHANNEL_LABEL[row.channel as NoticeChannel] ?? "Message",
    body: row.body,
    senderName: row.sender.name,
    createdAtLabel: formatEtDateTime(row.createdAt),
  };
}

/** Unread notices addressed to a user, newest first (drives the dashboard banner). */
export async function getUnreadNoticesForUser(
  userId: string,
): Promise<NoticeDTO[]> {
  const rows = await prisma.notice.findMany({
    where: { recipientId: userId, readAt: null },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toNoticeDTO);
}

/**
 * Dismiss a notice — only if it's actually addressed to `recipientId` (so a
 * user can only clear their own). Returns whether a row was updated.
 */
export async function dismissNotice(
  noticeId: string,
  recipientId: string,
): Promise<boolean> {
  const res = await prisma.notice.updateMany({
    where: { id: noticeId, recipientId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count > 0;
}
