import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CRM_STATE_ID = "primary";

const DATABASE_ENV_CANDIDATES = [
  "CRM_DATABASE_URL",
  "SUPABASE_DATABASE_URL",
  "DATABASE_URL",
  "DATABASE_POSTGRES_PRISMA_URL",
  "DATABASE_POSTGRES_URL",
  "DATABASE_POSTGRES_URL_NO_SSL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
] as const;

const REQUIRED_SERVER_ENVS = [
  "CRM_DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "TASK_RSVP_SECRET",
  "RESEND_API_KEY",
] as const;

const LEGACY_LOGIN_ENVS = [
  "ADMIN_LOGIN_EMAIL",
  "OWNER_LOGIN_EMAIL",
  "CONSULTANT_LOGIN_EMAIL",
  "ADMIN_LOGIN_PASSWORD",
  "OWNER_LOGIN_PASSWORD",
  "CONSULTANT_LOGIN_PASSWORD",
  "ALLOW_ENV_LOGIN_BOOTSTRAP",
] as const;

function activeDatabaseEnv() {
  return DATABASE_ENV_CANDIDATES.find((key) => Boolean(process.env[key]?.trim())) ?? null;
}

function databaseProviderHint(value?: string) {
  if (!value) return "missing";

  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host.includes("supabase") || host.includes("supavisor")) return "supabase";
    if (host.includes("neon")) return "neon";
    if (host.includes("localhost") || host.includes("127.0.0.1")) return "local";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dbEnvName = activeDatabaseEnv();
  const dbEnvValue = dbEnvName ? process.env[dbEnvName] : undefined;

  try {
    const [userCount, usersWithPasswordHash, activeUserCount, crmState, propertyCount, leadCount, taskCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { passwordHash: { not: null } } }),
      prisma.user.count({ where: { active: true } }),
      prisma.crmState.findUnique({ where: { id: CRM_STATE_ID }, select: { id: true, updatedAt: true } }),
      prisma.property.count(),
      prisma.lead.count(),
      prisma.task.count(),
    ]);

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      database: {
        configured: Boolean(dbEnvName),
        activeEnvName: dbEnvName,
        providerHint: databaseProviderHint(dbEnvValue),
        connected: true,
      },
      crmState: {
        exists: Boolean(crmState),
        updatedAt: crmState?.updatedAt ?? null,
      },
      auth: {
        userCount,
        activeUserCount,
        usersWithPasswordHash,
        loginRequiresPasswordHash: true,
      },
      records: {
        properties: propertyCount,
        leads: leadCount,
        tasks: taskCount,
      },
      environment: {
        requiredPresent: Object.fromEntries(REQUIRED_SERVER_ENVS.map((key) => [key, Boolean(process.env[key]?.trim())])),
        legacyLoginEnvPresent: LEGACY_LOGIN_ENVS.filter((key) => Boolean(process.env[key]?.trim())),
      },
    });
  } catch (error) {
    console.error("[system-health] database check failed", error);
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        database: {
          configured: Boolean(dbEnvName),
          activeEnvName: dbEnvName,
          providerHint: databaseProviderHint(dbEnvValue),
          connected: false,
        },
        error: "Production database kontrolü başarısız.",
      },
      { status: 500 },
    );
  }
}
