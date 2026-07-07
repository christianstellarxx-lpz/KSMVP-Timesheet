import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_PIN } from "../src/lib/validation";

const prisma = new PrismaClient();

interface Member {
  role: "ADMIN" | "VA_ADMIN" | "VA" | "INTERN";
  name: string;
  email: string;
  title: string;
}

const MEMBERS: Member[] = [
  // Admin — admin dashboard only
  { role: "ADMIN", name: "Kevin Spann", email: "akspann1@gmail.com", title: "Chief Executive Officer" },
  { role: "ADMIN", name: "Tanya Crawford", email: "tanya@kevinspann.com", title: "Chief Operations Officer" },

  // VA Admin — admin dashboard + their own VA dashboard
  { role: "VA_ADMIN", name: "Jonathan Sarong", email: "jonathan@kevinspann.com", title: "Operations Director" },
  { role: "VA_ADMIN", name: "Christian Lopez", email: "christian@kevinspann.com", title: "Lead Generation and Paid Ads Specialist" },
  // Kristine also compiles & sends the daily time-report email to the admins.
  { role: "VA_ADMIN", name: "Kristine Te", email: "kristine@kevinspann.com", title: "Personal Assistant" },

  // VA — their own VA dashboard
  { role: "VA", name: "Bryxter Bulisig", email: "bryxter@kevinspann.com", title: "Stream Coordinator / Video Editor" },
  { role: "VA", name: "Gianfranco Adana", email: "franco@kevinspann.com", title: "Graphic Designer" },
  { role: "VA", name: "Jeannyn Jereza", email: "jeannyn@kevinspann.com", title: "GoHighLevel Coordinator" },
  { role: "VA", name: "Ginger Mesias", email: "ginger@kevinspann.com", title: "Social Media Coordinator" },
  { role: "VA", name: "Venus Paglinawan", email: "venus@kevinspann.com", title: "Course Management Coordinator" },

  // Intern — their own VA dashboard
  { role: "INTERN", name: "Rodney Monasque", email: "monasquerodney6@gmail.com", title: "Digital Marketing Virtual Assistant Intern" },
];

async function main() {
  console.log("Seeding KSMVP VA Tasks…");

  // Fresh start. Cascade removes any existing time entries.
  await prisma.timeEntry.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await hashPassword(DEFAULT_PIN);

  for (const m of MEMBERS) {
    await prisma.user.create({
      data: {
        role: m.role,
        name: m.name,
        title: m.title,
        email: m.email.toLowerCase(),
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
  for (const role of ["ADMIN", "VA_ADMIN", "VA", "INTERN"] as const) {
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
