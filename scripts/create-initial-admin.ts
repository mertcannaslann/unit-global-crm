import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { emptyCrmData } from "../src/lib/empty-crm-data";
import type { CrmData, User } from "../src/lib/types";

const CRM_STATE_ID = "primary";
const prisma = new PrismaClient();

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} zorunlu.`);
  return value;
}

function assertStrongPassword(password: string) {
  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD en az 12 karakter olmalı.");
  }
}

async function main() {
  const email = requiredEnv("INITIAL_ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("INITIAL_ADMIN_PASSWORD");
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "Platform Admin";
  assertStrongPassword(password);

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      passwordHash,
      role: "ADMIN",
      title: "Platform Admin",
      phone: "",
      avatarColor: "bg-blue-900",
      active: true,
    },
    update: {
      name,
      passwordHash,
      role: "ADMIN",
      title: "Platform Admin",
      active: true,
    },
  });

  const adminUser: User = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: "ADMIN",
    title: user.title,
    phone: user.phone,
    avatarColor: user.avatarColor,
    active: user.active,
  };

  const current = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  const currentData = (current?.data as CrmData | null) ?? emptyCrmData;
  const users = [
    adminUser,
    ...currentData.users.filter((item) => item.email.toLowerCase() !== email && item.id !== user.id),
  ];
  const nextData: CrmData = {
    ...emptyCrmData,
    ...currentData,
    users,
  };

  await prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: nextData as unknown as Prisma.InputJsonValue },
    update: { data: nextData as unknown as Prisma.InputJsonValue },
  });

  console.log(`Initial admin ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
