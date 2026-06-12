"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { clients as defaultClients, initialData } from "@/lib/demo-data";
import { sahibindenDemoProvider } from "@/services/listing-providers/sahibinden-demo.provider";
import type { CrmData, Lead, LeadAction, MarketComparable, Notification, OfficeClient, Property, Task, User } from "@/lib/types";

type NewPropertyOptionalFields = "coverImage" | "gallery" | "videoUrl" | "city" | "projectName" | "floor" | "buildingAge" | "furnished" | "description" | "features";
type NewPropertyInput = Omit<Property, "id" | "createdAt" | NewPropertyOptionalFields> & Partial<Pick<Property, NewPropertyOptionalFields>>;
type NewLeadInput = Omit<Lead, "id" | "createdAt" | "status" | "notes"> & { notes?: string };

type CrmContextValue = {
  data: CrmData;
  addProperty: (property: NewPropertyInput) => string;
  updateProperty: (id: string, patch: Partial<Property>) => void;
  deleteProperty: (id: string) => void;
  addLead: (lead: NewLeadInput) => void;
  importLeads: (leads: NewLeadInput[], sourceName?: string) => void;
  addLeadAction: (leadId: string, userId: string, note: string) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addTask: (task: Omit<Task, "id" | "status">) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "status">) => void;
  markNotificationRead: (id: string) => void;
  addComparable: (comparable: Omit<MarketComparable, "id" | "lastCheckedAt" | "status">) => void;
  syncSahibindenDemoListings: () => Promise<void>;
  upsertClient: (client: Omit<OfficeClient, "createdAt"> & { createdAt?: string }) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  addUser: (user: Omit<User, "id" | "avatarColor" | "active">) => void;
  deleteUser: (id: string, reassignedToId: string) => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

