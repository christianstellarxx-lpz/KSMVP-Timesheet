import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_PIN } from "../src/lib/validation";

// Prefer the direct (non-pooled) connection for seeding when available; fall
// back to DATABASE_URL. Avoids pooler quirks during the Vercel build.
const seedUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const prisma = new PrismaClient(
  seedUrl ? { datasourceUrl: seedUrl } : undefined,
);

interface Member {
  role: "ADMIN" | "VA_ADMIN" | "VA" | "INTERN" | "SALES_PRODUCER";
  name: string;
  email: string;
  title: string;
}

const MEMBERS: Member[] = [
  // Admin — admin dashboard only
  { role: "ADMIN", name: "Kevin Spann", email: "akspann1@gmail.com", title: "Chief Executive Officer" },
  { role: "ADMIN", name: "Tanya Crawford", email: "tanya@kevinspann.com", title: "Chief Operations Officer" },

  // VA Admin — admin dashboard + their own VA dashboard.
  // Kristine also compiles & sends the daily time-report email to the admins.
  { role: "VA_ADMIN", name: "Kristine Te", email: "kristine@kevinspann.com", title: "Personal Assistant" },

  // VA — their own VA dashboard
  { role: "VA", name: "Jonathan Sarong", email: "jonathan@kevinspann.com", title: "Operations Director" },
  { role: "VA", name: "Christian Lopez", email: "christian@kevinspann.com", title: "Lead Generation and Paid Ads Specialist" },
  { role: "VA", name: "Bryxter Bulisig", email: "bryxter@kevinspann.com", title: "Stream Coordinator / Video Editor" },
  { role: "VA", name: "Gianfranco Adana", email: "franco@kevinspann.com", title: "Graphic Designer" },
  { role: "VA", name: "Jeannyn Jereza", email: "jeannyn@kevinspann.com", title: "GoHighLevel Coordinator" },
  { role: "VA", name: "Ginger Mesias", email: "ginger@kevinspann.com", title: "Social Media Coordinator" },
  { role: "VA", name: "Venus Paglinawan", email: "venus@kevinspann.com", title: "Course Management Coordinator" },

  // Intern — their own VA dashboard
  { role: "INTERN", name: "Rodney Monasque", email: "monasquerodney6@gmail.com", title: "Digital Marketing Virtual Assistant Intern" },

  // Sales Producer — unique Sales Desk dashboard
  { role: "SALES_PRODUCER", name: "Stephanie Mays", email: "stephanie@kevinspann.com", title: "Sales Producer" },
];

async function main() {
  console.log("Seeding KSMVP VA Tasks…");

  const passwordHash = await hashPassword(DEFAULT_PIN);

  // Idempotent: upsert by email so this is safe to run against production and
  // safe to re-run. Existing accounts keep their PIN and their time entries;
  // only new people are added and role/title are kept in sync. It never wipes
  // data (no deleteMany), so re-seeding won't destroy logged hours.
  for (const m of MEMBERS) {
    const email = m.email.toLowerCase();
    await prisma.user.upsert({
      where: { email },
      update: {
        role: m.role,
        name: m.name,
        title: m.title,
      },
      create: {
        role: m.role,
        name: m.name,
        title: m.title,
        email,
        passwordHash,
      },
    });
  }

  const byRole = (r: Member["role"]) => MEMBERS.filter((m) => m.role === r);

  console.log(`Seed complete — ${MEMBERS.length} accounts created.`);
  console.log("─".repeat(60));
  console.log(`Default PIN for every account: ${DEFAULT_PIN}`);
  console.log("(Everyone can change their PIN in Account settings.)");
  console.log("─".repeat(60));
  for (const role of ["ADMIN", "VA_ADMIN", "VA", "INTERN", "SALES_PRODUCER"] as const) {
    for (const m of byRole(role)) {
      console.log(`  ${role.padEnd(9)} ${m.email.padEnd(30)} ${m.name}`);
    }
  }
  console.log("─".repeat(60));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
