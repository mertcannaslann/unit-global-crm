import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { emptyCrmData } from "@/lib/empty-crm-data";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders, rateLimitKey } from "@/lib/rate-limit";
import { normalizeCrmDataForSecurity, resolveActor } from "@/lib/security";
import type { CrmData, Role, User } from "@/lib/types";

const CRM_STATE_ID = "primary";
const allowedRoles = new Set<Role>(["ADMIN", "OFFICE_MANAGER", "CONSULTANT"]);

type CredentialPayload = {
  users?: Array<User & { password?: string }>;
};

async function readFullState() {
  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  return normalizeCrmDataForSecurity(state?.data as Partial<CrmData> | undefined, emptyCrmData);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(rateLimitKey(request, "user-credentials", session.user.email), { max: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla kullanıcı işlemi denendi." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const fullState = await readFullState();
  const actor = resolveActor(fullState, session.user);
  if (!actor || actor.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as CredentialPayload | null;
  const users = body?.users?.filter((user) => user.email && user.password && allowedRoles.has(user.role)) ?? [];
  if (!users.length) {
    return NextResponse.json({ error: "Kaydedilecek kullanıcı şifresi bulunamadı." }, { status: 400 });
  }

  const normalizedUsers = users.map((user) => ({
    ...user,
    email: user.email.toLowerCase().trim(),
  }));

  await Promise.all(normalizedUsers.map(async (user) => {
    const passwordHash = await bcrypt.hash(String(user.password), 12);
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        title: user.title,
        phone: user.phone,
        avatarColor: user.avatarColor,
        active: user.active,
      },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        title: user.title,
        phone: user.phone,
        avatarColor: user.avatarColor,
        active: user.active,
      },
    });
  }));

  const savedUsers = await prisma.user.findMany({
    where: { email: { in: normalizedUsers.map((user) => user.email) } },
    select: { email: true, role: true, active: true, passwordHash: true },
  });
  const verifiedCount = savedUsers.filter((user) => Boolean(user.passwordHash)).length;

  if (verifiedCount !== normalizedUsers.length) {
    return NextResponse.json({ error: "Kullanıcı şifreleri doğrulanamadı.", saved: verifiedCount }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: verifiedCount,
    users: savedUsers.map((user) => ({
      email: user.email,
      role: user.role,
      active: user.active,
      hasPassword: Boolean(user.passwordHash),
    })),
  });
}