function normalizeData(saved: CrmData): CrmData {
  const defaultUnitGlobal = defaultClients.find((client) => client.id === "client-unit-global");
  const clients = saved.clients?.length
    ? saved.clients.map((client) => (client.id === "client-unit-global" && !client.logoUrl ? { ...client, logoUrl: defaultUnitGlobal?.logoUrl } : client))
    : defaultClients;
  return {
    ...saved,
    clients,
    users: saved.users.map((user) => (user.role === "ADMIN" || user.clientId ? user : { ...user, clientId: clients[0]?.id })),
    leads: saved.leads.map((lead) => ({ ...lead, customerType: lead.customerType ?? "KIRACI", tenantStatus: lead.tenantStatus ?? "BILINMIYOR", tenantNotes: lead.tenantNotes ?? "" })),
  };
}

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CrmData>(initialData);
  const [hydrated, setHydrated] = useState(false);
  const saveErrorShown = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      try {
        const response = await fetch("/api/crm-state", { cache: "no-store" });
        if (response.status === 401) return;
        if (!response.ok) throw new Error("CRM verisi okunamadı");
        const result = (await response.json()) as { data?: CrmData };
        if (!cancelled && result.data) {
          setData(normalizeData(result.data));
        }
      } catch {
        if (!cancelled) {
          toast.error("CRM verisi serverdan okunamadı. Geçici demo veri gösteriliyor.");
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    loadState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/crm-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!response.ok) throw new Error("CRM verisi kaydedilemedi");
        saveErrorShown.current = false;
      } catch {
        if (!saveErrorShown.current) {
          toast.error("CRM verisi servera kaydedilemedi.");
          saveErrorShown.current = true;
        }
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [data, hydrated]);

  const value = useMemo<CrmContextValue>(() => ({
    data,
    addProperty: (property) => {
      const id = `property-${Date.now()}`;
      setData((current) => ({
        ...current,
        properties: [
          {
            ...property,
            id,
            city: property.city ?? "İstanbul",
            projectName: property.projectName ?? "Unit Global Özel Portföy",
            floor: property.floor ?? "Ara kat",
            buildingAge: property.buildingAge ?? "0-5 yıl",
            furnished: property.furnished ?? false,
            description: property.description ?? "Yeni eklenen premium portföy. Detaylar danışman tarafından güncellenecek.",
            features: property.features ?? ["Otopark", "Güvenlik", "Teras"],
            coverImage: property.coverImage ?? "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
            gallery: property.gallery ?? [],
            videoUrl: property.videoUrl ?? "",
            listingUrl: property.listingUrl ?? "",
            sourcePlatform: property.sourcePlatform ?? "Manual",
            sourceUrl: property.sourceUrl ?? property.listingUrl ?? "",
            externalId: property.externalId ?? undefined,
            syncedAt: property.syncedAt ?? undefined,
            syncStatus: property.syncStatus ?? "MANUAL",
            sourceType: property.sourceType ?? "MANUAL",
            createdAt: new Date().toISOString(),
          },
          ...current.properties,
        ],
      }));
      toast.success("Portföy eklendi");
      return id;
    },
    updateProperty: (id, patch) => {
      setData((current) => ({
        ...current,
        properties: current.properties.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
      toast.success("Portföy güncellendi");
    },
    deleteProperty: (id) => {
      setData((current) => ({
        ...current,
        properties: current.properties.filter((item) => item.id !== id),
      }));
      toast.success("Portföy silindi");
    },
    addLead: (lead) => {
      setData((current) => ({
        ...current,
        leads: [
          {
            ...lead,
            id: `lead-${Date.now()}`,
            status: "YENI_LEAD",
            customerType: lead.customerType ?? "KIRACI",
            notes: lead.notes?.trim() || "Yeni lead. İlk temas bekleniyor.",
            createdAt: new Date().toISOString(),
          },
          ...current.leads,
        ],
      }));
      toast.success("Lead eklendi");
    },
    importLeads: (leads, sourceName) => {
      const now = Date.now();
      const cleanLeads = leads.filter((lead) => lead.name.trim());
      if (!cleanLeads.length) {
        toast.error("İçe aktarılacak müşteri bulunamadı");
        return;
      }
      let addedCount = 0;
      let updatedCount = 0;
      setData((current) => {
        const nextLeads = [...current.leads];
        const leadsToAdd: Lead[] = [];

        cleanLeads.forEach((lead, index) => {
          const existingIndex = lead.externalId ? nextLeads.findIndex((item) => item.externalId === lead.externalId) : -1;
          if (existingIndex >= 0) {
            const existing = nextLeads[existingIndex];
            nextLeads[existingIndex] = {
              ...existing,
              ...lead,
              id: existing.id,
              status: existing.status,
              createdAt: existing.createdAt,
              notes: lead.notes?.trim() || existing.notes || "",
              tenantStatus: existing.tenantStatus ?? lead.tenantStatus ?? "BILINMIYOR",
              tenantName: existing.tenantName ?? lead.tenantName,
              tenantMoveIn: existing.tenantMoveIn ?? lead.tenantMoveIn,
              tenantMoveOut: existing.tenantMoveOut ?? lead.tenantMoveOut,
              tenantNotes: existing.tenantNotes ?? lead.tenantNotes ?? "",
            };
            updatedCount += 1;
          } else {
            leadsToAdd.push({
              ...lead,
              id: `lead-import-${now}-${index}`,
              status: "YENI_LEAD",
              customerType: lead.customerType ?? "MULK_SAHIBI",
              tenantStatus: lead.tenantStatus ?? "BILINMIYOR",
              tenantNotes: lead.tenantNotes ?? "",
              notes: lead.notes?.trim() || "",
              createdAt: new Date(now + index).toISOString(),
            });
            addedCount += 1;
          }
        });

        return { ...current, leads: [...leadsToAdd, ...nextLeads] };
      });
      toast.success(`${sourceName ?? "Dosya"} işlendi: ${addedCount} yeni, ${updatedCount} güncellendi`);
    },
    addLeadAction: (leadId, userId, note) => {
      const action: LeadAction = {
        id: `lead-action-${Date.now()}`,
        leadId,
        userId,
        action: "Not",
        note,
        createdAt: new Date().toISOString(),
      };
      setData((current) => ({ ...current, leadActions: [action, ...current.leadActions] }));
      toast.success("Lead aksiyonu eklendi");
    },
    updateLead: (id, patch) => {
      setData((current) => ({ ...current, leads: current.leads.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      toast.success("Lead güncellendi");
    },
    addTask: (task) => {
      const id = `task-${Date.now()}`;
      setData((current) => ({ ...current, tasks: [{ ...task, id, status: "ACIK", reminderMinutes: task.reminderMinutes ?? 30 }, ...current.tasks] }));
      toast.success("Görev oluşturuldu");
      return id;
    },
    updateTask: (id, patch) => {
      if (patch.status === "TAMAMLANDI") {
        setData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== id) }));
        toast.success("Görev tamamlandı ve listeden kaldırıldı");
        return;
      }
      setData((current) => ({ ...current, tasks: current.tasks.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      toast.success("Görev güncellendi");
    },
    addNotification: (notification) => {
      setData((current) => ({
        ...current,
        notifications: [{ ...notification, id: `notification-${Date.now()}`, status: "OKUNMADI", createdAt: new Date().toISOString() }, ...current.notifications],
      }));
      toast.success("Bildirim gönderildi");
    },
    markNotificationRead: (id) => {
      setData((current) => ({ ...current, notifications: current.notifications.map((item) => (item.id === id ? { ...item, status: "OKUNDU" } : item)) }));
    },
    addComparable: (comparable) => {
      setData((current) => ({
        ...current,
        comparables: [{ ...comparable, id: `comp-${Date.now()}`, status: "AKTIF", lastCheckedAt: new Date().toISOString() }, ...current.comparables],
      }));
      toast.success("Emsal kayıt eklendi");
    },
    syncSahibindenDemoListings: async () => {
      const consultantId = data.users.find((item) => item.role === "CONSULTANT")?.id ?? data.users[0]?.id ?? "admin-1";
      const result = await sahibindenDemoProvider.syncListings(data.properties, consultantId);
      const existingUrls = new Set(data.properties.map((property) => property.sourceUrl || property.listingUrl).filter(Boolean));
      const additions = result.added.filter((property) => !existingUrls.has(property.sourceUrl || property.listingUrl));

      setData((current) => ({
        ...current,
        properties: [
          ...additions.filter((property) => !current.properties.some((item) => (item.sourceUrl || item.listingUrl) === (property.sourceUrl || property.listingUrl))),
          ...current.properties,
        ],
        setting: {
          ...current.setting,
          lastSahibindenSyncAt: result.syncedAt,
        },
      }));

      if (additions.length) {
        toast.success(`${additions.length} demo kaynak ilanı senkronize edildi`);
      } else {
        toast.success("Senkronize edilecek yeni ilan yok");
      }
    },
    upsertClient: (client) => {
      setData((current) => {
        const createdAt = client.createdAt ?? new Date().toISOString();
        const nextClient = { ...client, createdAt };
        const exists = current.clients.some((item) => item.id === client.id);
        return {
          ...current,
          clients: exists ? current.clients.map((item) => (item.id === client.id ? { ...item, ...nextClient } : item)) : [nextClient, ...current.clients],
        };
      });
      toast.success("Müşteri ofisi kaydedildi");
    },
    updateUser: (id, patch) => {
      setData((current) => ({ ...current, users: current.users.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      toast.success("Kullanıcı güncellendi");
    },
    addUser: (user) => {
      setData((current) => ({ ...current, users: [{ ...user, id: `user-${Date.now()}`, avatarColor: "bg-blue-900", active: true }, ...current.users] }));
      toast.success("Kullanıcı eklendi");
    },
    deleteUser: (id, reassignedToId) => {
      setData((current) => {
        const user = current.users.find((item) => item.id === id);
        if (!user || user.role !== "CONSULTANT") {
          toast.error("Sadece danışman kullanıcı silinebilir.");
          return current;
        }

        return {
          ...current,
          users: current.users.filter((item) => item.id !== id),
          properties: current.properties.map((item) => (item.consultantId === id ? { ...item, consultantId: reassignedToId } : item)),
          leads: current.leads.map((item) => (item.consultantId === id ? { ...item, consultantId: reassignedToId } : item)),
          tasks: current.tasks.map((item) => ({
            ...item,
            assignedToId: item.assignedToId === id ? reassignedToId : item.assignedToId,
            createdById: item.createdById === id ? reassignedToId : item.createdById,
          })),
          documents: current.documents.map((item) => (item.assignedToId === id ? { ...item, assignedToId: reassignedToId } : item)),
          notifications: current.notifications.filter((item) => item.targetUserId !== id),
        };
      });
      toast.success("Danışman silindi; bağlı kayıtlar ofis sahibine devredildi");
    },
  }), [data]);

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const context = useContext(CrmContext);
  if (!context) {
    throw new Error("useCrm must be used within CrmProvider");
  }
  return context;
}
