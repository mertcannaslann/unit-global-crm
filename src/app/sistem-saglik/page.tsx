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

export default async function SystemHealthPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.role !== "ADMIN") {
    return (
      <main className="min-h-screen bg-slate-50 p-10 text-slate-950">
        <h1 className="text-2xl font-semibold">Sistem Sağlığı</h1>
        <p className="mt-4 text-slate-600">Bu sayfayı sadece platform admin görebilir.</p>
      </main>
    );
  }

  const dbEnvName = activeDatabaseEnv();
  const dbEnvValue = dbEnvName ? process.env[dbEnvName] : undefined;
  const requiredPresent = REQUIRED_SERVER_ENVS.map((key) => ({ key, present: Boolean(process.env[key]?.trim()) }));
  const legacyPresent = LEGACY_LOGIN_ENVS.filter((key) => Boolean(process.env[key]?.trim()));

  let result:
    | {
      connected: true;
      crmStateExists: boolean;
      crmStateUpdatedAt: Date | null;
      userCount: number;
      activeUserCount: number;
      usersWithPasswordHash: number;
      properties: number;
      leads: number;
      tasks: number;
    }
    | { connected: false; error: string };

  try {
    const [crmState, userCount, activeUserCount, usersWithPasswordHash, properties, leads, tasks] = await Promise.all([
      prisma.crmState.findUnique({ where: { id: CRM_STATE_ID }, select: { updatedAt: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.user.count({ where: { passwordHash: { not: null } } }),
      prisma.property.count(),
      prisma.lead.count(),
      prisma.task.count(),
    ]);

    result = {
      connected: true,
      crmStateExists: Boolean(crmState),
      crmStateUpdatedAt: crmState?.updatedAt ?? null,
      userCount,
      activeUserCount,
      usersWithPasswordHash,
      properties,
      leads,
      tasks,
    };
  } catch (error) {
    console.error("[system-health-page] database check failed", error);
    result = { connected: false, error: "Production database kontrolü başarısız." };
  }

  const rows = [
    ["Aktif DB env", dbEnvName ?? "Eksik"],
    ["DB sağlayıcı", databaseProviderHint(dbEnvValue)],
    ["DB bağlantısı", result.connected ? "Bağlı" : "Hatalı"],
    ["CRM state", result.connected && result.crmStateExists ? "Var" : "Eksik"],
    ["Hash'li kullanıcı", result.connected ? `${result.usersWithPasswordHash}/${result.userCount}` : "-"],
    ["Aktif kullanıcı", result.connected ? String(result.activeUserCount) : "-"],
    ["Portföy", result.connected ? String(result.properties) : "-"],
    ["Müşteri / lead", result.connected ? String(result.leads) : "-"],
    ["Görev", result.connected ? String(result.tasks) : "-"],
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-10 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">Admin kontrol</p>
          <h1 className="mt-2 text-3xl font-semibold">Sistem Sağlığı</h1>
          <p className="mt-2 text-slate-600">Secret değerleri gösterilmez; sadece production bağlantı ve güvenlik durumu özetlenir.</p>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Zorunlu env kontrolü</h2>
            <div className="mt-4 space-y-2">
              {requiredPresent.map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span className="font-mono text-sm">{item.key}</span>
                  <span className={item.present ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>
                    {item.present ? "Var" : "Eksik"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Eski env-login kontrolü</h2>
            {legacyPresent.length === 0 ? (
              <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-700">Eski env-login değişkeni yok.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {legacyPresent.map((key) => (
                  <div key={key} className="rounded-xl bg-red-50 px-4 py-3 font-mono text-sm font-semibold text-red-700">
                    {key}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
