import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const datasourceUrl =
  process.env.CRM_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.DATABASE_POSTGRES_PRISMA_URL ??
  process.env.DATABASE_POSTGRES_URL ??
  process.env.DATABASE_POSTGRES_URL_NO_SSL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL;

function prismaDatasourceUrl(url?: string) {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const isSupabasePooler = parsed.hostname.includes("pooler.supabase.com") || parsed.hostname.includes("supavisor");
    if (isSupabasePooler) {
      parsed.searchParams.set("pgbouncer", parsed.searchParams.get("pgbouncer") ?? "true");
      parsed.searchParams.set("connection_limit", parsed.searchParams.get("connection_limit") ?? "1");
      parsed.searchParams.set("pool_timeout", parsed.searchParams.get("pool_timeout") ?? "20");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: datasourceUrl ? { db: { url: prismaDatasourceUrl(datasourceUrl) } } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
