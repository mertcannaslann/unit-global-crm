"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  Bell,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CalendarDays,
  Clock3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  FolderPlus,
  Home,
  LineChart,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Plug,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { money, shortDate } from "@/lib/formatters";
import { initials } from "@/lib/utils";
import { leadSchema, propertySchema } from "@/lib/validators";
import { useCrm } from "@/store/crm-store";
import type { ListingPreview } from "@/services/listing-providers/listing-preview";
import type { AuditLogAction, CrmData, Lead, MarketListing, Notification, OfficeClient, Property, Task, User } from "@/lib/types";

type CrmAppProps = {
  slug: string[];
};

type LeadFormValues = z.infer<typeof leadSchema>;

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/portfoyler", label: "Portföyler", icon: Building2 },
  { href: "/musteriler", label: "Müşteriler / Leadler", icon: Users },
  { href: "/gorevler", label: "Görevler", icon: ClipboardList },
  { href: "/takvim", label: "Takvim", icon: CalendarDays },
  { href: "/piyasa-analizi", label: "Piyasa Analizi", icon: LineChart },
  { href: "/ekip", label: "Ekip", icon: Users },
  { href: "/dokumanlar", label: "Dokümanlar", icon: FolderOpen },
  { href: "/entegrasyonlar", label: "Entegrasyonlar", icon: Plug },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
];

function navForUser(user: User) {
  if (user.role === "ADMIN") {
    return navItems.filter((item) => ["/dashboard", "/ayarlar"].includes(item.href));
  }
  if (user.role === "CONSULTANT") {
    return navItems.filter((item) => !["/ekip", "/entegrasyonlar", "/ayarlar"].includes(item.href));
  }
  return navItems;
}

const statusOptions = ["AKTIF", "PASIF", "OPSIYONLU", "SATILDI", "KIRALANDI"];
const leadStages = ["YENI_LEAD", "ARANDI", "RANDEVU_ALINDI", "YER_GOSTERILDI", "TEKLIF_VERILDI", "KAPANDI", "KAYBEDILDI"] as const;
const OFFICE_USER_LIMIT = 5;

function officeUsers(users: User[]) {
  return users.filter((item) => item.role !== "ADMIN");
}

function canSeeOffice(user: User) {
  return user.role === "OFFICE_MANAGER";
}

function canManageOffice(user: User) {
  return user.role === "OFFICE_MANAGER";
}

function canCreatePortfolio(user: User) {
  return user.role === "CONSULTANT";
}

function canManagePortfolio(user: User, property?: Property) {
  if (user.role !== "CONSULTANT") return false;
  return !property || property.consultantId === user.id;
}

function roleLabel(role: User["role"]) {
  if (role === "ADMIN") return "Platform Admin";
  if (role === "OFFICE_MANAGER") return "Ofis Sahibi";
  return "Danışman";
}

function calendarEmailForUser(user: User) {
  return user.calendarEmail || user.email;
}

function inviteFromEmailForClient(client?: OfficeClient) {
  return client?.inviteFromEmail?.trim() || "mrtcnasln@gmail.com";
}

function calendarLogoUrlForClient(client?: OfficeClient) {
  if (!client?.logoUrl) return undefined;
  if (client.logoUrl.startsWith("data:")) {
    return typeof window === "undefined" ? undefined : new URL("/api/client-logo/unit-global", window.location.origin).toString();
  }
  if (client.logoUrl.startsWith("/")) {
    return typeof window === "undefined" ? client.logoUrl : new URL(client.logoUrl, window.location.origin).toString();
  }
  return client.logoUrl;
}

type CreatedTaskPayload = Omit<Task, "id" | "status">;

type DispatchTaskInviteResult = Partial<Pick<Task, "googleCalendarEventId" | "googleCalendarHtmlLink" | "googleCalendarResponseStatus" | "calendarInviteStatus">>;

async function dispatchTaskInvite(input: {
  id: string;
  task: CreatedTaskPayload;
  attendeeEmail: string;
  attendeeName?: string;
  companyName: string;
  organizerEmail: string;
  companyLogoUrl?: string;
}): Promise<DispatchTaskInviteResult> {
  const task = { id: input.id, ...input.task };
  const emailResponse = await fetch("/api/calendar-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      attendeeEmail: input.attendeeEmail,
      attendeeName: input.attendeeName,
      companyName: input.companyName,
      organizerEmail: input.organizerEmail,
      companyLogoUrl: input.companyLogoUrl,
    }),
  });
  const emailResult = await emailResponse.json() as { sent?: boolean; mode?: "email"; error?: string };
  if (emailResponse.ok && emailResult.sent) {
    return {
      calendarInviteStatus: "Davet gönderildi",
      googleCalendarResponseStatus: "needsAction",
    };
  }

  throw new Error(emailResult.error ?? "Davet gönderilemedi.");
}

async function auditCustomerEvent(action: AuditLogAction, input: {
  targetCustomerId?: string;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await fetch("/api/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...input }),
    });
  } catch {
    // Audit logging must never block the user's CRM workflow.
  }
}

function generateTemporaryPassword(prefix = "CRM") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(bytes);
  }
  const randomPart = Array.from(bytes, (value, index) => alphabet[(value || Date.now() + index) % alphabet.length]).join("");
  return `${prefix}${randomPart}!`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function clientForUser(data: CrmData, user: User) {
  if (user.role === "ADMIN") return undefined;
  return data.clients.find((client) => client.id === user.clientId) ?? data.clients[0];
}

function workspaceName(user: User, client?: OfficeClient) {
  return user.role === "ADMIN" ? "Unit CRM" : client?.name ?? "Unit Global";
}

function workspaceSubtitle(user: User) {
  return user.role === "ADMIN" ? "Platform Yönetimi" : "Office CRM";
}

