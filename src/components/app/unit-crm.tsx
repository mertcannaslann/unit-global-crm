"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Columns3,
  CalendarDays,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
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
import type { Lead, MarketListing, Property, User } from "@/lib/types";

type CrmAppProps = {
  slug: string[];
};

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

function workspaceName(user: User) {
  return user.role === "ADMIN" ? "Unit CRM" : "Unit Global";
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MobileTopbar onMenu={() => setSidebarOpen(true)} user={user} />
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-border bg-white px-4 py-4 lg:block">
          <Sidebar user={user} currentPath={currentPath} nav={visibleNav} />
        </aside>

        <AnimatePresence>
          {sidebarOpen ? (
            <motion.div className="fixed inset-0 z-50 bg-slate-950/25 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.aside
                className="h-full w-80 bg-white p-4"
                initial={{ x: -340 }}
                animate={{ x: 0 }}
                exit={{ x: -340 }}
                transition={{ type: "spring", damping: 24, stiffness: 220 }}
              >
                <button className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted" onClick={() => setSidebarOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
                <Sidebar user={user} currentPath={currentPath} nav={visibleNav} onNavigate={() => setSidebarOpen(false)} />
              </motion.aside>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="min-w-0 flex-1 px-4 py-5 md:px-7 lg:px-8">
          <PageHeader slug={slug} user={user} />
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

function MobileTopbar({ onMenu, user }: { onMenu: () => void; user: User }) {
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
      <Button variant="ghost" size="icon" onClick={onMenu}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Building2 className="h-4 w-4 text-primary" />
        {workspaceName(user)}
      </div>
      <Avatar user={user} />
    </div>
  );
}

function Sidebar({ user, currentPath, nav, onNavigate }: { user: User; currentPath: string; nav: typeof navItems; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-7 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-base font-semibold">{workspaceName(user)}</p>
          <p className="text-xs text-muted-foreground">{workspaceSubtitle(user)}</p>
        </div>
      </div>

      <nav className="space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href || currentPath.startsWith(`${item.href}/`);
          return (
            <Link
              href={item.href}
              key={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                active ? "bg-slate-100 text-slate-950" : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-slate-400"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar user={user} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel(user.role)}</p>
          </div>
        </div>
        <Button className="mt-3 w-full justify-start" variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: User }) {
  return <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${user.avatarColor} text-xs font-semibold text-white`}>{initials(user.name)}</div>;
}

function PageHeader({ slug, user }: { slug: string[]; user: User }) {
  const { data, markNotificationRead } = useCrm();
  const [notificationOpen, setNotificationOpen] = useState(false);
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
  const visibleNotifications = data.notifications
    .filter((item) => !item.targetUserId || canSeeOffice(user) || item.targetUserId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = visibleNotifications.filter((item) => item.status === "OKUNMADI").length;

  return (
    <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{workspaceName(user)} · {roleLabel(user.role)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-md border border-border bg-white px-3 py-2 text-sm text-muted-foreground">Bugün: {todayLabel}</div>
        <div className="relative">
          <Button
            className="relative bg-white text-slate-700 hover:bg-[#f3f8ff] hover:text-primary"
            variant="outline"
            onClick={() => setNotificationOpen((open) => !open)}
            aria-label="Bildirimler"
          >
            <Bell className="h-4 w-4" />
            Bildirimler
            {unreadCount ? (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white">
                {unreadCount}
              </span>
            ) : null}
          </Button>
          {notificationOpen ? (
            <Card className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden shadow-xl shadow-blue-950/10">
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
                    onClick={() => markNotificationRead(notification.id)}
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
  const { data } = useCrm();
  const [officeName, setOfficeName] = useState("Unit Global");
  const [ownerName, setOwnerName] = useState("Dorukhan Öründü");
  const [ownerEmail, setOwnerEmail] = useState("dorukhan@unitglobal.com");
  const [consultantCount, setConsultantCount] = useState(1);
  const officeMemberList = officeUsers(data.users);
  const [generatedAccounts, setGeneratedAccounts] = useState([
    { role: "Ofis Sahibi", name: "Dorukhan Öründü", email: "dorukhan@unitglobal.com", password: "Owner123!" },
    { role: "Danışman", name: "Kaan Öründü", email: "kaan@unitglobal.com", password: "Consultant123!" },
  ]);
  const offices = [
    {
      id: "office-unit-global",
      name: "Unit Global",
      owner: data.users.find((item) => item.role === "OFFICE_MANAGER")?.name ?? "Dorukhan Öründü",
      status: "Hazır",
      users: officeMemberList.length,
      userLimit: OFFICE_USER_LIMIT,
      properties: data.properties.length,
      leads: data.leads.length,
    },
  ];
  const slug = officeName.toLocaleLowerCase("tr").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "").slice(0, 18) || "ofis";

  function generateOfficeAccounts() {
    const maxConsultants = OFFICE_USER_LIMIT - 1;
    const count = Math.max(1, Math.min(maxConsultants, consultantCount));
    const accounts = [
      {
        role: "Ofis Sahibi",
        name: ownerName || "Ofis Sahibi",
        email: ownerEmail || `owner@${slug}.com`,
        password: `${slug}Owner1!`,
      },
      ...Array.from({ length: count }).map((_, index) => ({
        role: "Danışman",
        name: `Danışman ${index + 1}`,
        email: `danisman${index + 1}@${slug}.crm`,
        password: `${slug}D${index + 1}!`,
      })),
    ];
    setGeneratedAccounts(accounts);
    toast.success(`${officeName} için ${accounts.length}/${OFFICE_USER_LIMIT} kullanıcı girişi hazırlandı`);
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
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <SectionTitle title="Çalışılan Emlak Ofisleri" padded />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Ofis</th>
                  <th className="px-5 py-3 font-semibold">Owner</th>
                  <th className="px-5 py-3 font-semibold">Kullanıcı</th>
                  <th className="px-5 py-3 font-semibold">Portföy</th>
                  <th className="px-5 py-3 font-semibold">Müşteri</th>
                  <th className="px-5 py-3 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offices.map((office) => (
                  <tr key={office.id} className="bg-white hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium">{office.name}</td>
                    <td className="px-5 py-4">{office.owner}</td>
                    <td className="px-5 py-4">{office.users}/{office.userLimit}</td>
                    <td className="px-5 py-4">{office.properties}</td>
                    <td className="px-5 py-4">{office.leads}</td>
                    <td className="px-5 py-4"><Badge label={office.status} /></td>
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
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  const { data } = useCrm();
  const today = useMemo(() => new Date(), []);
  if (user.role === "ADMIN") return <PlatformAdminDashboard user={user} />;
  const scopedProperties = canSeeOffice(user) ? data.properties : data.properties.filter((item) => item.consultantId === user.id);
  const scopedLeads = canSeeOffice(user) ? data.leads : data.leads.filter((item) => item.consultantId === user.id);
  const scopedTasks = canSeeOffice(user) ? data.tasks : data.tasks.filter((item) => item.assignedToId === user.id);
  const todayTasks = scopedTasks.filter((item) => item.status !== "TAMAMLANDI" && sameCalendarDay(item.dueDate, today));
  const appointments = scopedTasks.filter((item) => item.type === "RANDEVU" || item.type === "YER_GOSTERIMI");
  const activeSale = scopedProperties.filter((item) => item.status === "AKTIF" && item.listingType === "SATILIK").length;
  const activeRent = scopedProperties.filter((item) => item.status === "AKTIF" && item.listingType === "KIRALIK").length;
  const monthly = ["Oca", "Şub", "Mar", "Nis", "May", "Haz"].map((month, index) => ({
    month,
    portfoy: scopedProperties.length ? 1 + index : 0,
    lead: scopedLeads.length ? 2 + index : 0,
    aksiyon: scopedTasks.length ? index + 1 : 0,
  }));
  const statusData = statusOptions.map((status) => ({ name: status, value: scopedProperties.filter((item) => item.status === status).length }));
  const pipelineData = leadStages.map((stage) => ({ name: humanize(stage), value: scopedLeads.filter((lead) => lead.status === stage).length }));
  const consultantData = data.users.filter((item) => item.role === "CONSULTANT").map((consultant) => ({
    name: consultant.name.split(" ")[0],
    portfoy: data.properties.filter((item) => item.consultantId === consultant.id).length,
    gorev: data.tasks.filter((item) => item.assignedToId === consultant.id && item.status !== "TAMAMLANDI").length,
    kapanan: data.leads.filter((item) => item.consultantId === consultant.id && item.status === "KAPANDI").length,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Aktif portföy" value={scopedProperties.filter((item) => item.status === "AKTIF").length.toString()} detail={`${activeSale} satılık · ${activeRent} kiralık`} />
        <Metric label="Yeni lead" value={scopedLeads.filter((item) => item.status === "YENI_LEAD").length.toString()} detail="İlk temas bekliyor" />
        <Metric label="Bugünkü görev" value={todayTasks.length.toString()} detail="Açık operasyon" />
        <Metric label="Yaklaşan randevu" value={appointments.length.toString()} detail="Randevu / yer gösterimi" />
        <Metric label="Bekleyen evrak" value={data.documents.filter((item) => item.status !== "TAMAM").length.toString()} detail="Doküman takibi" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="p-5">
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

        <Card className="p-5">
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

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card className="p-5">
          <SectionTitle title="Lead Pipeline" action={<Link href="/musteriler">Leadleri Gör</Link>} />
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
            {pipelineData.map((stage) => (
              <div key={stage.name} className="rounded-md border border-border bg-white p-3">
                <p className="text-xs text-muted-foreground">{stage.name}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{stage.value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
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

      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <Card className="overflow-hidden">
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

        <Card className="p-5">
          <SectionTitle title="Bekleyen İşler" action={`${scopedTasks.filter((item) => item.status !== "TAMAMLANDI").length} açık`} />
          <div className="space-y-3">
            {scopedTasks.slice(0, 6).map((task) => (
              <div key={task.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                <CheckCircle2 className={`mt-0.5 h-4 w-4 ${task.status === "TAMAMLANDI" ? "text-success" : "text-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{shortDate(task.dueDate)} teslim</p>
                </div>
                <Badge label={task.status} />
              </div>
            ))}
            {!scopedTasks.length ? <EmptyState title="Henüz görev yok" description="Görevler oluşturuldukça burada görünecek." /> : null}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <SectionTitle title="Son Aktiviteler" padded />
        <div className="divide-y divide-border">
          {data.activityLogs.slice(0, 5).map((log) => (
            <div key={log.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{log.action}</span>
              <span className="text-xs text-muted-foreground">{shortDate(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </Card>
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
    <div className={`mb-4 flex items-center justify-between gap-3 ${padded ? "border-b border-border px-5 py-4" : ""}`}>
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {action ? <div className="text-sm font-medium text-primary">{action}</div> : null}
    </div>
  );
}

function PropertyRow({ property, consultant }: { property: Property; consultant?: User }) {
  return (
    <Link href={`/portfoyler/${property.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-muted/60">
      <Image src={property.coverImage} alt={property.title} width={80} height={64} className="h-16 w-20 shrink-0 rounded-md object-cover" />
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
  return (
    <Link href={`/portfoyler/${property.id}`} className="flex items-center gap-3">
      <Image src={property.coverImage} alt={property.title} width={64} height={48} className="h-12 w-16 rounded-md object-cover" />
      <div>
        <p className="font-medium">{property.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{property.rooms} · {property.squareMeters} m²</p>
      </div>
    </Link>
  );
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
            <Image src={property.coverImage} alt={property.title} fill sizes="(min-width: 1280px) 55vw, 100vw" className="object-cover" />
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
              <div key={`${image}-${index}`} className="relative h-32 overflow-hidden rounded-md border border-border">
                <Image src={image} alt={`${property.title} fotoğraf ${index + 1}`} fill sizes="220px" className="object-cover" />
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
  const form = useForm({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      title: property?.title ?? "Kaynak linki ile eklenen portföy",
      listingType: property?.listingType ?? "KIRALIK",
      price: property?.price ?? 0,
      currency: property?.currency ?? "TRY",
      district: property?.district ?? "İstanbul",
      neighborhood: property?.neighborhood ?? "Belirlenecek",
      squareMeters: property?.squareMeters ?? 20,
      rooms: property?.rooms ?? "1+1",
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
  const isManual = sourcePlatform === "Manuel";
  const [sourcePreview, setSourcePreview] = useState<ListingPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "empty">("idle");

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
  }, [isManual, sourcePlatform, sourceUrl]);

  if (propertyId && !property) return <Card className="p-8">Portföy bulunamadı.</Card>;
  if (!canManagePortfolio(user, property)) return <AccessDenied />;

  return (
    <Card className="p-5">
      <SectionTitle title={property ? "Portföy Düzenle" : "Portföy Ekle"} action="Tek giriş noktası" />
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          const sourceUrl = values.sourceUrl || values.listingUrl || "";
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
              sourceType: sourcePreview.sourceType,
              syncedAt: new Date().toISOString(),
            } : {}),
            title,
            listingUrl: sourceUrl,
            sourceUrl,
            syncStatus: "MANUAL" as const,
            sourceType: isManual ? "MANUAL" as const : sourcePreview?.sourceType ?? values.sourceType,
          };
          if (property) {
            updateProperty(property.id, payload as Partial<Property>);
            router.push(`/portfoyler/${property.id}`);
          } else {
            const id = addProperty(payload as Parameters<typeof addProperty>[0]);
            router.push(`/portfoyler/${id}`);
          }
        })}
      >
        <div className="md:col-span-2 rounded-lg border border-blue-100 bg-[#f3f8ff] p-4">
          <p className="text-sm font-semibold text-primary">İlan kaynağı</p>
          <p className="mt-1 text-sm text-muted-foreground">Sahibinden, Emlakjet, Hürriyet Emlak veya Hepsiemlak linkini yapıştır. Ön izleme hazırlanır; resmi API bağlandığında fotoğraf ve bilgiler aynı akıştan güncellenir.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_220px]">
            <Select {...form.register("sourcePlatform")}>
              <option value="Manuel">Manuel</option>
              <option value="Sahibinden">Sahibinden</option>
              <option value="Emlakjet">Emlakjet</option>
              <option value="Hürriyet Emlak">Hürriyet Emlak</option>
              <option value="Hepsiemlak">Hepsiemlak</option>
            </Select>
            <Input placeholder="İlan linki / paylaşım linki" {...form.register("sourceUrl")} />
            <Select {...form.register("sourceType")}>
              <option value="MANUAL">Manuel</option>
              <option value="OWN_LISTING">Kurumsal mağaza</option>
              <option value="AUTHORIZED_PORTFOLIO">Yetkili portföy</option>
            </Select>
          </div>
          {!isManual ? (
            <>
              <div className="mt-3 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs text-muted-foreground">
                Hızlı kaynak kaydı: Başlık, fiyat, m² gibi alanları doldurman gerekmez. Ön izleme gelirse portföy kaydına otomatik yazılır.
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
                <div className="mt-3 rounded-lg border border-blue-100 bg-white p-4 text-sm text-muted-foreground">
                  Bu linkten ön izleme alınamadı. Linki kontrol et veya resmi API bağlantısı aktif olduğunda tekrar dene.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        {isManual ? (
          <>
            <Field label="Başlık" error={form.formState.errors.title?.message}><Input {...form.register("title")} /></Field>
            <Field label="Satılık / Kiralık"><Select {...form.register("listingType")}><option value="SATILIK">SATILIK</option><option value="KIRALIK">KIRALIK</option></Select></Field>
            <Field label="Fiyat" error={form.formState.errors.price?.message}><Input type="number" {...form.register("price")} /></Field>
            <Field label="Para birimi"><Select {...form.register("currency")}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option></Select></Field>
            <Field label="İlçe" error={form.formState.errors.district?.message}><Input {...form.register("district")} /></Field>
            <Field label="Mahalle" error={form.formState.errors.neighborhood?.message}><Input {...form.register("neighborhood")} /></Field>
            <Field label="Metrekare" error={form.formState.errors.squareMeters?.message}><Input type="number" {...form.register("squareMeters")} /></Field>
            <Field label="Oda sayısı"><Input {...form.register("rooms")} /></Field>
          </>
        ) : null}
        <input type="hidden" {...form.register("consultantId")} />
        <Field label="Danışman">
          <InfoBox label="Portföy sahibi" value={consultants.find((item) => item.id === defaultConsultantId)?.name ?? user.name} />
        </Field>
        <Field label="Durum"><Select {...form.register("status")}>{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
        <div className="md:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/portfoyler")}>Vazgeç</Button>
          <Button type="submit">Kaydet</Button>
        </div>
      </form>
    </Card>
  );
}

function ListingPreviewCard({ preview }: { preview: ListingPreview }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
      <div className="grid gap-0 md:grid-cols-[220px_1fr]">
        <div className="relative h-44 md:h-full">
          <Image src={preview.coverImage} alt={preview.title} fill sizes="220px" className="object-cover" />
        </div>
        <div className="p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge label={preview.sourcePlatform} />
                <Badge label={preview.confidence === "KNOWN_LISTING" ? "Ön izleme hazır" : "URL ön izleme"} />
              </div>
              <p className="mt-3 text-base font-semibold text-slate-950">{preview.title}</p>
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
              <div key={`${image}-${index}`} className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md border border-border">
                <Image src={image} alt={`${preview.title} fotoğraf ${index + 1}`} fill sizes="80px" className="object-cover" />
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

type LeadImportPayload = Omit<Lead, "id" | "createdAt" | "status" | "notes">;

function parseLeadImport(text: string, consultantId: string): LeadImportPayload[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
  const header = rows[0].map(normalizeHeader);
  const hasHeader = header.some((cell) => ["ad", "adsoyad", "musteri", "telefon", "phone"].includes(cell));
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const findIndex = (keys: string[]) => keys.map((key) => header.indexOf(key)).find((index) => index !== -1) ?? -1;
  const indexMap = {
    name: hasHeader ? findIndex(["adsoyad", "ad", "musteri", "isim", "name"]) : 0,
    phone: hasHeader ? findIndex(["telefon", "phone", "gsm", "tel"]) : 1,
    email: hasHeader ? findIndex(["email", "eposta", "mail"]) : 2,
    source: hasHeader ? findIndex(["kaynak", "source"]) : 3,
    budget: hasHeader ? findIndex(["butce", "budget", "bütçe"]) : 4,
    interest: hasHeader ? findIndex(["ilgi", "interest", "talep", "not"]) : 5,
  };

  return bodyRows
    .map((row, index) => ({
      name: valueAt(row, indexMap.name) || `No Name ${index + 1}`,
      phone: valueAt(row, indexMap.phone),
      email: valueAt(row, indexMap.email),
      source: valueAt(row, indexMap.source) || "Excel aktarımı",
      budget: parseBudget(valueAt(row, indexMap.budget)),
      interest: valueAt(row, indexMap.interest) || "Genel portföy ilgisi",
      consultantId,
    }))
    .filter((lead) => lead.name.trim() && lead.phone.trim());
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

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase("tr").replace(/[ğ]/g, "g").replace(/[ü]/g, "u").replace(/[ş]/g, "s").replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ç]/g, "c").replace(/[^a-z0-9]/g, "");
}

function valueAt(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() ?? "" : "";
}

function parseBudget(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function LeadsPage({ user }: { user: User }) {
  const { data, addLead, importLeads, addLeadAction, updateLead } = useCrm();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const firstConsultantId = data.users.find((item) => item.role === "CONSULTANT")?.id ?? user.id;
  const form = useForm({ resolver: zodResolver(leadSchema), defaultValues: { name: "", email: "", phone: "", source: "Web Form", budget: 15000000, interest: "Bebek premium portföy", consultantId: canManageOffice(user) ? firstConsultantId : user.id } });
  const leads = data.leads.filter((lead) => (canSeeOffice(user) || lead.consultantId === user.id) && `${lead.name} ${lead.interest}`.toLowerCase().includes(query.toLowerCase()));
  const consultants = data.users.filter((item) => item.role === "CONSULTANT");
  const pipeline = leadStages.map((stage) => ({ stage, count: leads.filter((lead) => lead.status === stage).length }));

  async function handleLeadImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      toast.error("Şimdilik Excel dosyasını CSV olarak dışa aktar ve yükle.");
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const imported = parseLeadImport(text, canManageOffice(user) ? firstConsultantId : user.id);
      importLeads(imported, file.name);
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
              <input className="hidden" type="file" accept=".csv,.tsv,.txt" onChange={handleLeadImport} />
            </label>
            <div className="flex gap-2 rounded-md border border-blue-100 bg-white px-3 py-2 text-xs leading-5 text-muted-foreground">
              <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Excel dosyanı CSV olarak dışa aktar. Kolonlar: ad soyad, telefon, e-posta, kaynak, bütçe, ilgi.</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
              {pipeline.map((item) => (
                <div key={item.stage} className="rounded-md border border-border bg-white p-3">
                  <p className="text-xs text-muted-foreground">{humanize(item.stage)}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{item.count}</p>
                </div>
              ))}
            </div>
          </Card>
          <Toolbar>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Müşteri, telefon, ilgi alanı ara" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <Badge label={`${leads.length} kayıt`} />
          </Toolbar>
          <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-[#e8f3ff] text-left text-xs uppercase tracking-wide text-primary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Müşteri</th>
                  <th className="px-4 py-3 font-semibold">Telefon</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Kaynak</th>
                  <th className="px-4 py-3 font-semibold">İlgi</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Bütçe</th>
                  <th className="hidden px-4 py-3 font-semibold xl:table-cell">Danışman</th>
                  <th className="px-4 py-3 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="cursor-pointer bg-white transition hover:bg-[#f3f8ff]" onClick={() => setSelectedLead(lead)}>
                    <td className="px-4 py-3 font-medium"><Link href={`/musteriler/${lead.id}`}>{lead.name}</Link></td>
                    <td className="px-4 py-3">{lead.phone}</td>
                    <td className="hidden px-4 py-3 md:table-cell">{lead.source}</td>
                    <td className="px-4 py-3">{lead.interest}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">{money(lead.budget)}</td>
                    <td className="hidden px-4 py-3 xl:table-cell">{data.users.find((item) => item.id === lead.consultantId)?.name ?? "-"}</td>
                    <td className="px-4 py-3"><Badge label={lead.status} /></td>
                  </tr>
                ))}
                {!leads.length ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={7}>Müşteri kaydı bulunamadı.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
        <div className="space-y-5">
        <Card className="p-5">
          <SectionTitle title="Hızlı Müşteri Ekle" action={<Badge label="Yeni" />} />
          <form
            className="space-y-3"
            onSubmit={form.handleSubmit((values) => {
              addLead(values as Parameters<typeof addLead>[0]);
              form.reset({ name: "", email: "", phone: "", source: "Web Form", budget: 15000000, interest: "Bebek premium portföy", consultantId: canManageOffice(user) ? firstConsultantId : user.id });
            })}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Input placeholder="Ad soyad" {...form.register("name")} />
              <Input placeholder="Telefon" {...form.register("phone")} />
            </div>
            <Input placeholder="E-posta" {...form.register("email")} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Input placeholder="Kaynak" {...form.register("source")} />
              <Input type="number" placeholder="Bütçe" {...form.register("budget")} />
            </div>
            <Input placeholder="İlgi alanı" {...form.register("interest")} />
            {canManageOffice(user) ? <Select {...form.register("consultantId")}>{consultants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select> : null}
            <Button className="w-full" type="submit">
              <Plus className="h-4 w-4" />
              Müşteri Kaydet
            </Button>
          </form>
        </Card>
        {selectedLead ? (
          <Card className="p-5">
            <SectionTitle title={selectedLead.name} action={<Badge label={selectedLead.status} />} />
            <p className="text-sm text-muted-foreground">{selectedLead.notes}</p>
            <Textarea className="mt-4" placeholder="Lead aksiyonu / not ekle" value={note} onChange={(event) => setNote(event.target.value)} />
            <div className="mt-3 flex gap-2">
              <Button onClick={() => { addLeadAction(selectedLead.id, user.id, note || "Danışman notu eklendi."); setNote(""); }}>Not Ekle</Button>
              <Button variant="outline" onClick={() => updateLead(selectedLead.id, { status: "TEKLIF_VERILDI" })}>Teklife Al</Button>
            </div>
          </Card>
        ) : null}
        {!selectedLead ? (
          <Card className="border-blue-100 bg-[#f7fbff] p-5">
            <SectionTitle title="Seçili Müşteri" />
            <p className="text-sm leading-6 text-muted-foreground">Tablodan bir müşteriye tıklayınca arama notu, teklif durumu ve danışman aksiyonları burada açılır.</p>
          </Card>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function LeadDetail({ user, leadId }: { user: User; leadId: string }) {
  const { data, updateLead, addLeadAction } = useCrm();
  const [note, setNote] = useState("");
  const lead = data.leads.find((item) => item.id === leadId);
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
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">{lead.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{lead.phone} · {lead.email}</p>
            </div>
            <Select className="md:w-56" value={lead.status} onChange={(event) => updateLead(lead.id, { status: event.target.value as Lead["status"] })}>
              {leadStages.map((stage) => <option key={stage} value={stage}>{humanize(stage)}</option>)}
            </Select>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <InfoBox label="Bütçe" value={money(lead.budget)} />
            <InfoBox label="Aradığı bölge" value={lead.preferredLocation ?? lead.interest} />
            <InfoBox label="Mülk tipi" value={lead.propertyType ?? "Konut"} />
            <InfoBox label="Danışman" value={consultant?.name ?? "Atanmadı"} />
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
            <Button onClick={() => { addLeadAction(lead.id, user.id, note || "Görüşme notu eklendi."); setNote(""); }}>Not Ekle</Button>
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
  const { data, updateTask } = useCrm();
  const [view, setView] = useState<"TABLE" | "KANBAN">("TABLE");
  const tasks = data.tasks.filter((task) => canSeeOffice(user) || task.assignedToId === user.id);
  const columns = ["ACIK", "DEVAM", "TAMAMLANDI"] as const;

  return (
    <div className="space-y-5">
      <Toolbar>
        <Button variant={view === "TABLE" ? "default" : "outline"} onClick={() => setView("TABLE")}>
          <ClipboardList className="h-4 w-4" />
          Tablo
        </Button>
        <Button variant={view === "KANBAN" ? "default" : "outline"} onClick={() => setView("KANBAN")}>
          <Columns3 className="h-4 w-4" />
          Kanban
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">{tasks.length} görev</div>
      </Toolbar>

      {view === "TABLE" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Görev</th>
                  <th className="px-5 py-3 font-semibold">Tür</th>
                  <th className="px-5 py-3 font-semibold">Atanan</th>
                  <th className="px-5 py-3 font-semibold">Öncelik</th>
                  <th className="px-5 py-3 font-semibold">Tarih</th>
                  <th className="px-5 py-3 font-semibold">Bağlı Kayıt</th>
                  <th className="px-5 py-3 font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tasks.map((task) => {
                  const lead = data.leads.find((item) => item.id === task.leadId);
                  const property = data.properties.find((item) => item.id === task.propertyId);
                  return (
                    <tr key={task.id} className="bg-white hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium">{task.title}</td>
                      <td className="px-5 py-4">{humanize(task.type)}</td>
                      <td className="px-5 py-4">{data.users.find((item) => item.id === task.assignedToId)?.name ?? "Atanmadı"}</td>
                      <td className="px-5 py-4"><Badge label={task.priority} /></td>
                      <td className="px-5 py-4">{shortDate(task.dueDate)}</td>
                      <td className="px-5 py-4 text-muted-foreground">{lead?.name ?? property?.title ?? "-"}</td>
                      <td className="px-5 py-4">
                        <Select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as typeof task.status })}>
                          {columns.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {columns.map((column) => (
            <Card key={column} className="min-h-[520px] p-4">
              <SectionTitle title={humanize(column)} action={tasks.filter((task) => task.status === column).length} />
              <div className="space-y-3">
                {tasks.filter((task) => task.status === column).map((task) => (
                  <div key={task.id} className="rounded-md border border-border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{task.title}</p>
                      <Badge label={task.priority} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{humanize(task.type)} · {shortDate(task.dueDate)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{data.users.find((item) => item.id === task.assignedToId)?.name ?? "Atanmadı"}</p>
                    <div className="mt-3 flex gap-2">
                      {column !== "DEVAM" ? <Button size="sm" variant="outline" onClick={() => updateTask(task.id, { status: "DEVAM" })}>Devam</Button> : null}
                      {column !== "TAMAMLANDI" ? <Button size="sm" onClick={() => updateTask(task.id, { status: "TAMAMLANDI" })}>Tamamla</Button> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
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
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const assignees = canManageOffice(user) ? data.users.filter((item) => item.active && item.role !== "ADMIN") : [user];
  const [assignedToId, setAssignedToId] = useState(assignees[0]?.id ?? user.id);
  const tasks = data.tasks.filter((task) => canSeeOffice(user) || task.assignedToId === user.id);
  const weekdays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const firstOffset = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarCells = [...Array.from({ length: firstOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
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

    const [hour = "10", minute = "00"] = time.split(":");
    const start = new Date(calendarYear, calendarMonth, selectedDay, Number(hour), Number(minute));
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const taskPayload = {
      title: title.trim(),
      description: description.trim() || "Takvimden oluşturuldu.",
      type: "RANDEVU" as const,
      dueDate: start.toISOString(),
      endDate: end.toISOString(),
      location: location.trim(),
      reminderMinutes,
      priority: "ORTA" as const,
      assignedToId: assignedUser.id,
      createdById: user.id,
    };
    const id = addTask(taskPayload);
    setTitle("");
    setDescription("");
    setLocation("");

    try {
      const response = await fetch("/api/google-calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: { id, ...taskPayload }, attendeeEmail: assignedUser.email }),
      });
      const result = await response.json() as { connected?: boolean; eventId?: string; htmlLink?: string; responseStatus?: string; error?: string };

      if (response.status === 409) {
        toast.info("Görev CRM'e eklendi. Google daveti için danışmanın Google hesabını bağlaması gerekiyor.");
        return;
      }

      if (!response.ok) {
        toast.error(result.error ?? "Google Calendar daveti oluşturulamadı.");
        return;
      }

      updateTask(id, {
        googleCalendarEventId: result.eventId,
        googleCalendarHtmlLink: result.htmlLink,
        googleCalendarResponseStatus: result.responseStatus ?? "needsAction",
      });
      toast.success("Google Calendar daveti gönderildi");
    } catch {
      toast.error("Görev eklendi fakat Google Calendar'a ulaşılamadı.");
    }
  };
  const syncGoogleResponses = async () => {
    setCalendarSyncing(true);
    try {
      const response = await fetch("/api/google-calendar/sync", { method: "POST" });
      const result = await response.json() as { connected?: boolean; updates?: Array<{ taskId: string; eventId?: string; htmlLink?: string; responseStatus?: string }> };
      if (response.status === 409) {
        toast.info("Google Takvim bağlantısı bulunamadı.");
        return;
      }
      if (!response.ok) {
        toast.error("Google Takvim yanıtları senkronize edilemedi.");
        return;
      }
      (result.updates ?? []).forEach((item) => updateTask(item.taskId, {
        googleCalendarEventId: item.eventId,
        googleCalendarHtmlLink: item.htmlLink,
        googleCalendarResponseStatus: item.responseStatus,
      }));
      toast.success(`${result.updates?.length ?? 0} takvim yanıtı senkronize edildi`);
    } finally {
      setCalendarSyncing(false);
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
                      {task.googleCalendarResponseStatus ? <Badge label={humanize(task.googleCalendarResponseStatus)} /> : null}
                      {task.googleCalendarHtmlLink ? (
                        <a className="text-xs font-medium text-primary" href={task.googleCalendarHtmlLink} target="_blank" rel="noreferrer">Google event</a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!dayEvents(selectedDay).length ? <p className="rounded-lg border border-dashed border-blue-100 bg-[#f7fbff] p-4 text-sm text-muted-foreground">Bu gün için görev yok.</p> : null}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Takvime Ekle" />
          <div className="space-y-3">
            <Input placeholder="Örn: Bebek yer gösterimi" value={title} onChange={(event) => setTitle(event.target.value)} />
            <Textarea placeholder="Açıklama / müşteri notu" value={description} onChange={(event) => setDescription(event.target.value)} />
            <Input placeholder="Konum: Bebek, İstanbul veya açık adres" value={location} onChange={(event) => setLocation(event.target.value)} />
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
            <Button className="w-full" onClick={createCalendarTask}>Takvime Ekle ve Davet Gönder</Button>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Google Takvim" action={<Badge label="OAuth" />} />
          <p className="text-sm leading-6 text-muted-foreground">Her danışman kendi Google hesabını bağlar. Görev oluşturulunca davet maili Google tarafından gönderilir.</p>
          <div className="mt-4 grid gap-2">
            <Button onClick={() => { window.location.href = "/api/google-calendar/connect"; }}>Google hesabını bağla</Button>
            <Button variant="outline" disabled={calendarSyncing} onClick={syncGoogleResponses}>
              <RefreshCw className={`h-4 w-4 ${calendarSyncing ? "animate-spin" : ""}`} />
              Davet Yanıtlarını Senkronize Et
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
    key: "googleDrive",
    name: "Google Drive",
    status: "Doküman klasörü bağlantısı",
    scope: "Tapu, yetki belgesi, sözleşme ve müşteri dosyaları",
    fields: [
      { id: "folderLink", label: "Drive klasör linki", placeholder: "Paylaşılan Google Drive klasör linki" },
      { id: "connectionCode", label: "Bağlantı kodu", placeholder: "Google bağlantı kodu", secret: true },
    ],
  },
  {
    key: "googleCalendar",
    name: "Google Takvim",
    status: "Randevu senkronizasyonu",
    scope: "Takvim, randevu, yer gösterimi ve takip görevleri",
    fields: [
      { id: "calendarLink", label: "Takvim linki / ID", placeholder: "Google Takvim linki veya Calendar ID" },
      { id: "connectionCode", label: "Bağlantı kodu", placeholder: "Google bağlantı kodu", secret: true },
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
  const testGoogleDrive = () => {
    const drive = drafts.googleDrive ?? {};
    if (!drive.folderLink && !drive.connectionCode) {
      toast.error("Google Drive klasör linkini veya bağlantı kodunu girin.");
      return;
    }
    toast.success("Google Drive klasörü bağlantıya hazır.");
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        {integrationFormConfigs.map((integration) => (
          <Card key={integration.key} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{integration.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{integration.status}</p>
              </div>
              <Badge label={hasAnyValue(integration.key) ? "Hazır" : "Form"} />
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <InfoRow label="Veri kapsamı" value={integration.scope} />
              <InfoRow label="Durum" value={hasAnyValue(integration.key) ? "Bağlantı bilgisi hazır" : "Bağlantı bekleniyor"} />
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
              {integration.key === "googleDrive" ? (
                <>
                  <Button variant="outline" onClick={testGoogleDrive}>Bağlantıyı Test Et</Button>
                  <Button variant="outline" onClick={() => window.open("https://drive.google.com/drive/my-drive", "_blank", "noopener,noreferrer")}>
                    <FolderOpen className="h-4 w-4" />
                    Drive Aç
                  </Button>
                </>
              ) : null}
              {integration.key === "googleCalendar" ? (
                <Button variant="outline" onClick={() => { window.location.href = "/api/google-calendar/connect"; }}>
                  <CalendarDays className="h-4 w-4" />
                  Google OAuth ile Bağla
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
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

function SettingsPage({ user }: { user: User }) {
  const { data, addUser, updateUser, deleteUser } = useCrm();
  const isPlatform = user.role === "ADMIN";
  const members = officeUsers(data.users);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const remainingSlots = Math.max(OFFICE_USER_LIMIT - members.length, 0);
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
    if (data.users.some((item) => item.email.toLowerCase() === email)) {
      toast.error("Bu e-posta ile bir kullanıcı zaten var.");
      return;
    }
    addUser({
      name,
      email,
      phone: newUserPhone.trim() || "Telefon girilecek",
      role: "CONSULTANT",
      title: "Gayrimenkul Danışmanı",
    });
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPhone("");
  };

  if (isPlatform) {
    return (
      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <Card className="p-5">
          <SectionTitle title="Platform Ayarları" />
          <div className="grid gap-4 md:grid-cols-3">
            <Metric label="Müşteri ofisi" value="1" detail="Unit Global aktif" />
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
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="p-5">
        <SectionTitle title="Ekibine Kullanıcı Ekle" action={<Badge label={`${members.length}/${OFFICE_USER_LIMIT}`} />} />
        <div className="space-y-4">
          <Field label="Ad soyad"><Input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="Örn: Yeni Danışman" /></Field>
          <Field label="E-posta"><Input value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} placeholder="danisman@unitglobal.com" /></Field>
          <Field label="Telefon"><Input value={newUserPhone} onChange={(event) => setNewUserPhone(event.target.value)} placeholder="+90 5xx xxx xx xx" /></Field>
          <Field label="Rol">
            <Select value="CONSULTANT" disabled>
              <option value="CONSULTANT">Danışman</option>
            </Select>
          </Field>
          <Button className="w-full" onClick={createUser} disabled={remainingSlots <= 0}>
            <Plus className="h-4 w-4" />
            Kullanıcı Ekle
          </Button>
          <p className="rounded-md border border-blue-100 bg-[#f7fbff] p-3 text-sm leading-6 text-muted-foreground">
            Owner dahil toplam {OFFICE_USER_LIMIT} kullanıcı hakkı var. Kalan hak: {remainingSlots}. Danışmanlar portföy, müşteri ve görev girişlerini kendi panelinden yapar.
          </p>
        </div>
      </Card>
      <Card className="p-5">
        <SectionTitle title="Ekip Kullanıcıları" />
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Kullanıcı</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Telefon</th>
                <th className="px-4 py-3 font-semibold">Durum</th>
                <th className="px-4 py-3 font-semibold">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar user={member} />
                      <div>
                        <p className="font-medium text-slate-950">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{roleLabel(member.role)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{member.phone}</td>
                  <td className="px-4 py-3"><Badge label={member.active ? "Aktif" : "Pasif"} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <InfoBox label="Kullanıcı limiti" value={`${members.length}/${OFFICE_USER_LIMIT}`} />
          <InfoBox label="Aktif danışman" value={members.filter((member) => member.role === "CONSULTANT" && member.active).length.toString()} />
          <InfoBox label="Kalan hak" value={remainingSlots.toString()} />
        </div>
      </Card>
    </div>
  );
}
