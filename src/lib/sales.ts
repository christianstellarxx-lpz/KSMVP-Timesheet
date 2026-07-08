import "server-only";
import { prisma } from "./prisma";

/**
 * The Sales Producer's two inquiry channels. Tapping one posts an in-app notice
 * that shows up on each recipient's own dashboard (VA or admin) until they
 * dismiss it — no email is sent. Recipients are defined by email (stable);
 * names are resolved from the DB for display.
 */
export type NoticeChannel = "TECH_SUPPORT" | "ADMIN_INQUIRY";

export interface SalesGroup {
  channel: NoticeChannel;
  /** UI style/icon selector. */
  key: "tech" | "admin";
  label: string;
  description: string;
  names: string[];
  placeholder: string;
}

/** Fixed recipient lists per channel (lowercased at compare time). */
const CHANNEL_EMAILS: Record<NoticeChannel, string[]> = {
  TECH_SUPPORT: [
    "jonathan@kevinspann.com",
    "christian@kevinspann.com",
    "jeannyn@kevinspann.com",
  ],
  ADMIN_INQUIRY: [
    "akspann1@gmail.com", // Kevin
    "tanya@kevinspann.com",
    "jonathan@kevinspann.com",
  ],
};

export const CHANNEL_LABEL: Record<NoticeChannel, string> = {
  TECH_SUPPORT: "Technical Support",
  ADMIN_INQUIRY: "Admin Inquiries",
};

/** Resolve the recipient user IDs for a channel (skips anyone not in the DB). */
export async function getRecipientIdsForChannel(
  channel: NoticeChannel,
): Promise<string[]> {
  const emails = CHANNEL_EMAILS[channel].map((e) => e.toLowerCase());
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The two Sales Desk buttons, with recipient first-names resolved for display. */
export async function getSalesDesk(): Promise<SalesGroup[]> {
  const all = [
    ...new Set([...CHANNEL_EMAILS.TECH_SUPPORT, ...CHANNEL_EMAILS.ADMIN_INQUIRY]),
  ].map((e) => e.toLowerCase());
  const users = await prisma.user.findMany({
    where: { email: { in: all } },
    select: { email: true, name: true },
  });
  const firstNameByEmail = new Map(
    users.map((u) => [u.email.toLowerCase(), u.name.split(" ")[0] || u.name]),
  );
  const names = (channel: NoticeChannel) =>
    CHANNEL_EMAILS[channel].map(
      (e) => firstNameByEmail.get(e.toLowerCase()) ?? e,
    );

  return [
    {
      channel: "TECH_SUPPORT",
      key: "tech",
      label: CHANNEL_LABEL.TECH_SUPPORT,
      description: "Report a technical issue or ask for help.",
      names: names("TECH_SUPPORT"),
      placeholder: "Describe the technical issue you need help with…",
    },
    {
      channel: "ADMIN_INQUIRY",
      key: "admin",
      label: CHANNEL_LABEL.ADMIN_INQUIRY,
      description: "Ask the admins a question or make a request.",
      names: names("ADMIN_INQUIRY"),
      placeholder: "What do you need from the admins?",
    },
  ];
}