function humanize(value?: string) {
  if (!value) return "-";
  const labels: Record<string, string> = {
    YENI_LEAD: "Yeni Lead",
    RANDEVU_ALINDI: "Randevu Alındı",
    YER_GOSTERILDI: "Yer Gösterildi",
    TEKLIF_VERILDI: "Teklif Verildi",
    KAYBEDILDI: "Kaybedildi",
    KAPANDI: "Kapandı",
    ARAMA: "Arama",
    RANDEVU: "Randevu",
    YER_GOSTERIMI: "Yer Gösterimi",
    EVRAK_TAKIBI: "Evrak Takibi",
    FOTOGRAF_CEKIMI: "Fotoğraf Çekimi",
    FIYAT_GUNCELLEME: "Fiyat Güncelleme",
    MUSTERI_TAKIBI: "Müşteri Takibi",
    TAPU: "Tapu",
    YETKI_BELGESI: "Yetki Belgesi",
    KIMLIK: "Kimlik",
    KIRA_SOZLESMESI: "Kira Sözleşmesi",
    SATIS_SOZLESMESI: "Satış Sözleşmesi",
    DEGERLEME: "Değerleme",
    BEKLIYOR: "Bekliyor",
    TAMAM: "Tamam",
    EKSIK: "Eksik",
    OFFICE_MANAGER: "Ofis Sahibi",
    OFIS_SAHIBI: "Ofis Sahibi",
    CONSULTANT: "Danışman",
    ADMIN: "Admin",
    MULK_SAHIBI: "Mülk Sahibi",
    KIRACI: "Kiracı",
    needsAction: "Yanıt bekliyor",
    accepted: "Kabul edildi",
    declined: "Reddedildi",
    tentative: "Belki",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function formatTurkishDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

function formatTurkishMonth(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

function sameCalendarDay(value: string, target: Date) {
  const date = new Date(value);
  return date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() && date.getDate() === target.getDate();
}

function dateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysUntilDate(value: string | undefined, today = new Date()) {
  if (!value) return null;
  const date = dateOnly(value);
  if (!date) return null;
  return Math.round((date.getTime() - startOfLocalDay(today).getTime()) / 86400000);
}

function tenantReminderText(daysLeft: number) {
  if (daysLeft === 0) return "bugün çıkış / sözleşme bitiş günü";
  return `${daysLeft} gün kaldı`;
}

function tenantReminderNotifications(leads: Lead[], today = new Date()): Notification[] {
  const reminderDays = new Set([7, 5, 3, 0]);
  return leads
    .filter((lead) => lead.tenantStatus === "VAR" && lead.tenantMoveOut)
    .map((lead) => ({ lead, daysLeft: daysUntilDate(lead.tenantMoveOut, today) }))
    .filter((item): item is { lead: Lead; daysLeft: number } => item.daysLeft !== null && reminderDays.has(item.daysLeft))
    .map(({ lead, daysLeft }) => ({
      id: `tenant-reminder-${lead.id}-${lead.tenantMoveOut}-${daysLeft}`,
      title: "Kira sözleşmesi hatırlatması",
      message: `${lead.propertyOwner || lead.name} için ${tenantReminderText(daysLeft)}. ${lead.tenantName ? `Kiracı: ${lead.tenantName}. ` : ""}${lead.address || ""}`,
      targetUserId: lead.consultantId,
      status: "OKUNMADI",
      createdAt: new Date().toISOString(),
    }));
}

type ReportRange = "GUNLUK" | "HAFTALIK" | "AYLIK";

function inReportRange(value: string | undefined, range: ReportRange, today = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const startToday = startOfLocalDay(today);
  const startDate = startOfLocalDay(date);
  if (range === "GUNLUK") return startDate.getTime() === startToday.getTime();
  if (range === "HAFTALIK") {
    const startOfWeek = new Date(startToday);
    startOfWeek.setDate(startToday.getDate() - ((startToday.getDay() + 6) % 7));
    return startDate >= startOfWeek && startDate <= startToday;
  }
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function reportRangeLabel(range: ReportRange) {
  if (range === "GUNLUK") return "Bugün";
  if (range === "HAFTALIK") return "Bu hafta";
  return "Bu ay";
}

export function CrmApp({ slug }: CrmAppProps) {
  const { data } = useCrm();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentPath = `/${slug.join("/")}`;
  const user = data.users.find((item) => item.email === session?.user?.email);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "unauthenticated") {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoadingScreen />;
  }

  const visibleNav = navForUser(user);
  const activeClient = clientForUser(data, user);

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-foreground">
      <MobileTopbar onMenu={() => setSidebarOpen(true)} user={user} client={activeClient} />
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-slate-200/70 bg-white/85 px-4 py-5 backdrop-blur-xl lg:block">
          <Sidebar user={user} client={activeClient} currentPath={currentPath} nav={visibleNav} />
        </aside>

        <AnimatePresence>
          {sidebarOpen ? (
            <motion.div className="fixed inset-0 z-50 bg-slate-950/25 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.aside
                className="h-full w-80 bg-white/95 p-4 backdrop-blur-xl"
                initial={{ x: -340 }}
                animate={{ x: 0 }}
                exit={{ x: -340 }}
                transition={{ type: "spring", damping: 24, stiffness: 220 }}
              >
                <button className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" onClick={() => setSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
                <Sidebar user={user} client={activeClient} currentPath={currentPath} nav={visibleNav} onNavigate={() => setSidebarOpen(false)} />
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-10">
          <PageHeader slug={slug} user={user} client={activeClient} />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <RouteRenderer slug={slug} user={user} />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        CRM yükleniyor
      </div>
    </main>
  );
}

function MobileTopbar({ onMenu, user, client }: { onMenu: () => void; user: User; client?: OfficeClient }) {
  const name = workspaceName(user, client);
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
      <Button variant="ghost" size="icon" onClick={onMenu}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ClientLogoMark client={client} fallbackName={name} compact />
        {!client?.logoUrl ? name : null}
      </div>
      <Avatar user={user} />
    </div>
  );
}

function Sidebar({ user, client, currentPath, nav, onNavigate }: { user: User; client?: OfficeClient; currentPath: string; nav: typeof navItems; onNavigate?: () => void }) {
  const name = workspaceName(user, client);
  return (
    <div className="flex h-full flex-col">
      <div className={`mb-8 px-2 ${client?.logoUrl ? "space-y-2" : "flex items-center gap-3"}`}>
        <ClientLogoMark client={client} fallbackName={name} />
        <div>
          {!client?.logoUrl ? <p className="text-base font-semibold">{name}</p> : null}
          <p className="text-xs font-medium text-slate-500">{workspaceSubtitle(user)}</p>
        </div>
      </div>

      <nav className="space-y-1.5">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`);
          return (
            <Link
              href={item.href}
              key={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-blue-50 text-[#143a72] shadow-sm shadow-blue-950/[0.03]" : "text-slate-600 hover:bg-white hover:text-slate-950"
              }`}
            >
              <Icon className={`h-4 w-4 stroke-[1.7] ${active ? "text-primary" : "text-slate-400"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
        <div className="flex items-center gap-3">
          <Avatar user={user} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel(user.role)}</p>
          </div>
        </div>
        <Button className="mt-3 h-9 w-full justify-start rounded-xl border-slate-200 bg-white/80" variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: User }) {
  return <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${user.avatarColor} text-xs font-semibold text-white shadow-sm shadow-blue-950/10`}>{initials(user.name)}</div>;
}

function ClientLogoMark({ client, fallbackName, compact = false }: { client?: OfficeClient; fallbackName: string; compact?: boolean }) {
  if (client?.logoUrl) {
    return (
      <div className={`flex shrink-0 items-center ${compact ? "h-8 max-w-36" : "h-11 max-w-[178px]"}`}>
        <img src={client.logoUrl} alt={`${client.name} logosu`} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm shadow-blue-950/10 ${compact ? "h-8 w-8" : "h-9 w-9"}`}>
      <Building2 className={compact ? "h-4 w-4" : "h-5 w-5"} />
      <span className="sr-only">{fallbackName}</span>
    </div>
  );
}

function PageHeader({ slug, user, client }: { slug: string[]; user: User; client?: OfficeClient }) {
  const { data, markNotificationRead } = useCrm();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const todayLabel = useMemo(() => formatTurkishDate(new Date()), []);
  const titleMap: Record<string, string> = {
    dashboard: "Dashboard",
    portfoyler: "Portföyler",
    musteriler: "Müşteriler / Leadler",
    gorevler: "Görevler",
    takvim: "Takvim",
    "piyasa-analizi": "Piyasa Analizi",
    ekip: "Ekip",
    dokumanlar: "Dokümanlar",
    entegrasyonlar: "Entegrasyonlar",
    ayarlar: "Ayarlar",
  };

  const title = titleMap[slug[0]] ?? "Dashboard";
  const scopedTenantLeads = data.leads.filter((lead) => canSeeOffice(user) || lead.consultantId === user.id);
  const tenantNotifications = tenantReminderNotifications(scopedTenantLeads);
  const visibleNotifications = [
    ...tenantNotifications,
    ...data.notifications.filter((item) => !item.targetUserId || canSeeOffice(user) || item.targetUserId === user.id),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = visibleNotifications.filter((item) => item.status === "OKUNMADI").length;
  const pendingTasks = data.tasks
    .filter((item) => item.status !== "TAMAMLANDI" && (canSeeOffice(user) || item.assignedToId === user.id || item.createdById === user.id))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <header className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{workspaceName(user, client)} · {roleLabel(user.role)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm shadow-blue-950/[0.03]">Bugün: {todayLabel}</div>
        <div className="relative">
          <Button
            className="relative h-11 rounded-xl border-slate-200/80 bg-white/90 px-3 text-slate-700 shadow-sm shadow-blue-950/[0.03] hover:bg-[#f3f8ff] hover:text-primary"
            variant="outline"
            onClick={() => setTaskOpen((open) => !open)}
            aria-label="Bekleyen İşler"
          >
            <ClipboardList className="h-4 w-4 stroke-[1.8]" />
            {pendingTasks.length ? (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                {pendingTasks.length}
              </span>
            ) : null}
          </Button>
          {taskOpen ? (
            <Card className="absolute right-0 top-12 z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl border-slate-200/80 shadow-xl shadow-blue-950/10">
              <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Bekleyen İşler</p>
                  <p className="text-xs text-muted-foreground">{pendingTasks.length} açık</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setTaskOpen(false)} aria-label="Bekleyen işleri kapat">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {pendingTasks.slice(0, 8).map((task) => (
                  <Link key={task.id} href="/gorevler" className="block border-b border-slate-200/70 px-4 py-3 text-left transition hover:bg-[#f7fbff]" onClick={() => setTaskOpen(false)}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{task.title}</p>
                      <Badge label={task.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{shortDate(task.dueDate)} teslim</p>
                  </Link>
                ))}
                {!pendingTasks.length ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Henüz görev yok
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
        <div className="relative">
          <Button
            className="relative h-11 rounded-xl border-slate-200/80 bg-white/90 px-4 text-slate-700 shadow-sm shadow-blue-950/[0.03] hover:bg-[#f3f8ff] hover:text-primary"
            variant="outline"
            onClick={() => setNotificationOpen((open) => !open)}
            aria-label="Bildirimler"
          >
            <Bell className="h-4 w-4 stroke-[1.8]" />
            Bildirimler
            {unreadCount ? (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                {unreadCount}
              </span>
            ) : null}
          </Button>
          {notificationOpen ? (
            <Card className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border-slate-200/80 shadow-xl shadow-blue-950/10">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Bildirimler</p>
                  <p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} okunmamış bildirim` : "Yeni bildirim yok"}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setNotificationOpen(false)} aria-label="Bildirimleri kapat">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {visibleNotifications.slice(0, 8).map((notification) => (
                  <button
                    key={notification.id}
                    className="w-full border-b border-border px-4 py-3 text-left transition hover:bg-[#f7fbff]"
                    onClick={() => {
                      if (!notification.id.startsWith("tenant-reminder-")) markNotificationRead(notification.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{notification.title}</p>
                      {notification.status === "OKUNMADI" ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">{notification.message}</p>
                    <p className="mt-2 text-xs text-slate-400">{shortDate(notification.createdAt)}</p>
                  </button>
                ))}
                {!visibleNotifications.length ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Henüz bildirim yok. Yeni görev, lead veya portföy aksiyonu geldiğinde burada görünecek.
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function RouteRenderer({ slug, user }: { slug: string[]; user: User }) {
  const page = slug[0] ?? "dashboard";
  const id = slug[1];
  const mode = slug[2];

  if (page === "dashboard" || page === "danisman-dashboard") return <Dashboard user={user} />;
  if (page === "portfoyler" && id === "yeni") return <PropertyEditor user={user} />;
  if (page === "portfoyler" && id && mode === "duzenle") return <PropertyEditor user={user} propertyId={id} />;
  if (page === "portfoyler" && id) return <PropertyDetail user={user} propertyId={id} />;
  if (page === "portfoyler") return <PropertiesPage user={user} />;
  if (page === "musteriler" && id) return <LeadDetail user={user} leadId={id} />;
  if (page === "musteriler") return <LeadsPage user={user} />;
  if (page === "gorevler") return <TasksPage user={user} />;
  if (page === "takvim") return <CalendarPage user={user} />;
  if (page === "piyasa-analizi") return <MarketAnalysisPage user={user} />;
  if (page === "ekip") return <TeamPage user={user} />;
  if (page === "dokumanlar") return <DocumentsPage user={user} />;
  if (page === "entegrasyonlar") return <IntegrationsPage />;
  if (page === "ayarlar") return <SettingsPage user={user} />;
  return <Dashboard user={user} />;
}

function AccessDenied() {
  return <Card className="p-8 text-sm text-muted-foreground">Bu sayfa için yetkin yok. Atanmış kayıtların ve görevlerin görünür.</Card>;
}

function PlatformAdminDashboard({ user }: { user: User }) {
  const { data, upsertClient, upsertUsers, resetClientData } = useCrm();
  const unitClient = data.clients.find((client) => client.id === "client-unit-global");
  const [officeName, setOfficeName] = useState("Unit Global");
  const [ownerName, setOwnerName] = useState("Dorukhan Öründü");
  const [ownerEmail, setOwnerEmail] = useState("dorukhan@unitglobal.com");
  const [inviteFromEmail, setInviteFromEmail] = useState(unitClient?.inviteFromEmail ?? "mrtcnasln@gmail.com");
  const [consultantCount, setConsultantCount] = useState(1);
  const [clientLogoUrl, setClientLogoUrl] = useState(unitClient?.logoUrl ?? "");
  const officeMemberList = officeUsers(data.users);
  const [generatedAccounts, setGeneratedAccounts] = useState<Array<{ role: string; name: string; email: string; password: string }>>([]);
  const offices = data.clients.map((client) => {
    const members = data.users.filter((item) => item.clientId === client.id && item.role !== "ADMIN");
    const memberIds = new Set(members.map((item) => item.id));
    const clientProperties = data.properties.filter((item) => memberIds.has(item.consultantId));
    const clientPropertyIds = new Set(clientProperties.map((item) => item.id));
    const clientLeads = data.leads.filter((item) => memberIds.has(item.consultantId) || (item.importedById ? memberIds.has(item.importedById) : false));
    const clientLeadIds = new Set(clientLeads.map((item) => item.id));
    return {
      ...client,
      owner: client.ownerName,
      users: members.length,
      userLimit: client.userLimit,
      properties: clientProperties.length,
      leads: clientLeads.length,
      tasks: data.tasks.filter((item) => memberIds.has(item.assignedToId) || memberIds.has(item.createdById) || (item.leadId ? clientLeadIds.has(item.leadId) : false) || (item.propertyId ? clientPropertyIds.has(item.propertyId) : false)).length,
      documents: data.documents.filter((item) => memberIds.has(item.assignedToId) || (item.relatedType === "PROPERTY" && clientPropertyIds.has(item.relatedId)) || (item.relatedType === "LEAD" && clientLeadIds.has(item.relatedId))).length,
    };
  });
  const leadImportRows = data.leads
    .map((lead) => {
      const consultant = data.users.find((item) => item.id === lead.consultantId);
      const uploader = data.users.find((item) => item.id === lead.importedById) ?? consultant;
      const client = data.clients.find((item) => item.id === (uploader?.clientId ?? consultant?.clientId));
      return {
        id: lead.id,
        leadId: displayLeadId(lead),
        clientName: client?.name ?? "Ofis seçilmedi",
        customer: lead.propertyOwner || lead.name || "-",
        uploader: uploader?.name ?? "Bilinmeyen kullanıcı",
        source: lead.importSource ?? lead.source ?? "Eski kayıt",
        importedAt: lead.importedAt ?? lead.createdAt,
      };
    })
    .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
  const slug = officeName.toLocaleLowerCase("tr").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "").slice(0, 18) || "ofis";
  const clientId = slug === "unitglobal" ? "client-unit-global" : `client-${slug}`;

  function handleClientLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Logo için PNG, JPG, WebP veya SVG yükle.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Logo dosyası 1.5 MB altında olmalı.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setClientLogoUrl(String(reader.result));
      toast.success("Logo yüklendi");
    };
    reader.onerror = () => toast.error("Logo okunamadı.");
    reader.readAsDataURL(file);
  }

  function generateOfficeAccounts() {
    const maxConsultants = OFFICE_USER_LIMIT - 1;
    const count = Math.max(1, Math.min(maxConsultants, consultantCount));
    upsertClient({
      id: clientId,
      name: officeName || "Yeni Ofis",
      ownerName: ownerName || "Ofis Sahibi",
      inviteFromEmail: inviteFromEmail.trim() || "mrtcnasln@gmail.com",
      userLimit: OFFICE_USER_LIMIT,
      status: "Hazır",
      logoUrl: clientLogoUrl || undefined,
    });
    const accounts = [
      {
        role: "Ofis Sahibi",
        name: ownerName || "Ofis Sahibi",
        email: ownerEmail || `owner@${slug}.com`,
        password: generateTemporaryPassword("Owner"),
      },
      ...Array.from({ length: count }).map((_, index) => ({
        role: "Danışman",
        name: `Danışman ${index + 1}`,
        email: `danisman${index + 1}@${slug}.crm`,
        password: generateTemporaryPassword(`D${index + 1}`),
      })),
    ];
    const officeUsersToSave: User[] = [
      {
        id: clientId === "client-unit-global" ? "manager-1" : `manager-${slug}`,
        name: ownerName || "Ofis Sahibi",
        email: ownerEmail || `owner@${slug}.com`,
        calendarEmail: ownerEmail || `owner@${slug}.com`,
        role: "OFFICE_MANAGER",
        title: "Ofis Sahibi",
        phone: "Telefon girilecek",
        avatarColor: "bg-blue-950",
        active: true,
        clientId,
      },
      ...Array.from({ length: count }).map((_, index): User => ({
        id: clientId === "client-unit-global" && index === 0 ? "consultant-1" : `consultant-${slug}-${index + 1}`,
        name: clientId === "client-unit-global" && index === 0 ? "Kaan Öründü" : `Danışman ${index + 1}`,
        email: clientId === "client-unit-global" && index === 0 ? "kaan@unitglobal.com" : `danisman${index + 1}@${slug}.crm`,
        calendarEmail: clientId === "client-unit-global" && index === 0 ? "kaan@unitglobal.com" : `danisman${index + 1}@${slug}.crm`,
        role: "CONSULTANT",
        title: "Gayrimenkul Danışmanı",
        phone: "Telefon girilecek",
        avatarColor: "bg-blue-900",
        active: true,
        clientId,
      })),
    ];
    upsertUsers(officeUsersToSave);
    setGeneratedAccounts(accounts);
    toast.success(`${officeName} için ${accounts.length}/${OFFICE_USER_LIMIT} kullanıcı girişi hazırlandı`);
  }

  function handleResetOfficeData(office: (typeof offices)[number]) {
    const totalRecords = office.properties + office.leads + office.tasks + office.documents;
    if (!totalRecords) {
      toast.message(`${office.name} için temizlenecek test datası yok.`);
      return;
    }
    const approved = window.confirm(`${office.name} test datası temizlensin mi? Kullanıcılar, logo ve ofis hesabı korunur; portföy, müşteri, görev, doküman ve rapor kayıtları silinir.`);
    if (!approved) return;
    resetClientData(office.id);
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm text-muted-foreground">Platform Admin</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Hoş geldin, {user.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Emlak ofisine üyelik aç, owner ve en fazla 4 danışman olmak üzere toplam 5 kullanıcıya kadar giriş üretip müşteriye ilet.</p>
          </div>
          <Button onClick={generateOfficeAccounts}>
            <Plus className="h-4 w-4" />
            Hesapları Oluştur
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Aktif ofis" value={offices.length.toString()} detail="Sisteme dahil edilen ofis" />
        <Metric label="Ofis kullanıcıları" value={`${officeMemberList.length}/${OFFICE_USER_LIMIT}`} detail="Owner + danışman limiti" />
        <Metric label="Toplam müşteri" value={data.leads.length.toString()} detail="Platform genelinde" />
        <Metric label="Toplam portföy" value={data.properties.length.toString()} detail="Ofislerden gelen kayıt" />
        <Metric label="Online işlem" value={data.activityLogs.length.toString()} detail="Son operasyon kayıtları" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="p-5">
          <SectionTitle title="Yeni Ofis Hesabı" action="Basit kurulum" />
          <div className="space-y-4">
            <Field label="Ofis adı"><Input value={officeName} onChange={(event) => setOfficeName(event.target.value)} /></Field>
            <Field label="Ofis sahibi"><Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} /></Field>
            <Field label="Owner e-posta"><Input value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} /></Field>
            <Field label="Davet gönderen e-posta"><Input type="email" value={inviteFromEmail} onChange={(event) => setInviteFromEmail(event.target.value)} placeholder="info@unitglobal.com" /></Field>
            <Field label="Müşteri logosu">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-slate-50 p-3">
                <div className="flex h-14 w-32 shrink-0 items-center justify-center rounded-md border border-border bg-white p-2">
                  {clientLogoUrl ? (
                    <img src={clientLogoUrl} alt={`${officeName} logosu`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-950/10 hover:bg-primary/90">
                    <Upload className="h-4 w-4" />
                    Logo Yükle
                    <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleClientLogoUpload} />
                  </label>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Logo yoksa sol menüde mevcut bina ikonu kullanılır.</p>
                </div>
              </div>
            </Field>
            <Field label="Danışman sayısı">
              <Input
                type="number"
                min={1}
                max={OFFICE_USER_LIMIT - 1}
                value={consultantCount}
                onChange={(event) => setConsultantCount(Math.max(1, Math.min(OFFICE_USER_LIMIT - 1, Number(event.target.value))))}
              />
            </Field>
            <p className="text-xs leading-5 text-muted-foreground">Paket limiti owner dahil toplam {OFFICE_USER_LIMIT} kullanıcıdır. Kaan ilk danışman olarak pakete dahildir.</p>
            <Button className="w-full" onClick={generateOfficeAccounts}>
              <Plus className="h-4 w-4" />
              Kullanıcı Girişlerini Üret
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle title="Üretilen Kullanıcı Bilgileri" padded />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Rol</th>
                  <th className="px-5 py-3 font-semibold">Ad</th>
                  <th className="px-5 py-3 font-semibold">Kullanıcı adı</th>
                  <th className="px-5 py-3 font-semibold">Şifre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {generatedAccounts.map((account) => (
                  <tr key={`${account.role}-${account.email}`} className="bg-white hover:bg-slate-50">
                    <td className="px-5 py-4"><Badge label={account.role} /></td>
                    <td className="px-5 py-4 font-medium">{account.name}</td>
                    <td className="px-5 py-4">{account.email}</td>
                    <td className="px-5 py-4 font-mono text-xs">{account.password}</td>
                  </tr>
                ))}
                {!generatedAccounts.length ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-sm text-muted-foreground" colSpan={4}>Henüz kullanıcı girişi üretilmedi.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <SectionTitle title="Çalışılan Emlak Ofisleri" padded />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Ofis</th>
                  <th className="px-5 py-3 font-semibold">Owner</th>
                  <th className="px-5 py-3 font-semibold">Davet e-postası</th>
                  <th className="px-5 py-3 font-semibold">Kullanıcı</th>
                  <th className="px-5 py-3 font-semibold">Portföy</th>
                  <th className="px-5 py-3 font-semibold">Müşteri</th>
                  <th className="px-5 py-3 font-semibold">Görev</th>
                  <th className="px-5 py-3 font-semibold">Durum</th>
                  <th className="px-5 py-3 font-semibold">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offices.map((office) => (
                  <tr key={office.id} className="bg-white hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-24 shrink-0 items-center justify-center rounded-md border border-border bg-white p-2">
                          {office.logoUrl ? (
                            <img src={office.logoUrl} alt={`${office.name} logosu`} className="max-h-full max-w-full object-contain" />
                          ) : (
                            <Building2 className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <span>{office.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">{office.owner}</td>
                    <td className="px-5 py-4 text-muted-foreground">{office.inviteFromEmail ?? "-"}</td>
                    <td className="px-5 py-4">{office.users}/{office.userLimit}</td>
                    <td className="px-5 py-4">{office.properties}</td>
                    <td className="px-5 py-4">{office.leads}</td>
                    <td className="px-5 py-4">{office.tasks}</td>
                    <td className="px-5 py-4"><Badge label={office.status} /></td>
                    <td className="px-5 py-4">
                      <Button
                        className="border-red-100 text-red-700 hover:bg-red-50 hover:text-red-800"
                        variant="outline"
                        onClick={() => handleResetOfficeData(office)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Test Datasını Temizle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Canlı Kurulum Listesi" />
          <div className="space-y-3 text-sm">
            <InfoRow label="Owner hesabı" value="Dorukhan Öründü" />
            <InfoRow label="Danışman hesabı" value="Kaan Öründü" />
            <InfoRow label="Başlangıç verisi" value="Temiz" />
            <InfoRow label="Demo operasyon" value="Silindi" />
          </div>
          <p className="mt-5 rounded-md border border-border bg-slate-50 p-3 text-sm leading-6 text-muted-foreground">
            Temel mantık: ofis adını gir, owner bilgisini yaz, danışman sayısını belirle, kullanıcı adı/şifreyi üret ve müşteriye ilet.
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <SectionTitle title="Müşteri Yükleme Takibi" action={`${leadImportRows.length} müşteri`} padded />
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Ofis</th>
                <th className="px-5 py-3 font-semibold">ID</th>
                <th className="px-5 py-3 font-semibold">Müşteri</th>
                <th className="px-5 py-3 font-semibold">Yükleyen</th>
                <th className="px-5 py-3 font-semibold">Kaynak</th>
                <th className="px-5 py-3 font-semibold">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leadImportRows.map((row) => (
                <tr key={row.id} className="bg-white hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium">{row.clientName}</td>
                  <td className="px-5 py-4 font-mono text-xs">{row.leadId}</td>
                  <td className="px-5 py-4">{row.customer}</td>
                  <td className="px-5 py-4">{row.uploader}</td>
                  <td className="px-5 py-4">{row.source}</td>
                  <td className="px-5 py-4">{shortDate(row.importedAt)}</td>
                </tr>
              ))}
              {!leadImportRows.length ? (
                <tr>
                  <td className="px-5 py-8 text-center text-sm text-muted-foreground" colSpan={6}>Henüz müşteri yükleme kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  const { data } = useCrm();
  const today = useMemo(() => new Date(), []);
  if (user.role === "ADMIN") return <PlatformAdminDashboard user={user} />;
  const cardShell = "rounded-[22px] border-slate-200/70 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur";
  const scopedProperties = canSeeOffice(user) ? data.properties : data.properties.filter((item) => item.consultantId === user.id);
  const scopedLeads = canSeeOffice(user) ? data.leads : data.leads.filter((item) => item.consultantId === user.id);
  const scopedTasks = canSeeOffice(user) ? data.tasks : data.tasks.filter((item) => item.assignedToId === user.id);
  const todayTasks = scopedTasks.filter((item) => item.status !== "TAMAMLANDI" && sameCalendarDay(item.dueDate, today));
  const appointments = scopedTasks.filter((item) => item.type === "RANDEVU" || item.type === "YER_GOSTERIMI");
  const activeTenants = scopedLeads.filter((lead) => lead.tenantStatus === "VAR");
  const tenantReminders = tenantReminderNotifications(scopedLeads, today);
  const activeSale = scopedProperties.filter((item) => item.status === "AKTIF" && item.listingType === "SATILIK").length;
  const activeRent = scopedProperties.filter((item) => item.status === "AKTIF" && item.listingType === "KIRALIK").length;
  const reportRanges = (["GUNLUK", "HAFTALIK", "AYLIK"] as const).map((range) => ({
    range,
    label: reportRangeLabel(range),
    leads: scopedLeads.filter((item) => inReportRange(item.createdAt, range, today)).length,
    properties: scopedProperties.filter((item) => inReportRange(item.createdAt, range, today)).length,
    sale: scopedProperties.filter((item) => item.listingType === "SATILIK" && inReportRange(item.createdAt, range, today)).length,
    rent: scopedProperties.filter((item) => item.listingType === "KIRALIK" && inReportRange(item.createdAt, range, today)).length,
    tasks: scopedTasks.filter((item) => inReportRange(item.dueDate, range, today)).length,
  }));
  const monthly = ["Oca", "Şub", "Mar", "Nis", "May", "Haz"].map((month, index) => ({
    month,
    portfoy: scopedProperties.length ? 1 + index : 0,
    lead: scopedLeads.length ? 2 + index : 0,
    aksiyon: scopedTasks.length ? index + 1 : 0,
  }));
  const statusData = statusOptions.map((status) => ({ name: status, value: scopedProperties.filter((item) => item.status === status).length }));
  const performanceUsers = canSeeOffice(user) ? data.users.filter((item) => item.role === "CONSULTANT") : [user];
  const consultantData = performanceUsers.map((consultant) => ({
    name: consultant.name.split(" ")[0],
    portfoy: data.properties.filter((item) => item.consultantId === consultant.id).length,
    gorev: data.tasks.filter((item) => item.assignedToId === consultant.id && item.status !== "TAMAMLANDI").length,
    kapanan: data.leads.filter((item) => item.consultantId === consultant.id && item.status === "KAPANDI").length,
  }));
  const consultantReportRows = data.users.filter((item) => item.role === "CONSULTANT").map((consultant) => {
    const consultantLeads = data.leads.filter((item) => item.consultantId === consultant.id);
    const consultantProperties = data.properties.filter((item) => item.consultantId === consultant.id);
    const consultantTasks = data.tasks.filter((item) => item.assignedToId === consultant.id);
    const countFor = (range: ReportRange) =>
      consultantLeads.filter((item) => inReportRange(item.createdAt, range, today)).length
      + consultantProperties.filter((item) => inReportRange(item.createdAt, range, today)).length
      + consultantTasks.filter((item) => inReportRange(item.dueDate, range, today)).length;
    return {
      id: consultant.id,
      name: consultant.name,
      today: countFor("GUNLUK"),
      week: countFor("HAFTALIK"),
      month: countFor("AYLIK"),
    };
  });
  const dailyPlanItems = todayTasks.slice(0, 4);
  const quickActions = [
    { label: "Lead Ekle", href: "/musteriler", icon: UserPlus, tone: "bg-blue-50 text-blue-600" },
    { label: "Portföy Ekle", href: "/portfoyler/yeni", icon: FolderPlus, tone: "bg-violet-50 text-violet-600" },
    { label: "Görev Oluştur", href: "/gorevler", icon: CheckCircle2, tone: "bg-cyan-50 text-cyan-600" },
    { label: "Randevu Ekle", href: "/takvim", icon: CalendarPlus, tone: "bg-rose-50 text-rose-600" },
  ];
  const fallbackActivities = [
    { id: "activity-new-lead", title: "Yeni lead eklendi", time: "-", icon: UserPlus, tone: "bg-emerald-50 text-emerald-600" },
    { id: "activity-property-updated", title: "Portföy güncellendi", time: "-", icon: FolderPlus, tone: "bg-blue-50 text-blue-600" },
    { id: "activity-task-completed", title: "Görev tamamlandı", time: "-", icon: CheckCircle2, tone: "bg-orange-50 text-orange-600" },
    { id: "activity-appointment-created", title: "Randevu oluşturuldu", time: "-", icon: CalendarPlus, tone: "bg-pink-50 text-pink-600" },
  ];
  const liveActivities = data.activityLogs.slice(0, 4).map((log, index) => {
    const fallback = fallbackActivities[index] ?? fallbackActivities[0];
    return { id: log.id, title: log.action, time: shortDate(log.createdAt), icon: fallback.icon, tone: fallback.tone };
  });
  const activityItems = liveActivities.length ? liveActivities : fallbackActivities;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Metric
          label="Aktif portföy"
          value={scopedProperties.filter((item) => item.status === "AKTIF").length.toString()}
          detail={`${activeSale} satılık · ${activeRent} kiralık`}
          icon={<FolderOpen className="h-4 w-4" />}
          iconClassName="bg-violet-50 text-violet-600"
          progressClassName="bg-violet-400"
          progress={30}
        />
        <Metric
          label="Aktif kiracı"
          value={activeTenants.length.toString()}
          detail="Kiracı var işaretli kayıt"
          icon={<Users className="h-4 w-4" />}
          iconClassName="bg-emerald-50 text-emerald-600"
          progressClassName="bg-emerald-400"
          progress={34}
        />
        <Metric
          label="Yeni lead"
          value={scopedLeads.filter((item) => item.status === "YENI_LEAD").length.toString()}
          detail="İlk temas bekliyor"
          icon={<UserPlus className="h-4 w-4" />}
          iconClassName="bg-blue-50 text-blue-600"
          progressClassName="bg-blue-300"
          progress={28}
        />
        <Metric
          label="Bugünkü görev"
          value={todayTasks.length.toString()}
          detail="Açık operasyon"
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconClassName="bg-orange-50 text-orange-600"
          progressClassName="bg-orange-300"
          progress={28}
        />
        <Metric
          label="Yaklaşan randevu"
          value={appointments.length.toString()}
          detail="Randevu / yer gösterimi"
          icon={<CalendarDays className="h-4 w-4" />}
          iconClassName="bg-pink-50 text-pink-600"
          progressClassName="bg-pink-300"
          progress={31}
        />
        <Metric
          label="Kira hatırlatma"
          value={tenantReminders.length.toString()}
          detail="7/5/3 gün ve çıkış günü"
          icon={<Bell className="h-4 w-4" />}
          iconClassName="bg-cyan-50 text-cyan-600"
          progressClassName="bg-cyan-400"
          progress={29}
        />
      </div>

      <div className={`grid gap-5 ${canSeeOffice(user) ? "xl:grid-cols-[1fr_1fr]" : ""}`}>
          <Card className={`${cardShell} p-5`}>
            <SectionTitle title="Satış / Kiralama Raporu" action={canSeeOffice(user) ? "Ofis geneli" : "Kişisel"} />
            <div className="grid gap-4 md:grid-cols-3">
              {reportRanges.map((report) => (
                <div key={report.range} className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm shadow-blue-950/[0.03]">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-primary">
                      <CalendarDays className="h-4 w-4 stroke-[1.8]" />
                    </span>
                    <p className="text-sm font-semibold text-slate-950">{report.label}</p>
                  </div>
                  <div className="space-y-3 text-sm">
                    <ReportMetricLine label="Satış" value={report.sale.toString()} />
                    <ReportMetricLine label="Kiralama" value={report.rent.toString()} />
                    <ReportMetricLine label="Müşteri" value={report.leads.toString()} />
                    <ReportMetricLine label="Görev" value={report.tasks.toString()} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {canSeeOffice(user) ? (
          <Card className={`${cardShell} overflow-hidden`}>
            <SectionTitle title="Danışman Bazlı Rapor" action="Sadece owner görünümü" padded />
            <div className="px-5 pb-5">
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="bg-slate-50/90 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Danışman</th>
                    <th className="px-5 py-4 font-semibold">Bugün</th>
                    <th className="px-5 py-4 font-semibold">Bu hafta</th>
                    <th className="px-5 py-4 font-semibold">Bu ay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {consultantReportRows.map((row) => (
                    <tr key={row.id} className="bg-white/80 transition hover:bg-blue-50/40">
                      <td className="px-5 py-5 font-medium">{row.name}</td>
                      <td className="px-5 py-5">{row.today}</td>
                      <td className="px-5 py-5">{row.week}</td>
                      <td className="px-5 py-5">{row.month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </Card>
          ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_0.95fr_1.15fr]">
        <Card className={`${cardShell} p-5`}>
          <SectionTitle title="Hızlı İşlemler" />
          <div className="grid gap-3 sm:grid-cols-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-sm font-semibold text-slate-800 shadow-sm shadow-blue-950/[0.03] transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.tone}`}>
                    <Icon className="h-4 w-4 stroke-[1.8]" />
                  </span>
                  {action.label}
                </Link>
              );
            })}
          </div>
        </Card>

        <Card className={`${cardShell} p-5`}>
          <SectionTitle title="Günlük Planım" action={<Link href="/takvim">Tümünü Gör</Link>} />
          {dailyPlanItems.length ? (
            <div className="space-y-3">
              {dailyPlanItems.map((task) => (
                <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
                    <Clock3 className="h-4 w-4 stroke-[1.8]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{task.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{shortDate(task.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <CalendarDays className="h-6 w-6 stroke-[1.6]" />
                </div>
                <p className="mt-3 text-sm text-slate-500">Bugün için planlanmış etkinlik bulunmuyor.</p>
              </div>
            </div>
          )}
        </Card>

        <Card className={`${cardShell} p-5`}>
          <SectionTitle title="Son Aktiviteler" action="Tümünü Gör" />
          <div className="space-y-3">
            {activityItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/80 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                      <Icon className="h-4 w-4 stroke-[1.8]" />
                    </span>
                    <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{item.time}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className={`${cardShell} p-5`}>
          <SectionTitle title="Satış / Kiralama Pipeline" action="Son 6 ay" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly}>
                <defs>
                  <linearGradient id="lead" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#123a6f" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#123a6f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="lead" name="Müşteri" stroke="#0f4c91" fill="url(#lead)" strokeWidth={2} />
                <Area type="monotone" dataKey="aksiyon" name="Aksiyon" stroke="#4da3ff" fill="#e8f3ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className={`${cardShell} p-5`}>
          <SectionTitle title="Portföy Durumu" action="Canlı" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" innerRadius={58} outerRadius={92} paddingAngle={4}>
                  {statusData.map((_, index) => (
                    <Cell key={index} fill={["#0f4c91", "#d1d5db", "#4da3ff", "#2563eb", "#0891b2"][index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-5">
        <Card className={`${cardShell} p-5`}>
          <SectionTitle title="Danışman Performansı" action="Ofis" />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={consultantData}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="portfoy" fill="#0f4c91" radius={[5, 5, 0, 0]} />
                <Bar dataKey="gorev" fill="#8ebeff" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-5">
        <Card className={`${cardShell} overflow-hidden`}>
          <SectionTitle title={canSeeOffice(user) ? "Premium Portföy Akışı" : "Atanmış Portföylerim"} action={<Link href="/portfoyler">Tümünü Gör</Link>} padded />
          <div className="divide-y divide-border">
            {scopedProperties.slice(0, 5).map((property) => (
              <PropertyRow key={property.id} property={property} consultant={data.users.find((item) => item.id === property.consultantId)} />
            ))}
            {!scopedProperties.length ? (
              <EmptyState
                title="Henüz portföy yok"
                description={canCreatePortfolio(user) ? "İlk portföyü Sahibinden linkiyle veya manuel formdan ekleyebilirsin." : "Danışman portföy eklediğinde ofis akışı burada görünür."}
              />
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  iconClassName = "bg-blue-50 text-primary",
  progressClassName = "bg-primary",
  progress = 30,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  progressClassName?: string;
  progress?: number;
}) {
  return (
    <Card className="min-h-[170px] rounded-[22px] border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        {icon ? <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`}>{icon}</span> : null}
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-slate-500">{detail}</p>
      <div className="mt-5 h-1.5 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${progressClassName}`} style={{ width: `${progress}%` }} />
      </div>
    </Card>
  );
}

function ReportMetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="flex-1 border-b border-slate-200/80" />
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function SectionTitle({ title, action, padded }: { title: string; action?: React.ReactNode; padded?: boolean }) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 ${padded ? "border-b border-slate-200/70 px-5 py-4" : ""}`}>
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {action ? (
        <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm shadow-blue-950/[0.03]">
          {action}
        </div>
      ) : null}
    </div>
  );
}

function PropertyRow({ property, consultant }: { property: Property; consultant?: User }) {
  return (
    <Link href={`/portfoyler/${property.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-muted/60">
      <RemoteImage src={property.coverImage} alt={property.title} className="h-16 w-20 shrink-0 rounded-md object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{property.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {property.neighborhood}, {property.district} · {property.squareMeters} m² · {consultant?.name}
        </p>
      </div>
      <div className="hidden text-right md:block">
        <p className="text-sm font-semibold">{money(property.price, property.currency)}</p>
        <Badge label={property.status} className="mt-2" />
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function PropertiesPage({ user }: { user: User }) {
  const { data, deleteProperty, updateProperty, syncSahibindenDemoListings } = useCrm();
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("TUMU");
  const [consultantFilter, setConsultantFilter] = useState("TUMU");
  const [locationFilter, setLocationFilter] = useState("TUMU");
  const [typeFilter, setTypeFilter] = useState("TUMU");
  const consultants = useMemo(() => data.users.filter((item) => item.role === "CONSULTANT"), [data.users]);
  const locations = useMemo(() => Array.from(new Set(data.properties.map((item) => `${item.neighborhood}, ${item.district}`))).sort(), [data.properties]);
  const officeScope = canSeeOffice(user);
  const visibleProperties = useMemo(() => data.properties.filter((property) => {
    const roleMatch = officeScope || property.consultantId === user.id;
    const queryMatch = `${property.title} ${property.district} ${property.neighborhood}`.toLowerCase().includes(query.toLowerCase());
    const statusMatch = status === "TUMU" || property.status === status;
    const consultantMatch = consultantFilter === "TUMU" || property.consultantId === consultantFilter;
    const locationMatch = locationFilter === "TUMU" || `${property.neighborhood}, ${property.district}` === locationFilter;
    const typeMatch = typeFilter === "TUMU" || property.listingType === typeFilter;
    return roleMatch && queryMatch && statusMatch && consultantMatch && locationMatch && typeMatch;
  }), [consultantFilter, data.properties, locationFilter, officeScope, query, status, typeFilter, user.id]);

  return (
    <div className="space-y-5">
      <Toolbar>
        <div className="relative w-full md:min-w-[300px] md:flex-[1_1_340px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Portföy, lokasyon veya proje ara" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Select className="w-full md:w-44" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="TUMU">Durum: Tümü</option>
          {statusOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select className="w-full md:w-40" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="TUMU">Tip: Tümü</option>
          <option value="SATILIK">Satılık</option>
          <option value="KIRALIK">Kiralık</option>
        </Select>
        <Select className="w-full md:w-52" value={consultantFilter} onChange={(event) => setConsultantFilter(event.target.value)}>
          <option value="TUMU">Danışman: Tümü</option>
          {consultants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select className="w-full md:w-52" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
          <option value="TUMU">Lokasyon: Tümü</option>
          {locations.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        {canCreatePortfolio(user) ? (
          <>
            <Button
              variant="outline"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  await syncSahibindenDemoListings();
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Demo Kaynakları Senkronize Et
            </Button>
            <Link href="/portfoyler/yeni">
              <Button>
                <Plus className="h-4 w-4" />
                Portföy Ekle
              </Button>
            </Link>
          </>
        ) : (
          <div className="w-full rounded-md border border-blue-100 bg-[#f7fbff] px-3 py-2 text-sm text-muted-foreground md:flex-[1_1_280px]">
            Portföy girişi danışman ekranından yapılır; bu ekran ofis takibi içindir.
          </div>
        )}
      </Toolbar>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1220px] border-collapse">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Portföy</th>
                <th className="px-5 py-3 font-semibold">Tip</th>
                <th className="px-5 py-3 font-semibold">Fiyat</th>
                <th className="px-5 py-3 font-semibold">Lokasyon</th>
                <th className="px-5 py-3 font-semibold">Danışman</th>
                <th className="px-5 py-3 font-semibold">Kaynak</th>
                <th className="px-5 py-3 font-semibold">Son Güncelleme</th>
                <th className="px-5 py-3 font-semibold">Durum</th>
                <th className="px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {visibleProperties.map((property) => (
                <tr key={property.id} className="bg-white transition hover:bg-[#f3f8ff]">
                  <td className="px-5 py-4">
                    <PropertyMini property={property} />
                  </td>
                  <td className="px-5 py-4">
                    <Badge label={property.listingType} />
                  </td>
                  <td className="px-5 py-4 font-medium">{money(property.price, property.currency)}</td>
                  <td className="px-5 py-4">{property.neighborhood}, {property.district}</td>
                  <td className="px-5 py-4">{data.users.find((item) => item.id === property.consultantId)?.name ?? "Atanmadı"}</td>
                  <td className="px-5 py-4">
                    {property.sourceUrl || property.listingUrl ? (
                      <a className="inline-flex items-center gap-1 text-xs font-medium text-primary" href={property.sourceUrl || property.listingUrl} target="_blank" rel="noreferrer">
                        {property.sourcePlatform ?? "Link"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Manuel</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{shortDate(property.syncedAt ?? property.createdAt)}</td>
                  <td className="px-5 py-4">
                    <Badge label={property.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {canManagePortfolio(user, property) ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => updateProperty(property.id, { status: property.status === "AKTIF" ? "OPSIYONLU" : "AKTIF" })}>
                            Durum
                          </Button>
                          <Link className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium" href={`/portfoyler/${property.id}/duzenle`}>
                            Düzenle
                          </Link>
                        <Button variant="ghost" size="icon" onClick={() => deleteProperty(property.id)}>
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                        </>
                      ) : (
                        <Link className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium" href={`/portfoyler/${property.id}`}>
                          İncele
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleProperties.length ? (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-muted-foreground" colSpan={9}>
                    {canCreatePortfolio(user)
                      ? "Henüz portföy yok. Tek giriş noktası Portföy Ekle sayfası; Sahibinden linkini de orada ekleyebilirsin."
                      : "Henüz portföy yok. Danışman portföy eklediğinde owner panelinde takip edebilirsin."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PropertyMini({ property }: { property: Property }) {
  const sourceHref = property.sourceUrl || property.listingUrl;
  const content = (
    <>
      <RemoteImage src={property.coverImage} alt={property.title} className="h-12 w-16 rounded-md object-cover" />
      <div>
        <p className="font-medium">{property.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{property.rooms} · {property.squareMeters} m²</p>
      </div>
    </>
  );

  if (sourceHref) {
    return (
      <a href={sourceHref} target="_blank" rel="noreferrer" className="flex items-center gap-3">
        {content}
      </a>
    );
  }

  return (
    <Link href={`/portfoyler/${property.id}`} className="flex items-center gap-3">
      {content}
    </Link>
  );
}

function RemoteImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" />;
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-3 md:flex-row md:flex-wrap md:items-center">{children}</div>;
}

function PropertyDetail({ user, propertyId }: { user: User; propertyId: string }) {
  const { data, updateProperty } = useCrm();
  const property = data.properties.find((item) => item.id === propertyId);
  const report = data.reports.find((item) => item.propertyId === propertyId);
  const history = data.priceHistory.filter((item) => item.propertyId === propertyId).map((item) => ({ date: shortDate(item.date), price: item.price }));
  const comparables = data.comparables.filter((item) => item.propertyId === propertyId);
  const propertyTasks = data.tasks.filter((item) => item.propertyId === propertyId);
  const propertyDocs = data.documents.filter((item) => item.relatedType === "PROPERTY" && item.relatedId === propertyId);

  if (!property) return <Card className="p-8">Portföy bulunamadı.</Card>;
  if (!canSeeOffice(user) && property.consultantId !== user.id) return <AccessDenied />;
  const interestedLeads = data.leads.filter((lead) => lead.interestedPropertyIds?.includes(propertyId) || lead.interest.toLocaleLowerCase("tr").includes(property.neighborhood.toLocaleLowerCase("tr")));

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.75fr]">
      <div className="space-y-5">
        <Card className="overflow-hidden">
          <div className="relative h-80 w-full">
            <RemoteImage src={property.coverImage} alt={property.title} className="h-full w-full object-cover" />
          </div>
          <div className="p-5">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <Badge label={property.status} />
                <h2 className="mt-3 text-2xl font-semibold">{property.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {property.neighborhood}, {property.district} · {property.rooms} · {property.squareMeters} m²
                </p>
              </div>
              <p className="text-2xl font-semibold text-primary">{money(property.price, property.currency)}</p>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-600">{property.description}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <InfoBox label="İşlem tipi" value={property.listingType} />
              <InfoBox label="Atanan danışman" value={data.users.find((item) => item.id === property.consultantId)?.name ?? "Atanmadı"} />
              <InfoBox label="Son güncelleme" value={shortDate(property.syncedAt ?? property.createdAt)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {property.features.map((feature) => (
                <span key={feature} className="rounded-full bg-[#e8f3ff] px-3 py-1 text-xs font-medium text-primary">
                  {feature}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {canManagePortfolio(user, property) ? (
                <>
                  <Link href={`/portfoyler/${property.id}/duzenle`}>
                    <Button>Düzenle</Button>
                  </Link>
                  <Button variant="outline" onClick={() => updateProperty(property.id, { status: "SATILDI" })}>
                    Satıldı İşaretle
                  </Button>
                </>
              ) : (
                <Badge label="Ofis takip modu" />
              )}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Fotoğraflar" />
          <div className="grid gap-3 sm:grid-cols-3">
            {(property.gallery.length ? property.gallery : [property.coverImage]).map((image, index) => (
              <div key={`${image}-${index}`} className="h-32 overflow-hidden rounded-md border border-border">
                <RemoteImage src={image} alt={`${property.title} fotoğraf ${index + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Notlar" />
          <div className="space-y-2 text-sm text-muted-foreground">
            {(property.notes ?? ["Malik ile fiyat bandı teyit edilecek.", "İlan metni ve kaynak linkleri güncel tutulacak."]).map((note) => (
              <p key={note} className="rounded-md border border-border bg-white px-3 py-2">{note}</p>
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card className="p-5">
          <SectionTitle title="Malik Bilgisi" />
          <div className="space-y-3 text-sm">
            <InfoRow label="Malik" value={property.ownerName ?? "Malik bilgisi bekleniyor"} />
            <InfoRow label="Telefon" value={property.ownerPhone ?? "+90 5xx xxx xx xx"} />
            <InfoRow label="Yetki durumu" value={propertyDocs.some((item) => item.type === "YETKI_BELGESI" && item.status === "TAMAM") ? "Tamam" : "Takipte"} />
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Piyasa Özeti" />
          {report ? (
            <div className="space-y-3 text-sm">
              <InfoRow label="Ortalama fiyat" value={money(report.averagePrice, property.currency)} />
              <InfoRow label="Önerilen aralık" value={`${money(report.suggestedMin, property.currency)} - ${money(report.suggestedMax, property.currency)}`} />
              <InfoRow label="Emsal kayıt" value={report.competitorCount.toString()} />
              <InfoRow label="Pozisyon" value={report.pricePosition} />
              <p className="rounded-md bg-[#e8f3ff] p-3 text-slate-700">{report.consultantComment}</p>
            </div>
          ) : null}
        </Card>
        <Card className="p-5">
          <SectionTitle title="Kaynak Bilgisi" />
          <div className="space-y-3 text-sm">
            <InfoRow label="Kaynak" value={property.sourcePlatform ?? "Manuel"} />
            <InfoRow label="Kaynak tipi" value={sourceTypeLabel(property.sourceType)} />
            <InfoRow label="Senkronizasyon" value={property.syncedAt ? shortDate(property.syncedAt) : "Manuel kayıt"} />
            <InfoRow label="Durum" value={property.syncStatus ?? "MANUAL"} />
            {property.sourceUrl || property.listingUrl ? (
              <a
                className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={property.sourceUrl || property.listingUrl}
                target="_blank"
                rel="noreferrer"
              >
                İlan linkini aç
              </a>
            ) : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Dokümanlar" />
          <div className="space-y-2">
            {propertyDocs.map((doc) => (
              <div key={doc.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{doc.title}</p>
                  <Badge label={doc.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{humanize(doc.type)} · {shortDate(doc.uploadedAt)}</p>
              </div>
            ))}
            {!propertyDocs.length ? <p className="text-sm text-muted-foreground">Bu portföye bağlı doküman yok.</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Bağlı Görevler" />
          <div className="space-y-2">
            {propertyTasks.map((task) => (
              <div key={task.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{task.title}</p>
                  <Badge label={task.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{humanize(task.type)} · {data.users.find((item) => item.id === task.assignedToId)?.name ?? "Atanmadı"}</p>
              </div>
            ))}
            {!propertyTasks.length ? <p className="text-sm text-muted-foreground">Bu portföye bağlı görev yok.</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="İlgilenen Müşteriler" />
          <div className="space-y-2">
            {interestedLeads.slice(0, 4).map((lead) => (
              <Link key={lead.id} href={`/musteriler/${lead.id}`} className="block rounded-md border border-border p-3 text-sm hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{lead.name}</p>
                  <Badge label={lead.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{lead.phone} · {lead.interest}</p>
              </Link>
            ))}
            {!interestedLeads.length ? <p className="text-sm text-muted-foreground">Henüz ilgili müşteri yok.</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Fiyat Geçmişi" />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="price" fill="#0f4c91" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Emsal Kayıtlar" />
          <div className="space-y-2">
            {comparables.map((item) => (
              <div key={item.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{item.source}</p>
                  <p>{money(item.price, property.currency)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.squareMeters} m² · {item.status}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-slate-50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function sourceTypeLabel(sourceType?: Property["sourceType"]) {
  if (sourceType === "OWN_LISTING") return "Kurumsal mağaza";
  if (sourceType === "AUTHORIZED_PORTFOLIO") return "Yetkili portföy";
  return "Manuel";
}

function PropertyEditor({ user, propertyId }: { user: User; propertyId?: string }) {
  const router = useRouter();
  const { data, addProperty, updateProperty } = useCrm();
  const property = data.properties.find((item) => item.id === propertyId);
  const consultants = data.users.filter((item) => item.role === "CONSULTANT");
  const defaultConsultantId = property?.consultantId ?? user.id;
  const [entryMode, setEntryMode] = useState<"link" | "manual">(property?.sourceType === "MANUAL" ? "manual" : "link");
  const form = useForm({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      title: property?.title ?? "",
      listingType: property?.listingType ?? "KIRALIK",
      price: property?.price ?? 0,
      currency: property?.currency ?? "TRY",
      district: property?.district ?? "",
      neighborhood: property?.neighborhood ?? "",
      squareMeters: property?.squareMeters ?? 0,
      rooms: property?.rooms ?? "",
      consultantId: defaultConsultantId,
      status: property?.status ?? "AKTIF",
      listingUrl: property?.listingUrl ?? "",
      sourcePlatform: property?.sourcePlatform ?? "Sahibinden",
      sourceUrl: property?.sourceUrl ?? property?.listingUrl ?? "",
      sourceType: property?.sourceType ?? "AUTHORIZED_PORTFOLIO",
    },
  });
  const sourcePlatform = form.watch("sourcePlatform");
  const sourceUrl = form.watch("sourceUrl");
  const titleValue = form.watch("title");
  const districtValue = form.watch("district");
  const neighborhoodValue = form.watch("neighborhood");
  const roomsValue = form.watch("rooms");
  const priceValue = Number(form.watch("price"));
  const squareMetersValue = Number(form.watch("squareMeters"));
  const isManual = entryMode === "manual";
  const [sourcePreview, setSourcePreview] = useState<ListingPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "empty">("idle");
  const manualReady = Boolean(
    titleValue?.trim() &&
    districtValue?.trim() &&
    neighborhoodValue?.trim() &&
    roomsValue?.trim() &&
    priceValue > 0 &&
    squareMetersValue >= 20,
  );

  useEffect(() => {
    if (entryMode === "manual") {
      form.setValue("sourcePlatform", "Manuel");
      form.setValue("sourceType", "MANUAL");
      setSourcePreview(null);
      setPreviewStatus("idle");
      return;
    }
    if (form.getValues("sourcePlatform") === "Manuel") form.setValue("sourcePlatform", "Sahibinden");
    if (form.getValues("sourceType") === "MANUAL") form.setValue("sourceType", "AUTHORIZED_PORTFOLIO");
  }, [entryMode, form]);

  useEffect(() => {
    const trimmedUrl = sourceUrl?.trim() ?? "";
    if (isManual || !trimmedUrl || !/^https?:\/\//i.test(trimmedUrl)) {
      setSourcePreview(null);
      setPreviewStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setPreviewStatus("loading");
        const params = new URLSearchParams({ url: trimmedUrl, platform: sourcePlatform ?? "" });
        const response = await fetch(`/api/listing-preview?${params.toString()}`, { signal: controller.signal });
        const result = await response.json() as { preview: ListingPreview | null };
        setSourcePreview(result.preview);
        setPreviewStatus(result.preview ? "ready" : "empty");
        if (result.preview) {
          form.setValue("title", result.preview.title);
          form.setValue("listingType", result.preview.listingType);
          form.setValue("price", result.preview.price);
          form.setValue("currency", result.preview.currency);
          form.setValue("district", result.preview.district);
          form.setValue("neighborhood", result.preview.neighborhood);
          form.setValue("squareMeters", result.preview.squareMeters);
          form.setValue("rooms", result.preview.rooms);
          form.setValue("listingUrl", result.preview.sourceUrl);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSourcePreview(null);
          setPreviewStatus("empty");
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [form, isManual, sourcePlatform, sourceUrl]);

  if (propertyId && !property) return <Card className="p-8">Portföy bulunamadı.</Card>;
  if (!canManagePortfolio(user, property)) return <AccessDenied />;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-blue-100 bg-gradient-to-br from-white via-[#f8fbff] to-[#eef6ff] p-5">
        <SectionTitle title={property ? "Portföy Düzenle" : "Portföy Ekle"} action="Tek giriş noktası" />
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setEntryMode("link")}
            className={`rounded-2xl border p-4 text-left transition ${entryMode === "link" ? "border-primary bg-white shadow-lg shadow-blue-950/10" : "border-blue-100 bg-white/70 hover:bg-white"}`}
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-primary">
              <ExternalLink className="h-4 w-4" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-950">İlan linki ile ekle</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Sahibinden, Emlakjet, Hürriyet Emlak veya Hepsiemlak linkini yapıştır; sistem bilgileri ön izleme olarak hazırlar.</p>
          </button>
          <button
            type="button"
            onClick={() => setEntryMode("manual")}
            className={`rounded-2xl border p-4 text-left transition ${entryMode === "manual" ? "border-primary bg-white shadow-lg shadow-blue-950/10" : "border-blue-100 bg-white/70 hover:bg-white"}`}
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <FolderPlus className="h-4 w-4" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-950">Manuel detay gir</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Linkten veri alınamazsa başlık, fiyat, lokasyon ve m² bilgilerini danışman elle doldurur.</p>
          </button>
        </div>
      </div>
      <form
        className="grid gap-4 p-5 md:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          const sourceUrl = values.sourceUrl || values.listingUrl || "";
          if (!isManual && !sourceUrl.trim()) {
            toast.error("Linkli portföy için ilan linki girmelisin.");
            return;
          }
          if (!isManual && !sourcePreview) {
            toast.error("İlan ön izlemesi alınmadan portföy kaydedilemez. Linki kontrol et veya manuel giriş seç.");
            return;
          }
          if (isManual && !manualReady) {
            toast.error("Manuel portföy için başlık, fiyat, m², ilçe, mahalle ve oda bilgisi gerekli.");
            return;
          }
          const title = isManual ? values.title : sourcePreview?.title ?? `${values.sourcePlatform} kaynaklı portföy`;
          const payload = {
            ...values,
            ...(sourcePreview ? {
              title: sourcePreview.title,
              listingType: sourcePreview.listingType,
              price: sourcePreview.price,
              currency: sourcePreview.currency,
              city: sourcePreview.city,
              district: sourcePreview.district,
              neighborhood: sourcePreview.neighborhood,
              projectName: sourcePreview.projectName,
              squareMeters: sourcePreview.squareMeters,
              rooms: sourcePreview.rooms,
              floor: sourcePreview.floor,
              buildingAge: sourcePreview.buildingAge,
              furnished: sourcePreview.furnished,
              description: sourcePreview.description,
              features: sourcePreview.features,
              coverImage: sourcePreview.coverImage,
              gallery: sourcePreview.gallery,
              videoUrl: sourcePreview.videoUrl,
              externalId: sourcePreview.externalId,
              sourcePlatform: sourcePreview.sourcePlatform,
              sourceUrl: sourcePreview.sourceUrl,
              listingUrl: sourcePreview.sourceUrl,
              sourceType: sourcePreview.sourceType,
              syncedAt: new Date().toISOString(),
            } : {}),
            title: title.trim(),
            listingUrl: isManual ? values.listingUrl ?? "" : sourcePreview?.sourceUrl ?? sourceUrl,
            sourceUrl: isManual ? values.listingUrl ?? "" : sourcePreview?.sourceUrl ?? sourceUrl,
            sourcePlatform: isManual ? "Manuel" : sourcePreview?.sourcePlatform ?? values.sourcePlatform,
            syncStatus: "MANUAL" as const,
            sourceType: isManual ? "MANUAL" as const : sourcePreview?.sourceType ?? values.sourceType,
          };
          if (property) {
            updateProperty(property.id, payload as Partial<Property>);
            router.push(`/portfoyler/${property.id}`);
          } else {
            const id = addProperty(payload as Parameters<typeof addProperty>[0]);
            if (id) router.push(`/portfoyler/${id}`);
          }
        })}
      >
        {!isManual ? (
          <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-[#f3f8ff] p-4">
            <p className="text-sm font-semibold text-primary">İlan kaynağı</p>
            <p className="mt-1 text-sm text-muted-foreground">Danışman sadece ilan linkini yapıştırır. Ön izleme gelmeden kayıt açılmaz; böylece boş portföy oluşmaz.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_220px]">
              <Select {...form.register("sourcePlatform")}>
                <option value="Sahibinden">Sahibinden</option>
                <option value="Emlakjet">Emlakjet</option>
                <option value="Hürriyet Emlak">Hürriyet Emlak</option>
                <option value="Hepsiemlak">Hepsiemlak</option>
              </Select>
              <Input placeholder="İlan linkini buraya yapıştır" {...form.register("sourceUrl")} />
              <Select {...form.register("sourceType")}>
                <option value="AUTHORIZED_PORTFOLIO">Yetkili portföy</option>
                <option value="OWN_LISTING">Kurumsal mağaza</option>
              </Select>
            </div>
            <div className="mt-3 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-muted-foreground">
              Görseller için önce sayfanın izin verdiği meta/ilan görselleri denenir. Sahibinden izin vermezse bypass yapılmaz; görsel resmi API veya manuel yükleme ile tamamlanır.
              {sourceUrl ? <span className="ml-1 text-primary">Link hazır.</span> : null}
            </div>
            {previewStatus === "loading" ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-white p-4 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                İlan ön izlemesi hazırlanıyor
              </div>
            ) : null}
            {sourcePreview ? <ListingPreviewCard preview={sourcePreview} /> : null}
            {previewStatus === "empty" ? (
              <div className="mt-3 rounded-lg border border-amber-100 bg-white p-4 text-sm text-muted-foreground">
                Bu linkten ön izleme alınamadı. İlan sitesi görsel/bilgi erişimini kapatmış olabilir; manuel detay gir moduyla kaydı açabilirsin.
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
              <p className="text-sm font-semibold text-slate-950">Manuel detay paneli</p>
              <p className="mt-1 text-sm text-muted-foreground">Bu alan sadece linkten veri alınamadığında kullanılır. Eksik bırakılırsa portföy kaydedilmez.</p>
            </div>
            <Field label="Başlık" error={form.formState.errors.title?.message}><Input {...form.register("title")} /></Field>
            <Field label="Satılık / Kiralık"><Select {...form.register("listingType")}><option value="SATILIK">SATILIK</option><option value="KIRALIK">KIRALIK</option></Select></Field>
            <Field label="Fiyat" error={form.formState.errors.price?.message}><Input type="number" {...form.register("price")} /></Field>
            <Field label="Para birimi"><Select {...form.register("currency")}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option></Select></Field>
            <Field label="İlçe" error={form.formState.errors.district?.message}><Input {...form.register("district")} /></Field>
            <Field label="Mahalle" error={form.formState.errors.neighborhood?.message}><Input {...form.register("neighborhood")} /></Field>
            <Field label="Metrekare" error={form.formState.errors.squareMeters?.message}><Input type="number" {...form.register("squareMeters")} /></Field>
            <Field label="Oda sayısı"><Input {...form.register("rooms")} /></Field>
          </>
        )}
        <input type="hidden" {...form.register("consultantId")} />
        <Field label="Danışman">
          <InfoBox label="Portföy sahibi" value={consultants.find((item) => item.id === defaultConsultantId)?.name ?? user.name} />
        </Field>
        <Field label="Durum"><Select {...form.register("status")}>{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
        <div className="md:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/portfoyler")}>Vazgeç</Button>
          <Button type="submit" disabled={isManual ? !manualReady : (!sourceUrl?.trim() || !sourcePreview || previewStatus === "loading")}>Kaydet</Button>
        </div>
      </form>
    </Card>
  );
}

function ListingPreviewCard({ preview }: { preview: ListingPreview }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        <div className="h-44 md:h-full">
          <RemoteImage src={preview.coverImage} alt={preview.title} className="h-full w-full object-cover" />
        </div>
        <div className="p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge label={preview.sourcePlatform} />
                <Badge label={preview.confidence === "KNOWN_LISTING" ? "Ön izleme hazır" : "Canlı ön izleme"} />
              </div>
              <p className="mt-3 text-base font-semibold text-slate-950">{preview.title}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">İlan No: {preview.externalId}</p>
              <p className="mt-1 text-sm text-muted-foreground">{preview.neighborhood}, {preview.district} · {preview.rooms} · {preview.squareMeters} m²</p>
            </div>
            <p className="text-lg font-semibold text-primary">{money(preview.price, preview.currency)}</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <InfoBox label="İşlem" value={preview.listingType === "KIRALIK" ? "Kiralık" : "Satılık"} />
            <InfoBox label="Proje" value={preview.projectName} />
            <InfoBox label="Kat" value={preview.floor} />
            <InfoBox label="Eşyalı" value={preview.furnished ? "Evet" : "Hayır"} />
          </div>
          <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{preview.description}</p>
          <div className="mt-4 flex gap-2 overflow-hidden">
            {preview.gallery.slice(0, 4).map((image, index) => (
              <div key={`${image}-${index}`} className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-border">
                <RemoteImage src={image} alt={`${preview.title} fotoğraf ${index + 1}`} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

type LeadImportPayload = Omit<Lead, "id" | "createdAt" | "status" | "notes"> & { notes?: string };

const istanbulDistrictOptions = [
  "Adalar",
  "Arnavutköy",
  "Ataşehir",
  "Avcılar",
  "Bağcılar",
  "Bahçelievler",
  "Bakırköy",
  "Başakşehir",
  "Bayrampaşa",
  "Beşiktaş",
  "Beykoz",
  "Beylikdüzü",
  "Beyoğlu",
  "Büyükçekmece",
  "Çatalca",
  "Çekmeköy",
  "Esenler",
  "Esenyurt",
  "Eyüpsultan",
  "Fatih",
  "Gaziosmanpaşa",
  "Güngören",
  "Kadıköy",
  "Kağıthane",
  "Kartal",
  "Küçükçekmece",
  "Maltepe",
  "Pendik",
  "Sancaktepe",
  "Sarıyer",
  "Silivri",
  "Sultanbeyli",
  "Sultangazi",
  "Şile",
  "Şişli",
  "Tuzla",
  "Ümraniye",
  "Üsküdar",
  "Zeytinburnu",
  "Akatlar",
  "Bebek",
  "Bomonti",
  "Caddebostan",
  "Cihangir",
  "Etiler",
  "Fenerbahçe",
  "Galata",
  "Karaköy",
  "Levent",
  "Maslak",
  "Moda",
  "Nişantaşı",
  "Ortaköy",
  "Suadiye",
  "Tarabya",
  "Ulus",
  "Yeniköy",
];

function parseDelimitedRows(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  return lines.map((line) => splitDelimitedLine(line, delimiter));
}

function parseLeadImport(text: string, consultantId: string): LeadImportPayload[] {
  return parseLeadRows(parseDelimitedRows(text), consultantId);
}

function parseLeadRows(rows: unknown[][], consultantId: string): LeadImportPayload[] {
  if (!rows.length) return [];
  const knownHeaders = [
    "ad",
    "adsoyad",
    "adsoyadi",
    "adres",
    "address",
    "bolge",
    "client",
    "clientname",
    "clienttype",
    "comment",
    "comments",
    "customer",
    "customername",
    "customertype",
    "email",
    "eposta",
    "evsahibi",
    "fullname",
    "gsm",
    "aboneno",
    "accountid",
    "accountno",
    "id",
    "isim",
    "kayitno",
    "kaynak",
    "mail",
    "malik",
    "mobile",
    "mulksahibi",
    "musteri",
    "musteriid",
    "musterino",
    "musteritipi",
    "musterituru",
    "not",
    "notlar",
    "notes",
    "owner",
    "phoneno",
    "phone",
    "propertyowner",
    "remark",
    "remarks",
    "semt",
    "source",
    "telefon",
    "telephone",
    "type",
  ];
  const knownHeaderSet = new Set(knownHeaders);
  const requiredHeaderSet = new Set(["id", "adres", "address", "mulksahibi", "propertyowner", "notes", "notlar"]);
  const headerCandidates = rows.slice(0, 30).map((row, index) => {
    const normalized = row.map(normalizeHeader);
    const knownCount = normalized.filter((cell) => knownHeaderSet.has(cell)).length;
    const requiredCount = normalized.filter((cell) => requiredHeaderSet.has(cell)).length;
    return { index, normalized, score: knownCount + requiredCount * 2 };
  });
  const bestHeader = headerCandidates.reduce((best, item) => (item.score > best.score ? item : best), { index: 0, normalized: rows[0].map(normalizeHeader), score: 0 });
  const hasHeader = bestHeader.score >= 3;
  const header = hasHeader ? bestHeader.normalized : rows[0].map(normalizeHeader);
  const bodyRows = hasHeader ? rows.slice(bestHeader.index + 1) : rows;
  const findIndex = (keys: string[]) => keys.map((key) => header.indexOf(key)).find((index) => index !== -1) ?? -1;
  const indexMap = {
    name: hasHeader ? findIndex(["adsoyad", "adsoyadi", "ad", "musteri", "isim", "name", "fullname", "customer", "customername", "client", "clientname"]) : 0,
    phone: hasHeader ? findIndex(["telefon", "phone", "gsm", "tel", "telephone", "mobile", "cell", "cep", "ceptelefonu"]) : 1,
    email: hasHeader ? findIndex(["email", "eposta", "mail", "emailaddress"]) : 2,
    source: hasHeader ? findIndex(["kaynak", "source", "leadsource"]) : 3,
    budget: hasHeader ? findIndex(["butce", "budget", "bütçe"]) : 4,
    interest: hasHeader ? findIndex(["ilgi", "interest", "talep", "request", "requirement", "want", "need", "not"]) : 5,
    notes: hasHeader ? findIndex(["notlar", "not", "notes", "note", "aciklama", "aciklamalar", "comment", "comments", "remark", "remarks"]) : 6,
    externalId: hasHeader ? findIndex(["id", "aboneno", "accountid", "accountno", "musteriid", "musterino", "kayitno", "recordid", "customerid", "clientid"]) : 7,
    address: hasHeader ? findIndex(["adres", "address", "lokasyon", "konum", "location", "fulladdress"]) : 8,
    district: hasHeader ? findIndex(["semt", "bolge", "mahalle", "ilce", "district", "neighborhood", "area", "region"]) : 11,
    propertyOwner: hasHeader ? findIndex(["mulksahibi", "malik", "propertyowner", "owner", "evsahibi", "landlord"]) : 9,
    customerType: hasHeader ? findIndex(["musteritipi", "tip", "tur", "type", "musterituru", "customertype", "clienttype"]) : 10,
  };

  const importedLeads = bodyRows
    .map<LeadImportPayload | null>((row, index) => {
      const propertyOwnerCell = valueAt(row, indexMap.propertyOwner);
      const propertyOwnerPhone = extractPhone(propertyOwnerCell) || extractPhone(valueAt(row, indexMap.phone));
      const propertyOwner = cleanContactName(propertyOwnerCell);
      const externalId = cleanNumericId(valueAt(row, indexMap.externalId));
      const address = valueAt(row, indexMap.address);
      const notes = valueAt(row, indexMap.notes);
      const district = valueAt(row, indexMap.district) || extractDistrictFromAddress(address);
      const rawName = valueAt(row, indexMap.name);
      const customerType = "MULK_SAHIBI" as const;
      const hasRecordSignal = Boolean((externalId || address || propertyOwner) && (address || propertyOwner || propertyOwnerPhone));
      if (!hasRecordSignal) return null;
      const name = rawName || propertyOwner || (externalId ? `ID ${externalId}` : "") || address || `Kayıt ${index + 1}`;
      return {
        name,
        externalId,
        phone: propertyOwnerPhone,
        email: valueAt(row, indexMap.email),
        source: valueAt(row, indexMap.source) || "Excel aktarımı",
        budget: parseBudget(valueAt(row, indexMap.budget)),
        interest: valueAt(row, indexMap.interest) || address || notes || "Genel müşteri kaydı",
        address,
        propertyOwner,
        propertyOwnerPhone,
        customerType,
        tenantStatus: "BILINMIYOR",
        preferredLocation: district,
        notes,
        consultantId,
      };
    })
    .filter((lead): lead is LeadImportPayload => Boolean(lead && lead.name.trim()));

  return importedLeads;
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").toLocaleLowerCase("tr").replace(/[ğ]/g, "g").replace(/[ü]/g, "u").replace(/[ş]/g, "s").replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ç]/g, "c").replace(/[^a-z0-9]/g, "");
}

function extractDistrictFromAddress(address?: string) {
  const normalizedAddress = normalizeHeader(address ?? "");
  return istanbulDistrictOptions.find((district) => normalizedAddress.includes(normalizeHeader(district))) ?? "";
}

function valueAt(row: unknown[], index: number) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function cleanNumericId(value: unknown) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits;
}

function parseBudget(value: unknown) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function extractPhone(value: unknown) {
  const match = String(value ?? "").match(/(?:\+?90\s*)?(?:0\s*)?5\d(?:[\s().-]*\d){8}|\d(?:[\s().-]*\d){9,10}/);
  return match ? match[0].replace(/[^\d+]/g, "") : "";
}

function cleanContactName(value: unknown) {
  return String(value ?? "").replace(/(?:\+?90\s*)?(?:0\s*)?5\d(?:[\s().-]*\d){8}|\d(?:[\s().-]*\d){9,10}/g, "").replace(/\s+/g, " ").trim();
}

function tenantSummary(lead: Lead) {
  if (lead.tenantStatus === "VAR") return lead.tenantName ? `Var: ${lead.tenantName}` : "Var";
  if (lead.tenantStatus === "YOK") return "Yok";
  return "Belirtilmedi";
}

function displayLeadDate(value?: string) {
  return value ? shortDate(value) : "Tarih yok";
}

function displayLeadId(lead: Pick<Lead, "id" | "externalId">) {
  if (lead.externalId?.trim()) return lead.externalId.trim();
  const importMatch = lead.id.match(/^lead-import-\d+-(.+)$/);
  if (importMatch?.[1]) return importMatch[1];
  const leadMatch = lead.id.match(/^lead-(.+)$/);
  return leadMatch?.[1] ?? lead.id;
}

function exportLeadsToExcel(leads: Lead[], users: User[]) {
  if (!leads.length) {
    toast.error("Dışa aktarılacak müşteri bulunamadı");
    return;
  }

  const headers = ["ID", "Mülk Sahibi", "Telefon", "Adres", "Semt", "Kiracı Bilgisi", "Kiracı Adı", "Giriş Tarihi", "Çıkış Tarihi", "Kiracı Notu", "Danışman", "Durum", "Notlar"];
  const rows = leads.map((lead) => [
    displayLeadId(lead),
    lead.propertyOwner || lead.name || "",
    lead.propertyOwnerPhone || lead.phone || "",
    lead.address || "",
    lead.preferredLocation || extractDistrictFromAddress(lead.address) || "",
    tenantSummary(lead),
    lead.tenantName || "",
    lead.tenantMoveIn || "",
    lead.tenantMoveOut || "",
    lead.tenantNotes || "",
    users.find((item) => item.id === lead.consultantId)?.name ?? "",
    humanize(lead.status),
    lead.notes || "",
  ]);
  const tableRows = [headers, ...rows]
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeExcelCell(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse}td{border:1px solid #999;padding:6px;mso-number-format:"\\@"}</style></head><body><table>${tableRows}</table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `musteriler-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("Müşteri listesi Excel olarak indirildi");
}

function escapeExcelCell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, "<br/>");
}

function LeadsPage({ user }: { user: User }) {
  const { data, addLead, importLeads, addLeadAction, updateLead } = useCrm();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("NONE");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const firstConsultantId = data.users.find((item) => item.role === "CONSULTANT")?.id ?? user.id;
  const defaultLeadValues: LeadFormValues = {
    name: "",
    externalId: "",
    email: "",
    phone: "",
    source: "Manuel giriş",
    budget: 0,
    interest: "Genel müşteri kaydı",
    address: "",
    preferredLocation: "",
    propertyOwner: "",
    propertyOwnerPhone: "",
    customerType: "KIRACI" as const,
            tenantStatus: "BILINMIYOR",
            tenantName: "",
            tenantMoveIn: "",
            tenantMoveOut: "",
            tenantNotes: "",
            notes: "",
            consultantId: canManageOffice(user) ? firstConsultantId : user.id,
  };
  const form = useForm<LeadFormValues>({ resolver: zodResolver(leadSchema), defaultValues: defaultLeadValues });
  const watchedAddress = form.watch("address");
  const consultants = data.users.filter((item) => item.role === "CONSULTANT");
  const normalizedQuery = normalizeMarketText(query.trim());
  const leads = data.leads.filter((lead) => {
    if (!canSeeOffice(user) && lead.consultantId !== user.id) return false;
    if (!normalizedQuery) return true;
    const consultantName = data.users.find((item) => item.id === lead.consultantId)?.name ?? "";
    const haystack = normalizeMarketText([
      displayLeadId(lead),
      lead.externalId,
      lead.propertyOwner,
      lead.propertyOwnerPhone,
      lead.name,
      lead.phone,
      lead.email,
      lead.address,
      lead.preferredLocation,
      extractDistrictFromAddress(lead.address),
      tenantSummary(lead),
      humanize(lead.status),
      consultantName,
      lead.notes,
      lead.tenantName,
      lead.tenantNotes,
    ].filter(Boolean).join(" "));
    return haystack.includes(normalizedQuery);
  });
  const groupedLeads = useMemo(() => {
    const labelFor = (lead: Lead) => {
      if (groupBy === "SEMT") return lead.preferredLocation || extractDistrictFromAddress(lead.address) || "Semt yok";
      if (groupBy === "MULK_SAHIBI") return lead.propertyOwner || lead.name || "Mülk sahibi yok";
      if (groupBy === "KIRACI") return tenantSummary(lead);
      if (groupBy === "DURUM") return humanize(lead.status);
      if (groupBy === "DANISMAN") return data.users.find((item) => item.id === lead.consultantId)?.name ?? "Danışman yok";
      return "Tüm müşteriler";
    };
    const groups = new Map<string, Lead[]>();
    leads.forEach((lead) => {
      const label = labelFor(lead);
      groups.set(label, [...(groups.get(label) ?? []), lead]);
    });
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }, [data.users, groupBy, leads]);
  const tableColumnCount = 6;

  useEffect(() => {
    const detectedDistrict = extractDistrictFromAddress(watchedAddress);
    const currentDistrict = form.getValues("preferredLocation");
    if (detectedDistrict && !currentDistrict) {
      form.setValue("preferredLocation", detectedDistrict);
    }
  }, [form, watchedAddress]);

  useEffect(() => {
    if (!normalizedQuery) return;
    const timeout = window.setTimeout(() => {
      void auditCustomerEvent("CUSTOMER_SEARCH", {
        metadata: {
          search_query: query.trim(),
          filters: { groupBy },
          result_count: leads.length,
          page: 1,
          limit: leads.length,
        },
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [groupBy, leads.length, normalizedQuery, query]);

  useEffect(() => {
    if (groupBy === "NONE") return;
    void auditCustomerEvent("CUSTOMER_FILTER", {
      metadata: {
        search_query: query.trim(),
        filters: { groupBy },
        result_count: leads.length,
        page: 1,
        limit: leads.length,
      },
    });
  }, [groupBy, leads.length, query]);

  useEffect(() => {
    if (!selectedLead) return;
    void auditCustomerEvent("CUSTOMER_DETAIL_VIEW", {
      targetCustomerId: selectedLead.id,
      metadata: { source: "lead_popup" },
    });
    void auditCustomerEvent("CUSTOMER_NOTE_VIEW", {
      targetCustomerId: selectedLead.id,
      metadata: { source: "lead_popup" },
    });
  }, [selectedLead]);

  async function handleLeadImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(xlsx|csv|tsv|txt)$/i.test(file.name)) {
      toast.error("Excel için .xlsx veya CSV dosyası yükle.");
      return;
    }
    setImporting(true);
    try {
      const consultantId = canManageOffice(user) ? firstConsultantId : user.id;
      let imported: LeadImportPayload[] = [];

      if (/\.xlsx$/i.test(file.name)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/lead-import", { method: "POST", body: formData });
        const result = (await response.json()) as { rows?: string[][]; error?: string };
        if (!response.ok || !result.rows) throw new Error(result.error ?? "Excel dosyası okunamadı.");
        imported = parseLeadRows(result.rows, consultantId);
      } else {
        imported = parseLeadImport(await file.text(), consultantId);
      }

      importLeads(imported, file.name, user.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dosya okunamadı.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-blue-100 bg-gradient-to-r from-[#f7fbff] to-white">
        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_360px]">
          <div>
            <p className="text-lg font-semibold text-slate-950">Müşteri Havuzu</p>
            <p className="mt-1 text-sm text-muted-foreground">Excel’den gelen müşteriler, tekil lead kayıtları ve danışman takipleri aynı çalışma alanında.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-blue-100 bg-white px-4 text-sm font-medium text-primary transition hover:bg-[#eef6ff]">
              {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? "Aktarılıyor" : "Excel / CSV Yükle"}
              <input className="hidden" type="file" accept=".xlsx,.csv,.tsv,.txt" onChange={handleLeadImport} />
            </label>
            <div className="flex gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-muted-foreground">
              <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>.xlsx veya CSV yükle. Kolonlar: ID, Mülk Sahibi, Adres, Semt ve Notlar otomatik eşleşir.</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle title="Hızlı Müşteri Ekle" action={<Badge label="Yeni" />} />
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) => {
            addLead({
              ...values,
              preferredLocation: values.preferredLocation?.trim() || extractDistrictFromAddress(values.address),
            } as Parameters<typeof addLead>[0]);
            form.reset(defaultLeadValues);
          })}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
            <Input className="xl:col-span-1" placeholder="ID" {...form.register("externalId")} />
            <Select className="xl:col-span-2" {...form.register("customerType")}>
              <option value="KIRACI">Kiracı</option>
              <option value="MULK_SAHIBI">Mülk Sahibi</option>
            </Select>
            <Input className="xl:col-span-2" placeholder="Ad soyad" {...form.register("name")} />
            <Input className="xl:col-span-2" placeholder="Telefon" {...form.register("phone")} />
            <Input className="xl:col-span-2" placeholder="E-posta" {...form.register("email")} />
            <Input className="xl:col-span-3" placeholder="Adres" {...form.register("address")} />
            <Input className="xl:col-span-2" list="lead-semt-options" placeholder="Semt" {...form.register("preferredLocation")} />
            <Input className="xl:col-span-2" placeholder="Mülk Sahibi" {...form.register("propertyOwner")} />
            <Input className="xl:col-span-2" placeholder="Ev sahibi telefonu" {...form.register("propertyOwnerPhone")} />
            <Textarea className="min-h-10 xl:col-span-4" placeholder="Notlar" {...form.register("notes")} />
            {canManageOffice(user) ? (
              <Select className="xl:col-span-2" {...form.register("consultantId")}>
                {consultants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            ) : null}
            <Button className="h-10 w-full xl:col-span-2" type="submit">
              <Plus className="h-4 w-4" />
              Müşteri Kaydet
            </Button>
          </div>
          <datalist id="lead-semt-options">
            {istanbulDistrictOptions.map((district) => <option key={district} value={district} />)}
          </datalist>
          <input type="hidden" {...form.register("source")} />
          <input type="hidden" {...form.register("budget")} />
          <input type="hidden" {...form.register("interest")} />
        </form>
      </Card>

      <Toolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="ID, adres, semt, mülk sahibi, telefon veya not ara" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Select className="md:w-56" value={groupBy} onChange={(event) => {
          setGroupBy(event.target.value);
          setCollapsedGroups({});
        }}>
          <option value="NONE">Gruplama yok</option>
          <option value="SEMT">Semte göre grupla</option>
          <option value="MULK_SAHIBI">Mülk sahibine göre grupla</option>
          <option value="KIRACI">Kiracı bilgisine göre grupla</option>
          <option value="DURUM">Duruma göre grupla</option>
          <option value="DANISMAN">Danışmana göre grupla</option>
        </Select>
        {canManageOffice(user) ? (
          <Button variant="outline" onClick={() => {
            void auditCustomerEvent("CUSTOMER_EXPORT", {
              metadata: {
                export_type: "excel",
                selected_fields: ["ID", "Mülk Sahibi", "Telefon", "Adres", "Semt", "Kiracı Bilgisi", "Danışman", "Durum", "Notlar"],
                row_count: leads.length,
                filters: { groupBy, search_query: query.trim() },
              },
            });
            exportLeadsToExcel(leads, data.users);
          }}>
            <Download className="h-4 w-4" />
            Excel’e Aktar
          </Button>
        ) : null}
        <Badge label={`${leads.length} kayıt`} />
      </Toolbar>

      <Card className="overflow-hidden border-slate-300 bg-white">
        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[1120px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[#e8f3ff] text-left text-[11px] uppercase tracking-wide text-primary">
              <tr>
                <th className="border border-slate-300 px-3 py-2 font-semibold">ID</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold">Mülk Sahibi</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold">Telefon</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold">Adres</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold">Semt</th>
                <th className="border border-slate-300 px-3 py-2 font-semibold">Kiracı Bilgisi</th>
              </tr>
            </thead>
            <tbody>
              {groupedLeads.map((group) => (
                <Fragment key={group.label}>
                  {groupBy !== "NONE" ? (
                    <tr className="bg-slate-100">
                      <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-800" colSpan={tableColumnCount}>
                        <button
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() => setCollapsedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                        >
                          <span className="inline-flex items-center gap-2">
                            <ChevronRight className={`h-4 w-4 transition ${collapsedGroups[group.label] ? "" : "rotate-90"}`} />
                            {group.label}
                          </span>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] text-muted-foreground">{group.items.length} kayıt</span>
                        </button>
                      </td>
                    </tr>
                  ) : null}
                  {collapsedGroups[group.label] ? null : group.items.map((lead) => (
                    <tr key={lead.id} className="cursor-pointer bg-white align-top transition odd:bg-white even:bg-[#fbfdff] hover:bg-[#eef6ff]" onClick={() => setSelectedLead(lead)}>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-[12px] text-slate-800">{displayLeadId(lead)}</td>
                      <td className="max-w-[260px] whitespace-pre-line border border-slate-200 px-3 py-2 font-semibold leading-5 text-slate-950">{lead.propertyOwner || lead.name || "-"}</td>
                      <td className="border border-slate-200 px-3 py-2 font-mono text-[12px] text-slate-800">{lead.propertyOwnerPhone || lead.phone || "-"}</td>
                      <td className="max-w-[520px] whitespace-pre-line border border-slate-200 px-3 py-2 leading-5 text-slate-800">{lead.address || "-"}</td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-800">{lead.preferredLocation || extractDistrictFromAddress(lead.address) || "-"}</td>
                      <td className="border border-slate-200 px-3 py-2"><Badge label={tenantSummary(lead)} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {!leads.length ? (
                <tr>
                  <td className="border border-slate-200 px-4 py-10 text-center text-muted-foreground" colSpan={tableColumnCount}>Müşteri kaydı bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedLead ? (
        <LeadPopup
          lead={selectedLead}
          consultantName={data.users.find((item) => item.id === selectedLead.consultantId)?.name ?? "-"}
          note={note}
          onNoteChange={setNote}
          onAddNote={() => {
            const cleanNote = note.trim();
            if (!cleanNote) {
              toast.error("Not boş olamaz");
              return;
            }
            const nextNotes = [selectedLead.notes, cleanNote].filter(Boolean).join("\n");
            addLeadAction(selectedLead.id, user.id, cleanNote);
            void auditCustomerEvent("CUSTOMER_NOTE_CREATE", {
              targetCustomerId: selectedLead.id,
              metadata: { note_length: cleanNote.length },
            });
            updateLead(selectedLead.id, { notes: nextNotes });
            setSelectedLead((current) => (current ? { ...current, notes: nextNotes } : current));
            setNote("");
          }}
          onClose={() => { setSelectedLead(null); setNote(""); }}
          onUpdate={(patch) => {
            updateLead(selectedLead.id, patch);
            setSelectedLead((current) => (current ? { ...current, ...patch } : current));
          }}
        />
      ) : null}
    </div>
  );
}

function LeadPopup({
  lead,
  consultantName,
  note,
  onNoteChange,
  onAddNote,
  onClose,
  onUpdate,
}: {
  lead: Lead;
  consultantName: string;
  note: string;
  onNoteChange: (value: string) => void;
  onAddNote: () => void;
  onClose: () => void;
  onUpdate: (patch: Partial<Lead>) => void;
}) {
  const [propertyOwner, setPropertyOwner] = useState(lead.propertyOwner ?? "");
  const [propertyOwnerPhone, setPropertyOwnerPhone] = useState(lead.propertyOwnerPhone ?? lead.phone ?? "");
  const [tenantStatus, setTenantStatus] = useState<NonNullable<Lead["tenantStatus"]>>(lead.tenantStatus ?? "BILINMIYOR");
  const [tenantName, setTenantName] = useState(lead.tenantName ?? "");
  const [tenantMoveIn, setTenantMoveIn] = useState(lead.tenantMoveIn ?? "");
  const [tenantMoveOut, setTenantMoveOut] = useState(lead.tenantMoveOut ?? "");
  const [tenantNotes, setTenantNotes] = useState(lead.tenantNotes ?? "");
  const [status, setStatus] = useState<Lead["status"]>(lead.status);

  useEffect(() => {
    setPropertyOwner(lead.propertyOwner ?? "");
    setPropertyOwnerPhone(lead.propertyOwnerPhone ?? lead.phone ?? "");
    setTenantStatus(lead.tenantStatus ?? "BILINMIYOR");
    setTenantName(lead.tenantName ?? "");
    setTenantMoveIn(lead.tenantMoveIn ?? "");
    setTenantMoveOut(lead.tenantMoveOut ?? "");
    setTenantNotes(lead.tenantNotes ?? "");
    setStatus(lead.status);
  }, [lead]);

  const daysLeft = daysUntilDate(tenantMoveOut);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <Card className="max-h-[92vh] w-full max-w-5xl overflow-hidden shadow-2xl shadow-blue-950/20">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Mülk / Kiracı Kartı</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{propertyOwner || lead.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">ID {displayLeadId(lead)} · {consultantName}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-5">
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-7">
            <InfoRow label="Mülk sahibi" value={propertyOwner || "-"} />
            <InfoRow label="Telefon" value={propertyOwnerPhone || "-"} />
            <InfoRow label="Adres" value={lead.address || "-"} />
            <InfoRow label="Semt" value={lead.preferredLocation || extractDistrictFromAddress(lead.address) || "-"} />
            <InfoRow label="Kiracı durumu" value={tenantSummary({ ...lead, tenantStatus, tenantName })} />
            <InfoRow label="Durum" value={humanize(status)} />
            <InfoRow label="Danışman" value={consultantName} />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-blue-100 bg-[#f7fbff] p-4">
              <SectionTitle title="Ev Sahibi Bilgisi" action="Danışman düzenler" />
              <div className="mb-5 grid gap-3 md:grid-cols-2">
                <Field label="Ev sahibi isim soyisim">
                  <Input value={propertyOwner} onChange={(event) => setPropertyOwner(event.target.value)} placeholder="Ev sahibi adı soyadı" />
                </Field>
                <Field label="Ev sahibi telefonu">
                  <Input value={propertyOwnerPhone} onChange={(event) => setPropertyOwnerPhone(event.target.value)} placeholder="Telefon" />
                </Field>
              </div>
              <SectionTitle title="Kiracı / Kira Bilgisi" action={daysLeft !== null ? tenantReminderText(daysLeft) : "Tarih yok"} />
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-primary">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Giriş tarihi</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{displayLeadDate(tenantMoveIn)}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Çıkış tarihi</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{displayLeadDate(tenantMoveOut)}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Kiracı durumu">
                  <Select value={tenantStatus} onChange={(event) => setTenantStatus(event.target.value as NonNullable<Lead["tenantStatus"]>)}>
                    <option value="BILINMIYOR">Belirtilmedi</option>
                    <option value="VAR">Kiracı var</option>
                    <option value="YOK">Kiracı yok</option>
                  </Select>
                </Field>
                <Field label="Kayıt durumu">
                  <Select value={status} onChange={(event) => setStatus(event.target.value as Lead["status"])}>
                    {leadStages.map((stage) => <option key={stage} value={stage}>{humanize(stage)}</option>)}
                  </Select>
                </Field>
                <Field label="Kiracı isim soyisim">
                  <Input value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="Kiracı adı soyadı" disabled={tenantStatus === "YOK"} />
                </Field>
                <Field label="Giriş tarihi">
                  <Input type="date" value={tenantMoveIn} onChange={(event) => setTenantMoveIn(event.target.value)} disabled={tenantStatus === "YOK"} />
                </Field>
                <Field label="Çıkış / sözleşme bitiş tarihi">
                  <Input type="date" value={tenantMoveOut} onChange={(event) => setTenantMoveOut(event.target.value)} disabled={tenantStatus === "YOK"} />
                </Field>
                <div className="rounded-md border border-blue-100 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-950">Hatırlatma</p>
                  <p className="mt-1 leading-5 text-muted-foreground">Tarih girilirse 7, 5, 3 gün kala ve çıkış günü bildirim oluşur.</p>
                </div>
                <Field label="Kiracı / kira notları">
                  <Textarea className="min-h-28 md:col-span-2" value={tenantNotes} onChange={(event) => setTenantNotes(event.target.value)} placeholder="Kira durumu, özel şartlar, çıkış notu..." disabled={tenantStatus === "YOK"} />
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => onUpdate({
                    propertyOwner,
                    propertyOwnerPhone,
                    name: propertyOwner || lead.name,
                    phone: propertyOwnerPhone || lead.phone,
                    status,
                    tenantStatus,
                    tenantName: tenantStatus === "YOK" ? "" : tenantName,
                    tenantMoveIn: tenantStatus === "YOK" ? "" : tenantMoveIn,
                    tenantMoveOut: tenantStatus === "YOK" ? "" : tenantMoveOut,
                    tenantNotes: tenantStatus === "YOK" ? "" : tenantNotes,
                  })}
                >
                  Ev Sahibi ve Kiracı Bilgisini Kaydet
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle title="Notlar" action="Danışman notu" />
              <div className="rounded-md border border-border bg-slate-50 p-3 text-sm leading-6 text-muted-foreground">
                {lead.notes || "Genel not yok."}
              </div>
              {lead.tenantNotes ? (
                <div className="mt-3 rounded-md border border-blue-100 bg-[#f7fbff] p-3 text-sm leading-6 text-muted-foreground">
                  <span className="font-semibold text-slate-950">Kiracı notu: </span>{lead.tenantNotes}
                </div>
              ) : null}
              <Textarea className="mt-3 min-h-28" placeholder="Yeni not ekle" value={note} onChange={(event) => onNoteChange(event.target.value)} />
              <div className="mt-3 flex justify-end">
                <Button variant="outline" onClick={onAddNote}>Not Ekle</Button>
              </div>
            </Card>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LeadDetail({ user, leadId }: { user: User; leadId: string }) {
  const { data, updateLead, addLeadAction } = useCrm();
  const [note, setNote] = useState("");
  const lead = data.leads.find((item) => item.id === leadId);
  const [tenantStatus, setTenantStatus] = useState<NonNullable<Lead["tenantStatus"]>>(lead?.tenantStatus ?? "BILINMIYOR");
  const [tenantName, setTenantName] = useState(lead?.tenantName ?? "");
  const [tenantMoveIn, setTenantMoveIn] = useState(lead?.tenantMoveIn ?? "");
  const [tenantMoveOut, setTenantMoveOut] = useState(lead?.tenantMoveOut ?? "");

  useEffect(() => {
    if (!lead) return;
    setTenantStatus(lead.tenantStatus ?? "BILINMIYOR");
    setTenantName(lead.tenantName ?? "");
    setTenantMoveIn(lead.tenantMoveIn ?? "");
    setTenantMoveOut(lead.tenantMoveOut ?? "");
  }, [lead]);

  useEffect(() => {
    if (!lead || (!canSeeOffice(user) && lead.consultantId !== user.id)) return;
    void auditCustomerEvent("CUSTOMER_DETAIL_VIEW", {
      targetCustomerId: lead.id,
      metadata: { source: "lead_detail_page" },
    });
    void auditCustomerEvent("CUSTOMER_NOTE_VIEW", {
      targetCustomerId: lead.id,
      metadata: { source: "lead_detail_page" },
    });
  }, [lead, user]);

  if (!lead) return <Card className="p-8">Müşteri bulunamadı.</Card>;
  if (!canSeeOffice(user) && lead.consultantId !== user.id) return <AccessDenied />;

  const consultant = data.users.find((item) => item.id === lead.consultantId);
  const leadTasks = data.tasks.filter((task) => task.leadId === lead.id);
  const leadNotes = data.leadActions.filter((action) => action.leadId === lead.id);
  const interested = data.properties.filter((property) => lead.interestedPropertyIds?.includes(property.id) || lead.interest.toLocaleLowerCase("tr").includes(property.neighborhood.toLocaleLowerCase("tr")));

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <Badge label={lead.status} />
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">{lead.propertyOwner || lead.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{lead.propertyOwnerPhone || lead.phone || "Telefon yok"} · {lead.address || "Adres yok"}</p>
            </div>
            <Select className="md:w-56" value={lead.status} onChange={(event) => updateLead(lead.id, { status: event.target.value as Lead["status"] })}>
              {leadStages.map((stage) => <option key={stage} value={stage}>{humanize(stage)}</option>)}
            </Select>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <InfoBox label="ID" value={displayLeadId(lead)} />
            <InfoBox label="Mülk Sahibi" value={lead.propertyOwner || "-"} />
            <InfoBox label="Telefon" value={lead.propertyOwnerPhone || lead.phone || "-"} />
            <InfoBox label="Adres" value={lead.address || lead.preferredLocation || "-"} />
            <InfoBox label="Semt" value={lead.preferredLocation || extractDistrictFromAddress(lead.address) || "-"} />
            <InfoBox label="Kiracı" value={tenantSummary(lead)} />
            <InfoBox label="Danışman" value={consultant?.name ?? "Atanmadı"} />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Kiracı Bilgisi" action={<Badge label={tenantSummary(lead)} />} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Durum">
              <Select value={tenantStatus} onChange={(event) => setTenantStatus(event.target.value as NonNullable<Lead["tenantStatus"]>)}>
                <option value="BILINMIYOR">Belirtilmedi</option>
                <option value="VAR">Kiracı var</option>
                <option value="YOK">Kiracı yok</option>
              </Select>
            </Field>
            <Field label="Kiracı isim soyisim">
              <Input value={tenantName} onChange={(event) => setTenantName(event.target.value)} placeholder="İsim soyisim" disabled={tenantStatus === "YOK"} />
            </Field>
            <Field label="Giriş tarihi">
              <Input type="date" value={tenantMoveIn} onChange={(event) => setTenantMoveIn(event.target.value)} disabled={tenantStatus === "YOK"} />
            </Field>
            <Field label="Çıkış tarihi">
              <Input type="date" value={tenantMoveOut} onChange={(event) => setTenantMoveOut(event.target.value)} disabled={tenantStatus === "YOK"} />
            </Field>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => updateLead(lead.id, {
                  tenantStatus,
                  tenantName: tenantStatus === "YOK" ? "" : tenantName,
                  tenantMoveIn: tenantStatus === "YOK" ? "" : tenantMoveIn,
                  tenantMoveOut: tenantStatus === "YOK" ? "" : tenantMoveOut,
                })}
              >
                Kiracı Bilgisini Kaydet
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Görüşme Notları" />
          <div className="space-y-3">
            <p className="rounded-md border border-border bg-slate-50 p-3 text-sm text-muted-foreground">{lead.notes}</p>
            {leadNotes.map((action) => (
              <div key={action.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{action.action}</p>
                <p className="mt-1 text-muted-foreground">{action.note}</p>
              </div>
            ))}
            <Textarea placeholder="Yeni görüşme notu" value={note} onChange={(event) => setNote(event.target.value)} />
            <Button onClick={() => {
              const cleanNote = note || "Görüşme notu eklendi.";
              addLeadAction(lead.id, user.id, cleanNote);
              void auditCustomerEvent("CUSTOMER_NOTE_CREATE", {
                targetCustomerId: lead.id,
                metadata: { note_length: cleanNote.length },
              });
              setNote("");
            }}>Not Ekle</Button>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle title="İlgilendiği Portföyler" padded />
          <div className="divide-y divide-border">
            {interested.slice(0, 5).map((property) => <PropertyRow key={property.id} property={property} consultant={data.users.find((item) => item.id === property.consultantId)} />)}
            {!interested.length ? <EmptyState title="Portföy eşleşmesi yok" description="Müşterinin ilgi alanına portföy bağlandığında burada görünür." /> : null}
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card className="p-5">
          <SectionTitle title="Randevular" />
          <div className="space-y-2">
            {leadTasks.filter((task) => task.type === "RANDEVU" || task.type === "YER_GOSTERIMI").map((task) => (
              <div key={task.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{task.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{shortDate(task.dueDate)} · {humanize(task.type)}</p>
              </div>
            ))}
            {!leadTasks.length ? <p className="text-sm text-muted-foreground">Planlı randevu yok.</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Görevler" />
          <div className="space-y-2">
            {leadTasks.map((task) => (
              <div key={task.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{task.title}</p>
                  <Badge label={task.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{data.users.find((item) => item.id === task.assignedToId)?.name ?? "Atanmadı"}</p>
              </div>
            ))}
            {!leadTasks.length ? <p className="text-sm text-muted-foreground">Bağlı görev yok.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function TasksPage({ user }: { user: User }) {
  const { data, addTask, updateTask } = useCrm();
  const tasks = data.tasks.filter((task) => canSeeOffice(user) || task.assignedToId === user.id);
  const assignees = useMemo(() => (canManageOffice(user) ? data.users.filter((item) => item.active && item.role !== "ADMIN") : [user]), [data.users, user]);
  const defaultAssigneeId = assignees.find((item) => item.role === "CONSULTANT")?.id ?? assignees[0]?.id ?? user.id;
  const activeClient = clientForUser(data, user);
  const companyName = activeClient?.name ?? data.setting.companyName;
  const organizerEmail = inviteFromEmailForClient(activeClient);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskLocation, setTaskLocation] = useState("");
  const [taskDate, setTaskDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [taskTime, setTaskTime] = useState("10:30");
  const [taskDurationMinutes, setTaskDurationMinutes] = useState(60);
  const [taskReminderMinutes, setTaskReminderMinutes] = useState(30);
  const [taskType, setTaskType] = useState<Task["type"]>("RANDEVU");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("ORTA");
  const [assignedToId, setAssignedToId] = useState(defaultAssigneeId);
  const [inviteSending, setInviteSending] = useState(false);
  const columns = ["ACIK", "DEVAM", "TAMAMLANDI"] as const;
  const columnMeta: Record<(typeof columns)[number], { title: string; description: string }> = {
    ACIK: { title: "Açık", description: "Başlanacak işler" },
    DEVAM: { title: "Devam", description: "Üzerinde çalışılan işler" },
    TAMAMLANDI: { title: "Tamamlandı", description: "Kapanan işler" },
  };

  useEffect(() => {
    if (!assignees.some((item) => item.id === assignedToId)) {
      setAssignedToId(defaultAssigneeId);
    }
  }, [assignedToId, assignees, defaultAssigneeId]);

  const createTaskAndInvite = async () => {
    const assignedUser = assignees.find((item) => item.id === assignedToId) ?? user;
    const attendeeEmail = calendarEmailForUser(assignedUser);
    if (!taskTitle.trim()) {
      toast.error("Görev başlığı gir.");
      return;
    }
    if (!isValidEmail(attendeeEmail)) {
      toast.error("Danışmanın davet e-postası geçerli değil.");
      return;
    }
    if (!isValidEmail(organizerEmail)) {
      toast.error("Ofis davet gönderen e-postası geçerli değil.");
      return;
    }

    const [hour = "10", minute = "30"] = taskTime.split(":");
    const start = new Date(`${taskDate}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00`);
    if (Number.isNaN(start.getTime())) {
      toast.error("Geçerli bir görev tarihi seç.");
      return;
    }
    const end = new Date(start.getTime() + taskDurationMinutes * 60 * 1000);
    const taskPayload = {
      title: taskTitle.trim(),
      description: taskDescription.trim() || "Görevler sayfasından oluşturuldu.",
      type: taskType ?? "RANDEVU",
      dueDate: start.toISOString(),
      endDate: end.toISOString(),
      location: taskLocation.trim(),
      reminderMinutes: taskReminderMinutes,
      priority: taskPriority,
      assignedToId: assignedUser.id,
      createdById: user.id,
    };
    const id = addTask(taskPayload);

    setInviteSending(true);
    try {
      const inviteResult = await dispatchTaskInvite({
        id,
        task: taskPayload,
        attendeeEmail,
        attendeeName: assignedUser.name,
        companyName,
        organizerEmail,
        companyLogoUrl: calendarLogoUrlForClient(activeClient),
      });
      updateTask(id, inviteResult);
      if (inviteResult.calendarInviteStatus === "Davet gönderildi") {
        toast.success("Görev daveti gönderildi");
        setTaskTitle("");
        setTaskDescription("");
        setTaskLocation("");
        return;
      }
      toast.success("Görev oluşturuldu");
    } catch (error) {
      updateTask(id, { calendarInviteStatus: "Davet gönderilemedi" });
      toast.error(error instanceof Error ? error.message : "Görev eklendi fakat davet gönderilemedi.");
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle title="Görev Oluştur" action={<Badge label="Davet maili" />} />
        <p className="mb-5 text-sm text-muted-foreground">Görev CRM’de oluşur, seçilen danışmana takvime eklenebilir davet maili gider.</p>
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr_0.8fr]">
          <Field label="Görev başlığı">
            <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Örn: Moda ev gösterimi" />
          </Field>
          <Field label="Konum">
            <Input value={taskLocation} onChange={(event) => setTaskLocation(event.target.value)} placeholder="Portföy adı veya açık adres" />
          </Field>
          <Field label="Tarih">
            <Input type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} />
          </Field>
          <Field label="Saat">
            <Input type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_1fr]">
          <Field label="Görev türü">
            <Select value={taskType} onChange={(event) => setTaskType(event.target.value as Task["type"])}>
              <option value="ARAMA">Arama</option>
              <option value="RANDEVU">Randevu</option>
              <option value="YER_GOSTERIMI">Yer Gösterimi</option>
              <option value="EVRAK_TAKIBI">Evrak Takibi</option>
              <option value="FOTOGRAF_CEKIMI">Fotoğraf Çekimi</option>
              <option value="FIYAT_GUNCELLEME">Fiyat Güncelleme</option>
              <option value="MUSTERI_TAKIBI">Müşteri Takibi</option>
            </Select>
          </Field>
          <Field label="Süre">
            <Select value={taskDurationMinutes} onChange={(event) => setTaskDurationMinutes(Number(event.target.value))}>
              <option value={30}>30 dk</option>
              <option value={60}>1 saat</option>
              <option value={90}>1.5 saat</option>
              <option value={120}>2 saat</option>
            </Select>
          </Field>
          <Field label="Hatırlatma">
            <Select value={taskReminderMinutes} onChange={(event) => setTaskReminderMinutes(Number(event.target.value))}>
              <option value={15}>15 dk önce</option>
              <option value={30}>30 dk önce</option>
              <option value={60}>1 saat önce</option>
            </Select>
          </Field>
          <Field label="Öncelik">
            <Select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Task["priority"])}>
              <option value="DUSUK">Düşük</option>
              <option value="ORTA">Orta</option>
              <option value="YUKSEK">Yüksek</option>
            </Select>
          </Field>
          <Field label="Danışman">
            <Select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}>
              {assignees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <Field label="Açıklama">
            <Textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Danışmana gidecek görev notu" />
          </Field>
          <Button className="h-12 px-6" onClick={createTaskAndInvite} disabled={inviteSending}>
            {inviteSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            Görev Oluştur ve Davet Gönder
          </Button>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column);
          return (
            <Card key={column} className="min-h-[560px] overflow-hidden">
              <div className="border-b border-border bg-[#f7fbff] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">{columnMeta[column].title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{columnMeta[column].description}</p>
                  </div>
                  <Badge label={`${columnTasks.length}`} />
                </div>
              </div>
              <div className="space-y-3 p-4">
                {columnTasks.map((task) => {
                  const lead = data.leads.find((item) => item.id === task.leadId);
                  const property = data.properties.find((item) => item.id === task.propertyId);
                  return (
                    <div key={task.id} className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-950">{task.title}</p>
                        <Badge label={task.priority} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{humanize(task.type)} · {shortDate(task.dueDate)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{data.users.find((item) => item.id === task.assignedToId)?.name ?? "Atanmadı"}</p>
                      {task.location ? <p className="mt-2 text-xs text-muted-foreground">Konum: {task.location}</p> : null}
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{lead?.name ?? property?.title ?? task.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {task.calendarInviteStatus ? <Badge label={task.calendarInviteStatus} /> : null}
                        {task.googleCalendarResponseStatus ? <Badge label={humanize(task.googleCalendarResponseStatus)} /> : null}
                      </div>
                      {task.calendarInviteRespondedAt ? (
                        <p className="mt-2 text-xs font-medium text-slate-500">Yanıt zamanı: {shortDate(task.calendarInviteRespondedAt)}</p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {column !== "ACIK" ? <Button size="sm" variant="outline" onClick={() => updateTask(task.id, { status: "ACIK" })}>Açık</Button> : null}
                        {column !== "DEVAM" ? <Button size="sm" variant="outline" onClick={() => updateTask(task.id, { status: "DEVAM" })}>Devam</Button> : null}
                        {column !== "TAMAMLANDI" ? <Button size="sm" onClick={() => updateTask(task.id, { status: "TAMAMLANDI" })}>Tamamlandı</Button> : null}
                      </div>
                    </div>
                  );
                })}
                {!columnTasks.length ? (
                  <div className="rounded-lg border border-dashed border-blue-100 bg-white p-5 text-sm text-muted-foreground">Bu kolonda görev yok.</div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CalendarPage({ user }: { user: User }) {
  const { data, addTask, updateTask } = useCrm();
  const today = useMemo(() => new Date(), []);
  const calendarYear = today.getFullYear();
  const calendarMonth = today.getMonth();
  const calendarMonthLabel = formatTurkishMonth(today);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [time, setTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [inviteSending, setInviteSending] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const assignees = canManageOffice(user) ? data.users.filter((item) => item.active && item.role !== "ADMIN") : [user];
  const [assignedToId, setAssignedToId] = useState(assignees[0]?.id ?? user.id);
  const tasks = data.tasks.filter((task) => canSeeOffice(user) || task.assignedToId === user.id);
  const calendarProperties = data.properties.filter((property) => canSeeOffice(user) || property.consultantId === user.id);
  const activeClient = clientForUser(data, user);
  const companyName = activeClient?.name ?? data.setting.companyName;
  const organizerEmail = inviteFromEmailForClient(activeClient);
  const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const firstOffset = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarCells = [...Array.from({ length: firstOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const propertyLocationLabel = (property: Property) => `${property.title} · ${property.neighborhood}, ${property.district}`;
  const propertyLocationValue = (property: Property) => [property.neighborhood, property.district, property.city].filter(Boolean).join(", ");
  const normalizedLocation = normalizeMarketText(location.trim());
  const matchedProperty = normalizedLocation ? calendarProperties.find((property) => {
    const candidates = [property.title, property.projectName, propertyLocationLabel(property), propertyLocationValue(property)].filter(Boolean);
    return candidates.some((candidate) => normalizeMarketText(candidate).includes(normalizedLocation) || normalizedLocation.includes(normalizeMarketText(candidate)));
  }) : undefined;
  const dayEvents = (day: number) => tasks.filter((task) => {
    const date = new Date(task.dueDate);
    return date.getFullYear() === calendarYear && date.getMonth() === calendarMonth && date.getDate() === day;
  });

  const createCalendarTask = async () => {
    const assignedUser = assignees.find((item) => item.id === assignedToId) ?? user;
    if (!title.trim()) {
      toast.error("Görev başlığı gir.");
      return;
    }
    if (!isValidEmail(calendarEmailForUser(assignedUser))) {
      toast.error("Danışmanın davet e-postası geçerli değil.");
      return;
    }
    if (!isValidEmail(organizerEmail)) {
      toast.error("Ofis davet gönderen e-postası geçerli değil.");
      return;
    }

    const [hour = "10", minute = "00"] = time.split(":");
    const start = new Date(calendarYear, calendarMonth, selectedDay, Number(hour), Number(minute));
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const taskPayload = {
      title: title.trim(),
      description: description.trim() || "Takvimden oluşturuldu.",
      type: "RANDEVU" as const,
      dueDate: start.toISOString(),
      endDate: end.toISOString(),
      location: matchedProperty ? propertyLocationValue(matchedProperty) : location.trim(),
      reminderMinutes,
      priority: "ORTA" as const,
      assignedToId: assignedUser.id,
      createdById: user.id,
      propertyId: matchedProperty?.id,
    };
    const id = addTask(taskPayload);
    setTitle("");
    setDescription("");
    setLocation("");

    setInviteSending(true);
    try {
      const inviteResult = await dispatchTaskInvite({
        id,
        task: taskPayload,
        attendeeEmail: calendarEmailForUser(assignedUser),
        attendeeName: assignedUser.name,
        companyName,
        organizerEmail,
        companyLogoUrl: calendarLogoUrlForClient(activeClient),
      });
      updateTask(id, inviteResult);
      if (inviteResult.calendarInviteStatus === "Davet gönderildi") {
        toast.success("Davet gönderildi");
        return;
      }
      toast.success("Görev oluşturuldu");
    } catch (error) {
      updateTask(id, { calendarInviteStatus: "Davet gönderilemedi" });
      toast.error(error instanceof Error ? error.message : "Görev eklendi fakat davet gönderilemedi.");
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center">
          <div>
            <p className="text-lg font-semibold text-slate-950">Ekip Takvimi</p>
            <p className="text-sm text-muted-foreground">Randevu, yer gösterimi ve takip görevleri</p>
          </div>
          <Button variant="outline" onClick={() => setSelectedDay(today.getDate())}>Bugün</Button>
        </div>
        <div className="grid grid-cols-7 border-b border-border bg-[#e8f3ff] text-xs font-semibold uppercase tracking-wide text-primary">
          {weekdays.map((day) => <div key={day} className="px-3 py-3">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 bg-white">
          {calendarCells.map((day, index) => {
            const events = day ? dayEvents(day) : [];
            const isSelected = day === selectedDay;
            return (
              <button
                key={`${day ?? "blank"}-${index}`}
                className={`min-h-28 border-b border-r border-border p-3 text-left transition hover:bg-[#f3f8ff] ${isSelected ? "bg-[#eef6ff]" : "bg-white"}`}
                disabled={!day}
                onClick={() => day && setSelectedDay(day)}
              >
                {day ? (
                  <>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isSelected ? "bg-primary text-white" : "text-slate-700"}`}>{day}</span>
                    <div className="mt-2 space-y-1">
                      {events.slice(0, 2).map((event) => (
                        <div key={event.id} className="truncate rounded-md bg-[#e8f3ff] px-2 py-1 text-xs font-medium text-primary">
                          {humanize(event.type)} · {event.title}
                        </div>
                      ))}
                      {events.length > 2 ? <p className="text-xs text-muted-foreground">+{events.length - 2} aksiyon</p> : null}
                    </div>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>
      <div className="space-y-5">
        <Card className="p-5">
          <SectionTitle title={`${selectedDay} ${calendarMonthLabel}`} />
          <div className="space-y-3">
            {dayEvents(selectedDay).map((task) => (
              <div key={task.id} className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                <div className="flex items-start gap-3">
                  <button
                    className={`mt-0.5 h-5 w-5 rounded-full border ${task.status === "TAMAMLANDI" ? "border-primary bg-primary" : "border-blue-200 bg-white"}`}
                    onClick={() => updateTask(task.id, { status: task.status === "TAMAMLANDI" ? "ACIK" : "TAMAMLANDI" })}
                    aria-label="Görevi tamamla"
                  />
                  <div>
                    <p className="text-sm font-semibold">{task.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{data.users.find((item) => item.id === task.assignedToId)?.name ?? "Danışman"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {task.calendarInviteStatus ? <Badge label={task.calendarInviteStatus} /> : null}
                      {task.googleCalendarResponseStatus ? <Badge label={humanize(task.googleCalendarResponseStatus)} /> : null}
                      {task.googleCalendarHtmlLink ? (
                        <a className="text-xs font-medium text-primary" href={task.googleCalendarHtmlLink} target="_blank" rel="noreferrer">Google event</a>
                      ) : null}
                    </div>
                    {task.calendarInviteRespondedAt ? (
                      <p className="mt-2 text-xs font-medium text-slate-500">Yanıt zamanı: {shortDate(task.calendarInviteRespondedAt)}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {!dayEvents(selectedDay).length ? <p className="rounded-lg border border-dashed border-blue-100 bg-[#f7fbff] p-4 text-sm text-muted-foreground">Bu gün için görev yok.</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Davet Gönder" />
          <div className="space-y-3">
            <Input placeholder="Örn: Bebek yer gösterimi" value={title} onChange={(event) => setTitle(event.target.value)} />
            <Textarea placeholder="Açıklama / müşteri notu" value={description} onChange={(event) => setDescription(event.target.value)} />
            <Input list="calendar-property-location-options" placeholder="Portföy adı veya konum yaz" value={location} onChange={(event) => setLocation(event.target.value)} />
            <datalist id="calendar-property-location-options">
              {calendarProperties.map((property) => (
                <option key={property.id} value={propertyLocationLabel(property)} />
              ))}
            </datalist>
            {matchedProperty ? <p className="rounded-md border border-blue-100 bg-[#f7fbff] px-3 py-2 text-xs text-muted-foreground">Seçilen portföy: {matchedProperty.title}</p> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              <Select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
                <option value={30}>30 dk</option>
                <option value={60}>1 saat</option>
                <option value={90}>1.5 saat</option>
                <option value={120}>2 saat</option>
              </Select>
              <Select value={reminderMinutes} onChange={(event) => setReminderMinutes(Number(event.target.value))}>
                <option value={15}>15 dk önce</option>
                <option value={30}>30 dk önce</option>
                <option value={60}>1 saat önce</option>
              </Select>
            </div>
            {canManageOffice(user) ? <Select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)}>{assignees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select> : null}
            <Button className="w-full" onClick={createCalendarTask} disabled={inviteSending}>
              {inviteSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Görev Oluştur ve Davet Gönder
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

const marketSources = ["Sahibinden", "Hepsiemlak", "Emlakjet"] as const;
const marketSourceLabels: Record<(typeof marketSources)[number], string> = {
  Sahibinden: "Sahibinden",
  Hepsiemlak: "Hürriyet Emlak / Hepsiemlak",
  Emlakjet: "Emlakjet",
};

function normalizeMarketText(value: string) {
  return value.toLocaleLowerCase("tr").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
}

function marketHaystack(item: MarketListing) {
  return normalizeMarketText(`${item.city} ${item.district} ${item.neighborhood} ${item.street} ${item.title}`);
}

function findMarketListings(listings: MarketListing[], query: string) {
  const tokens = normalizeMarketText(query).split(/[,\s]+/).filter(Boolean);
  if (!tokens.length) return listings.filter((item) => item.status === "AKTIF");

  const exact = listings.filter((item) => {
    const haystack = marketHaystack(item);
    return item.status === "AKTIF" && tokens.every((token) => haystack.includes(token));
  });
  if (exact.length) return exact;

  const relaxed = listings.filter((item) => {
    const haystack = marketHaystack(item);
    return item.status === "AKTIF" && tokens.some((token) => token.length > 2 && haystack.includes(token));
  });
  if (relaxed.length) return relaxed;

  return [];
}

function MarketAnalysisPage({ user }: { user: User }) {
  const { data } = useCrm();
  const [mapQuery, setMapQuery] = useState("");
  const [listingMode, setListingMode] = useState<"KIRALIK" | "SATILIK" | "TUMU">("KIRALIK");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState("Konum izni bekleniyor");
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("Bu tarayıcı konum iznini desteklemiyor.");
      return;
    }
    setGeoStatus("Konum izni isteniyor...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoStatus("Konum çevresi gösteriliyor.");
      },
      () => setGeoStatus("Konum izni verilmedi. Harita İstanbul genelinde açılır."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };
  useEffect(() => {
    requestLocation();
  }, []);
  const ownPropertyListings = data.properties.flatMap((property): MarketListing[] => {
    const source = marketSources.find((item) => normalizeMarketText(property.sourcePlatform ?? "").includes(normalizeMarketText(item)));
    if (!source) return [];
    return [{
      id: `owned-${property.id}`,
      source,
      title: property.title,
      url: property.sourceUrl || property.listingUrl || "#",
      city: property.city,
      district: property.district,
      neighborhood: property.neighborhood,
      street: property.projectName || property.neighborhood,
      listingType: property.listingType,
      price: property.price,
      currency: property.currency,
      squareMeters: property.squareMeters,
      rooms: property.rooms,
      status: property.status === "AKTIF" ? "AKTIF" : "PASIF",
      listedAt: property.syncedAt ?? property.createdAt,
    }];
  });
  const marketListings = [...(data.marketListings ?? []), ...ownPropertyListings];
  const trimmedQuery = mapQuery.trim();
  const locationListings = trimmedQuery ? findMarketListings(marketListings, trimmedQuery) : [];
  const modeListings = locationListings.filter((item) => listingMode === "TUMU" || item.listingType === listingMode);
  const activeListings = modeListings;
  const averagePrice = activeListings.length ? Math.round(activeListings.reduce((sum, item) => sum + item.price, 0) / activeListings.length) : 0;
  const averageSqmPrice = activeListings.length ? Math.round(activeListings.reduce((sum, item) => sum + item.price / item.squareMeters, 0) / activeListings.length) : 0;
  const minPrice = activeListings.length ? Math.min(...activeListings.map((item) => item.price)) : 0;
  const maxPrice = activeListings.length ? Math.max(...activeListings.map((item) => item.price)) : 0;
  const zeroSafeMoney = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
  const platformData = marketSources.map((source) => {
    const rows = activeListings.filter((item) => item.source === source);
    return {
      name: marketSourceLabels[source],
      ortalama: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.price, 0) / rows.length) : 0,
      m2: rows.length ? Math.round(rows.reduce((sum, item) => sum + item.price / item.squareMeters, 0) / rows.length) : 0,
      adet: rows.length,
    };
  });
  const mapSearch = trimmedQuery ? `${trimmedQuery} İstanbul` : geoCoords ? `${geoCoords.lat},${geoCoords.lng}` : "İstanbul";
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapSearch)}&z=${geoCoords && !trimmedQuery ? 15 : 12}&output=embed`;

  return (
    <div className="space-y-5">
      <Toolbar>
        <Input className="w-full md:min-w-[320px] md:flex-[1_1_420px]" value={mapQuery} onChange={(event) => setMapQuery(event.target.value)} placeholder="Semt, sokak veya cadde gir" />
        <Select className="w-full md:w-44" value={listingMode} onChange={(event) => setListingMode(event.target.value as "KIRALIK" | "SATILIK" | "TUMU")}>
          <option value="KIRALIK">Kiralık</option>
          <option value="SATILIK">Satılık</option>
          <option value="TUMU">Tümü</option>
        </Select>
        <Button variant="outline" onClick={requestLocation}>
          <MapPin className="h-4 w-4" />
          Konum İzni İste
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(mapSearch)}`, "_blank", "noopener,noreferrer")}
        >
          <MapPin className="h-4 w-4" />
          Maps ile Aç
        </Button>
      </Toolbar>
      <Card className="border-blue-100 bg-[#f7fbff] px-5 py-3 text-sm text-muted-foreground">
        Piyasa analizi API anahtarları girilip izinli ilan verileri çekildiğinde kendi portföylerinize göre çalışır. Şu an sistem sonuç uydurmaz; kayıt yoksa değerler 0 kalır.
      </Card>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Ortalama fiyat" value={zeroSafeMoney(averagePrice)} detail="Kendi ilan verisi" />
        <Metric label="Minimum" value={zeroSafeMoney(minPrice)} detail="En düşük aktif kayıt" />
        <Metric label="Maksimum" value={zeroSafeMoney(maxPrice)} detail="En yüksek aktif kayıt" />
        <Metric label="m² Fiyatı" value={zeroSafeMoney(averageSqmPrice)} detail={`${activeListings.length} platform kaydı`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Platform Ortalama Fiyatları" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformData}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="ortalama" fill="#0f4c91" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Platform m² Ortalaması" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={platformData}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Area type="monotone" dataKey="m2" stroke="#4da3ff" fill="#e8f3ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="relative h-80 bg-[#e8f3ff]">
            <iframe title="Google Maps konum önizleme" src={mapEmbedUrl} className="h-full w-full border-0" loading="lazy" />
            <div className="absolute left-4 top-4 max-w-xs rounded-md border border-blue-100 bg-white/95 p-3 text-sm shadow-sm shadow-blue-950/10">
              <p className="font-semibold text-slate-950">Harita önizleme</p>
              <p className="mt-1 text-xs text-muted-foreground">{geoStatus}</p>
              <p className="mt-1 text-xs text-muted-foreground">Araştırmayı yapan: {user.name}</p>
            </div>
          </div>
        </Card>
        <Card className="divide-y divide-border overflow-hidden">
          <SectionTitle title="Bölgedeki İlanlar" padded />
          {activeListings.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{marketSourceLabels[item.source]} · {item.neighborhood}, {item.street} · {item.rooms} · {item.squareMeters} m²</p>
                <a className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary" href={item.url} target="_blank" rel="noreferrer">
                  İlanı aç
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="shrink-0 text-sm font-semibold text-primary">{money(item.price, item.currency)}</p>
            </div>
          ))}
          {!activeListings.length ? <EmptyState title="Henüz analiz kaydı yok" description="Entegrasyonlarda API bilgileri girilip ilan verileri çekildiğinde bu bölüm kendi portföylerinize göre dolacak." /> : null}
        </Card>
      </div>
    </div>
  );
}

function TeamPage({ user }: { user: User }) {
  const { data } = useCrm();
  if (user.role === "ADMIN") return <PlatformAdminDashboard user={user} />;
  if (!canSeeOffice(user)) return <AccessDenied />;
  const members = officeUsers(data.users);
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {members.map((member) => {
        const activePortfolio = data.properties.filter((item) => item.consultantId === member.id && item.status === "AKTIF").length;
        const openTasks = data.tasks.filter((item) => item.assignedToId === member.id && item.status !== "TAMAMLANDI").length;
        const closedDeals = data.leads.filter((item) => item.consultantId === member.id && item.status === "KAPANDI").length + data.properties.filter((item) => item.consultantId === member.id && ["SATILDI", "KIRALANDI"].includes(item.status)).length;
        return (
          <Card key={member.id} className="p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar user={member} />
                <div>
                  <p className="font-semibold text-slate-950">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{roleLabel(member.role)}</p>
                </div>
              </div>
              <Badge label={member.active ? "AKTIF" : "PASIF"} />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <InfoBox label="Portföy" value={activePortfolio.toString()} />
              <InfoBox label="Açık görev" value={openTasks.toString()} />
              <InfoBox label="Kapanan" value={closedDeals.toString()} />
            </div>
            <div className="mt-5 rounded-md border border-border bg-slate-50 p-3 text-sm text-muted-foreground">
              {member.role === "OFFICE_MANAGER" ? "Ofis sahibi olarak tüm ekip, görev ve operasyon kontrolü." : "Atanmış müşteri, portföy ve görev takibi."}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DocumentsPage({ user }: { user: User }) {
  const { data } = useCrm();
  const docs = data.documents.filter((doc) => canSeeOffice(user) || doc.assignedToId === user.id);
  const docTypes = ["TAPU", "YETKI_BELGESI", "KIMLIK", "KIRA_SOZLESMESI", "SATIS_SOZLESMESI", "DEGERLEME"];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {docTypes.map((type) => <Metric key={type} label={humanize(type)} value={docs.filter((doc) => doc.type === type).length.toString()} detail="İlişkili dosya" />)}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Doküman</th>
                <th className="px-5 py-3 font-semibold">Tür</th>
                <th className="px-5 py-3 font-semibold">İlişkili Kayıt</th>
                <th className="px-5 py-3 font-semibold">Sorumlu</th>
                <th className="px-5 py-3 font-semibold">Yükleme</th>
                <th className="px-5 py-3 font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {docs.map((doc) => {
                const related = doc.relatedType === "PROPERTY" ? data.properties.find((item) => item.id === doc.relatedId)?.title : data.leads.find((item) => item.id === doc.relatedId)?.name;
                return (
                  <tr key={doc.id} className="bg-white hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium">{doc.title}</td>
                    <td className="px-5 py-4">{humanize(doc.type)}</td>
                    <td className="px-5 py-4 text-muted-foreground">{related ?? "-"}</td>
                    <td className="px-5 py-4">{data.users.find((item) => item.id === doc.assignedToId)?.name ?? "Atanmadı"}</td>
                    <td className="px-5 py-4">{shortDate(doc.uploadedAt)}</td>
                    <td className="px-5 py-4"><Badge label={doc.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

type IntegrationField = {
  id: string;
  label: string;
  placeholder: string;
  secret?: boolean;
};

type IntegrationFormConfig = {
  key: string;
  name: string;
  status: string;
  scope: string;
  fields: IntegrationField[];
};

const integrationFormConfigs: IntegrationFormConfig[] = [
  {
    key: "sahibinden",
    name: "Sahibinden",
    status: "Kurumsal mağaza bağlantısı",
    scope: "Sadece kendi kurumsal mağaza ve yetkili portföy ilanları",
    fields: [
      { id: "storeUrl", label: "Mağaza linki", placeholder: "https://unitglobal.sahibinden.com/" },
      { id: "apiKey", label: "API anahtarı", placeholder: "Başvuru sonrası girilecek", secret: true },
    ],
  },
  {
    key: "emlakjet",
    name: "Emlakjet",
    status: "Ofis hesabı bağlantısı",
    scope: "İzinli portföy ve lokasyon bazlı emsal verisi",
    fields: [
      { id: "companyId", label: "Ofis / firma kodu", placeholder: "Emlakjet firma kodu" },
      { id: "apiKey", label: "API anahtarı", placeholder: "Emlakjet tarafından verilecek", secret: true },
    ],
  },
  {
    key: "hepsiemlak",
    name: "Hürriyet Emlak / Hepsiemlak",
    status: "Ofis hesabı bağlantısı",
    scope: "İzinli portföy ve lokasyon bazlı emsal verisi",
    fields: [
      { id: "officeCode", label: "Ofis / mağaza kodu", placeholder: "Hürriyet Emlak / Hepsiemlak kodu" },
      { id: "apiKey", label: "API anahtarı", placeholder: "Platform tarafından verilecek", secret: true },
    ],
  },
  {
    key: "calendarInvites",
    name: "Takvim Davet Maili",
    status: "Şirket adına davet e-postası",
    scope: "Randevu, yer gösterimi ve takip görevleri için davetiye maili",
    fields: [
      { id: "fromEmail", label: "Gönderen e-posta", placeholder: "info@unitglobal.com" },
      { id: "mailProviderKey", label: "Mail servis anahtarı", placeholder: "Canlı mail servisi bağlanınca girilecek", secret: true },
    ],
  },
];

function IntegrationsPage() {
  const { data } = useCrm();
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("unit-crm-integration-drafts");
      if (saved) setDrafts(JSON.parse(saved));
    } catch {
      window.localStorage.removeItem("unit-crm-integration-drafts");
    }
  }, []);
  const updateDraft = (integrationKey: string, fieldId: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [integrationKey]: {
        ...(current[integrationKey] ?? {}),
        [fieldId]: value,
      },
    }));
  };
  const saveIntegration = (integrationKey: string, integrationName: string) => {
    const next = { ...drafts };
    window.localStorage.setItem("unit-crm-integration-drafts", JSON.stringify(next));
    toast.success(`${integrationName} erişim bilgileri kaydedildi`);
  };
  const hasAnyValue = (integrationKey: string) => Object.values(drafts[integrationKey] ?? {}).some((value) => value.trim().length > 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        {integrationFormConfigs.map((integration) => {
          const ready = hasAnyValue(integration.key);
          const badgeLabel = ready ? "Hazır" : "Form";
          const statusLabel = ready ? "Bağlantı bilgisi hazır" : "Bağlantı bekleniyor";

          return (
            <Card key={integration.key} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{integration.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{integration.status}</p>
                </div>
                <Badge label={badgeLabel} />
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <InfoRow label="Veri kapsamı" value={integration.scope} />
                <InfoRow label="Durum" value={statusLabel} />
                <InfoRow label="Scraping" value="Yok" />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {integration.fields.map((field) => (
                  <Field key={field.id} label={field.label}>
                    <Input
                      type={field.secret ? "password" : "text"}
                      value={drafts[integration.key]?.[field.id] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) => updateDraft(integration.key, field.id, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => saveIntegration(integration.key, integration.name)}>Bilgileri Kaydet</Button>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="p-5">
        <SectionTitle title="Uyum Notu" />
        <p className="text-sm leading-6 text-muted-foreground">
          Sahibinden, Emlakjet ve Hürriyet Emlak / Hepsiemlak için canlı scraping, captcha/proxy bypass veya izinsiz genel ilan çekimi yoktur. Yapı yalnızca firma sahibinin girdiği izinli API erişimleriyle çalışacak şekilde hazırlanmıştır. Son Sahibinden demo senkronizasyonu: {data.setting.lastSahibindenSyncAt ? shortDate(data.setting.lastSahibindenSyncAt) : "Henüz yok"}.
        </p>
      </Card>
    </div>
  );
}

function AuditLogPanel({ data, user }: { data: CrmData; user: User }) {
  const [actionFilter, setActionFilter] = useState("ALL");
  const [userFilter, setUserFilter] = useState("ALL");
  const [customerFilter, setCustomerFilter] = useState("");
  const [ipFilter, setIpFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  if (user.role === "CONSULTANT") return null;

  const actions = Array.from(new Set(data.auditLogs.map((entry) => entry.action))).sort();
  const filteredLogs = data.auditLogs.filter((entry) => {
    const customer = data.leads.find((lead) => lead.id === entry.targetCustomerId);
    const customerText = `${entry.targetCustomerId ?? ""} ${customer?.name ?? ""} ${customer?.propertyOwner ?? ""}`.toLocaleLowerCase("tr");
    const created = new Date(entry.createdAt).getTime();
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null;
    return (
      (actionFilter === "ALL" || entry.action === actionFilter) &&
      (userFilter === "ALL" || entry.userId === userFilter) &&
      (!customerFilter.trim() || customerText.includes(customerFilter.toLocaleLowerCase("tr").trim())) &&
      (!ipFilter.trim() || (entry.ipAddress ?? "").includes(ipFilter.trim())) &&
      (statusFilter === "ALL" || String(entry.statusCode) === statusFilter) &&
      (!start || created >= start) &&
      (!end || created <= end)
    );
  });

  return (
    <Card className="overflow-hidden">
      <SectionTitle title="Güvenlik Kayıtları" action={<Badge label={`${filteredLogs.length} kayıt`} />} padded />
      <div className="grid gap-3 border-y border-border bg-slate-50 p-4 md:grid-cols-3 xl:grid-cols-6">
        <Select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
          <option value="ALL">Kullanıcı: Tümü</option>
          {data.users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="ALL">İşlem: Tümü</option>
          {actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </Select>
        <Input value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} placeholder="Müşteri ara" />
        <Input value={ipFilter} onChange={(event) => setIpFilter(event.target.value)} placeholder="IP" />
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">Status: Tümü</option>
          <option value="200">200</option>
          <option value="403">403</option>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead className="sticky top-0 bg-white text-left uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-border px-4 py-3 font-semibold">Tarih</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Kullanıcı</th>
              <th className="border-b border-border px-4 py-3 font-semibold">İşlem</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Müşteri</th>
              <th className="border-b border-border px-4 py-3 font-semibold">IP</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredLogs.slice(0, 100).map((entry) => {
              const actor = data.users.find((item) => item.id === entry.userId);
              const customer = data.leads.find((lead) => lead.id === entry.targetCustomerId);
              return (
                <tr key={entry.id} className={entry.statusCode >= 400 ? "bg-red-50/70" : "bg-white hover:bg-slate-50"}>
                  <td className="px-4 py-3">{shortDate(entry.createdAt)}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">{actor?.name ?? entry.userId}</td>
                  <td className="px-4 py-3"><Badge label={entry.action} /></td>
                  <td className="px-4 py-3">{customer?.propertyOwner || customer?.name || entry.targetCustomerId || "-"}</td>
                  <td className="px-4 py-3 font-mono">{entry.ipAddress ?? "-"}</td>
                  <td className="px-4 py-3">{entry.statusCode}</td>
                </tr>
              );
            })}
            {!filteredLogs.length ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={6}>Güvenlik kaydı bulunamadı.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SettingsPage({ user }: { user: User }) {
  const { data, addUser, updateUser, deleteUser, upsertClient } = useCrm();
  const isPlatform = user.role === "ADMIN";
  const members = officeUsers(data.users);
  const activeClient = clientForUser(data, user);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [officeInviteEmail, setOfficeInviteEmail] = useState(inviteFromEmailForClient(activeClient));
  const remainingSlots = Math.max(OFFICE_USER_LIMIT - members.length, 0);
  useEffect(() => {
    setOfficeInviteEmail(inviteFromEmailForClient(activeClient));
  }, [activeClient]);
  const saveOfficeInviteEmail = () => {
    const email = officeInviteEmail.trim().toLowerCase();
    if (!activeClient || !isValidEmail(email)) {
      toast.error("Geçerli bir ofis davet e-postası gir.");
      return;
    }
    upsertClient({ ...activeClient, inviteFromEmail: email });
  };
  const saveCalendarEmail = (member: User) => {
    const email = (emailDrafts[member.id] ?? calendarEmailForUser(member)).trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      toast.error("Geçerli bir davet e-postası gir.");
      return;
    }
    const exists = data.users.some((item) => item.id !== member.id && [item.email, calendarEmailForUser(item)].some((candidate) => candidate.toLowerCase() === email));
    if (exists) {
      toast.error("Bu e-posta başka bir kullanıcıda kayıtlı.");
      return;
    }
    updateUser(member.id, { calendarEmail: email });
    setEmailDrafts((current) => {
      const next = { ...current };
      delete next[member.id];
      return next;
    });
  };
  const createUser = () => {
    const email = newUserEmail.trim().toLowerCase();
    const name = newUserName.trim();
    if (!name || !email) {
      toast.error("Kullanıcı adı ve e-posta zorunlu.");
      return;
    }
    if (remainingSlots <= 0) {
      toast.error(`${OFFICE_USER_LIMIT} kullanıcı limiti dolu.`);
      return;
    }
    if (data.users.some((item) => [item.email, calendarEmailForUser(item)].some((candidate) => candidate.toLowerCase() === email))) {
      toast.error("Bu e-posta ile bir kullanıcı zaten var.");
      return;
    }
    addUser({
      name,
      email,
      calendarEmail: email,
      phone: newUserPhone.trim() || "Telefon girilecek",
      role: "CONSULTANT",
      title: "Gayrimenkul Danışmanı",
      clientId: user.clientId ?? data.clients[0]?.id,
    });
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
  };

  if (isPlatform) {
    return (
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <Card className="p-5">
            <SectionTitle title="Platform Ayarları" />
            <div className="grid gap-4 md:grid-cols-3">
              <Metric label="Müşteri ofisi" value={data.clients.length.toString()} detail="Aktif müşteri paneli" />
              <Metric label="Toplam kullanıcı" value={members.length.toString()} detail={`${OFFICE_USER_LIMIT} kullanıcı limitli ofis`} />
              <Metric label="Aktif panel" value="3" detail="Admin, owner, danışman" />
            </div>
            <p className="mt-5 rounded-md border border-blue-100 bg-[#f7fbff] p-4 text-sm leading-6 text-muted-foreground">
              Platform admin tarafı müşteri ofislerini, paketleri ve genel kullanım istatistiklerini yönetir. Unit Global ofis içi kullanıcıları Dorukhan Öründü tarafından kendi panelinden yönetilir.
            </p>
          </Card>
          <Card className="p-5">
            <SectionTitle title="Yetki Modeli" />
            <div className="space-y-3 text-sm">
              <InfoRow label="Platform Admin" value="Müşteri ofisleri ve üyelik paketleri" />
              <InfoRow label="Ofis Sahibi" value={`Owner dahil ${OFFICE_USER_LIMIT} kullanıcıya kadar ekip yönetimi`} />
              <InfoRow label="Danışman" value="Portföy girişi, müşteri takibi ve atanmış görevler" />
            </div>
          </Card>
        </div>
        <AuditLogPanel data={data} user={user} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <SectionTitle title="Ekibine Kullanıcı Ekle" action={<Badge label={`${members.length}/${OFFICE_USER_LIMIT}`} />} />
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Owner dahil toplam {OFFICE_USER_LIMIT} kullanıcı hakkı var. Kalan hak: {remainingSlots}. Danışmanlar portföy, müşteri ve görev girişlerini kendi panelinden yapar.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-5">
          <Field label="Ad soyad"><Input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="Örn: Yeni Danışman" /></Field>
          <Field label="E-posta"><Input value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="danisman@unitglobal.com" /></Field>
          <Field label="Telefon"><Input value={newUserPhone} onChange={(event) => setNewUserPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" /></Field>
          <Field label="Ofis davet e-postası"><Input type="email" value={officeInviteEmail} onChange={(event) => setOfficeInviteEmail(event.target.value)} placeholder="info@unitglobal.com" /></Field>
          <Field label="Rol">
            <Select value="CONSULTANT" disabled>
              <option value="CONSULTANT">Danışman</option>
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button className="sm:w-auto" onClick={createUser} disabled={remainingSlots <= 0}>
            <Plus className="h-4 w-4" />
            Kullanıcı Ekle
          </Button>
          <Button className="sm:w-auto" variant="outline" onClick={saveOfficeInviteEmail}>
            Ofis Davet E-postasını Kaydet
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <InfoBox label="Kullanıcı limiti" value={`${members.length}/${OFFICE_USER_LIMIT}`} />
        <InfoBox label="Aktif danışman" value={members.filter((member) => member.role === "CONSULTANT" && member.active).length.toString()} />
        <InfoBox label="Kalan hak" value={remainingSlots.toString()} />
      </div>

      <Card className="overflow-hidden">
        <SectionTitle title="Ekip Kullanıcıları" padded />
        <div className="divide-y divide-border">
          {members.map((member) => (
            <div key={member.id} className="grid gap-4 bg-white p-5 xl:grid-cols-[1.1fr_1.4fr_0.7fr_0.8fr_auto] xl:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={member} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Giriş: {member.email}</p>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Input
                  className="min-w-0"
                  type="email"
                  value={emailDrafts[member.id] ?? calendarEmailForUser(member)}
                  onChange={(event) => setEmailDrafts((current) => ({ ...current, [member.id]: event.target.value }))}
                />
                <Button className="shrink-0" size="sm" variant="outline" onClick={() => saveCalendarEmail(member)}>
                  Kaydet
                </Button>
              </div>
              <div className="text-sm text-slate-700">{roleLabel(member.role)}</div>
              <div className="text-sm text-muted-foreground">{member.phone}</div>
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <Badge label={member.active ? "Aktif" : "Pasif"} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={member.role === "OFFICE_MANAGER"}
                  onClick={() => updateUser(member.id, { active: !member.active })}
                >
                  {member.active ? "Pasifleştir" : "Aktifleştir"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={member.role === "OFFICE_MANAGER"}
                  onClick={() => {
                    if (window.confirm(`${member.name} silinsin mi? Bağlı kayıtlar ofis sahibine devredilecek.`)) {
                      deleteUser(member.id, user.id);
                    }
                  }}
                >
                  Sil
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AuditLogPanel data={data} user={user} />
    </div>
  );
}
