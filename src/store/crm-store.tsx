"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { clients as defaultClients } from "@/lib/demo-data";
import { emptyCrmData } from "@/lib/empty-crm-data";
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
  importLeads: (leads: NewLeadInput[], sourceName?: string, importedById?: string) => void;
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
  upsertUsers: (users: User[]) => void;
  deleteUser: (id: string, reassignedToId: string) => void;
  resetClientData: (clientId: string) => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

function normalizeData(saved: CrmData): CrmData {
  const defaultUnitGlobal = defaultClients.find((client) => client.id === "client-unit-global");
  const clients = saved.clients?.length
    ? saved.clients.map((client) => (client.id === "client-unit-global" ? {
      ...client,
      logoUrl: client.logoUrl || defaultUnitGlobal?.logoUrl,
      inviteFromEmail: client.inviteFromEmail || defaultUnitGlobal?.inviteFromEmail,
    } : client))
    : defaultClients;
  return {
    ...saved,
    clients,
    users: saved.users.map((user) => (user.role === "ADMIN" || user.clientId ? user : { ...user, clientId: clients[0]?.id })),
    leads: saved.leads.map((lead) => ({ ...lead, customerType: lead.customerType ?? "KIRACI", tenantStatus: lead.tenantStatus ?? "BILINMIYOR", tenantNotes: lead.tenantNotes ?? "" })),
  };
}

function normalizeListingIdentity(value?: string) {
  return value?.trim().replace(/\/+$/, "").toLowerCase() ?? "";
}

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [data, setData] = useState<CrmData>(emptyCrmData);
  const [hydrated, setHydrated] = useState(false);
  const dirtyRef = useRef(false);
  const saveErrorShown = useRef(false);

  function commitData(updater: SetStateAction<CrmData>) {
    dirtyRef.current = true;
    setData(updater);
  }

  useEffect(() => {
    let cancelled = false;

    if (status === "loading") return;

    if (status === "unauthenticated") {
      dirtyRef.current = false;
      setHydrated(true);
      return;
    }

    async function loadState() {
      try {
        setHydrated(false);
        const response = await fetch("/api/crm-state", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) return;
        if (!response.ok) throw new Error("CRM verisi okunamadı");
        const result = (await response.json()) as { data?: CrmData };
        if (!cancelled && result.data && !dirtyRef.current) {
          setData(normalizeData(result.data));
        }
      } catch {
        if (!cancelled) {
          toast.error("CRM verisi serverdan okunamadı. Lütfen production database kurulumunu kontrol edin.");
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
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !hydrated || !dirtyRef.current) return;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/crm-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
        });
        const result = (await response.json().catch(() => null)) as { data?: CrmData; error?: string } | null;
        if (!response.ok || !result?.data) {
          throw new Error(result?.error ?? "CRM verisi kaydedilemedi");
        }
        setData(normalizeData(result.data));
        dirtyRef.current = false;
        saveErrorShown.current = false;
      } catch (error) {
        console.error(error);
        if (!saveErrorShown.current) {
          toast.error("CRM verisi servera kaydedilemedi.");
          saveErrorShown.current = true;
        }
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [data, hydrated, status]);

  const value = useMemo<CrmContextValue>(() => ({
    data,
    addProperty: (property) => {
      const hasValidCore =
        property.title?.trim() &&
        property.consultantId &&
        Number(property.price) > 0 &&
        Number(property.squareMeters) >= 20 &&
        property.district?.trim() &&
        property.neighborhood?.trim() &&
        property.rooms?.trim();
      if (!hasValidCore) {
        toast.error("Portföy eklemek için başlık, fiyat, m², lokasyon ve oda bilgisi gerekli.");
        return "";
      }
      const nextSourceUrl = normalizeListingIdentity(property.sourceUrl || property.listingUrl);
      const nextExternalId = property.externalId?.trim();
      const duplicate = data.properties.find((item) => {
        const sameExternalId = Boolean(nextExternalId && item.externalId === nextExternalId);
        const sameSourceUrl = Boolean(nextSourceUrl && [item.sourceUrl, item.listingUrl].some((url) => normalizeListingIdentity(url) === nextSourceUrl));
        return sameExternalId || sameSourceUrl;
      });
      if (duplicate) {
        toast.info("Bu ilan portföylerde zaten var. Mevcut kayıt açılıyor.");
        return duplicate.id;
      }
      const id = `property-${Date.now()}`;
      commitData((current) => ({
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
      commitData((current) => ({
        ...current,
        properties: current.properties.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
      toast.success("Portföy güncellendi");
    },
    deleteProperty: (id) => {
      commitData((current) => ({
        ...current,
        properties: current.properties.filter((item) => item.id !== id),
      }));
      toast.success("Portföy silindi");
    },
    addLead: (lead) => {
      commitData((current) => ({
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
    importLeads: (leads, sourceName, importedById) => {
      const now = Date.now();
      const importedAt = new Date(now).toISOString();
      const cleanLeads = leads.filter((lead) => lead.name.trim());
      if (!cleanLeads.length) {
        toast.error("İçe aktarılacak müşteri bulunamadı");
        return;
      }
      let addedCount = 0;
      let updatedCount = 0;
      commitData((current) => {
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
              importedById: importedById ?? existing.importedById,
              importSource: sourceName ?? existing.importSource,
              importedAt,
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
              importedById,
              importSource: sourceName,
              importedAt,
              notes: lead.notes?.trim() || "",
              createdAt: new Date(now + index).toISOString(),
            });
            addedCount += 1;
          }
        });
        const uploader = current.users.find((item) => item.id === importedById)?.name ?? "Bilinmeyen kullanıcı";
        const activity = {
          id: `activity-import-${now}`,
          userId: importedById ?? "system",
          action: `${sourceName ?? "Dosya"} müşterilere yüklendi: ${addedCount} yeni, ${updatedCount} güncellendi`,
          entity: "LEAD_IMPORT",
          createdAt: importedAt,
        };

        return { ...current, leads: [...leadsToAdd, ...nextLeads], activityLogs: [{ ...activity, action: `${uploader} · ${activity.action}` }, ...current.activityLogs] };
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
      commitData((current) => ({ ...current, leadActions: [action, ...current.leadActions] }));
      toast.success("Lead aksiyonu eklendi");
    },
    updateLead: (id, patch) => {
      commitData((current) => ({ ...current, leads: current.leads.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      toast.success("Lead güncellendi");
    },
    addTask: (task) => {
      const id = `task-${Date.now()}`;
      commitData((current) => ({ ...current, tasks: [{ ...task, id, status: "ACIK", reminderMinutes: task.reminderMinutes ?? 30 }, ...current.tasks] }));
      toast.success("Görev oluşturuldu");
      return id;
    },
    updateTask: (id, patch) => {
      if (patch.status === "TAMAMLANDI") {
        commitData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== id) }));
        toast.success("Görev tamamlandı ve listeden kaldırıldı");
        return;
      }
      commitData((current) => ({ ...current, tasks: current.tasks.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      toast.success("Görev güncellendi");
    },
    addNotification: (notification) => {
      commitData((current) => ({
        ...current,
        notifications: [{ ...notification, id: `notification-${Date.now()}`, status: "OKUNMADI", createdAt: new Date().toISOString() }, ...current.notifications],
      }));
      toast.success("Bildirim gönderildi");
    },
    markNotificationRead: (id) => {
      commitData((current) => ({ ...current, notifications: current.notifications.map((item) => (item.id === id ? { ...item, status: "OKUNDU" } : item)) }));
    },
    addComparable: (comparable) => {
      commitData((current) => ({
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

      commitData((current) => ({
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
      commitData((current) => {
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
      commitData((current) => ({ ...current, users: current.users.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      toast.success("Kullanıcı güncellendi");
    },
    addUser: (user) => {
      commitData((current) => ({ ...current, users: [{ ...user, id: `user-${Date.now()}`, avatarColor: "bg-blue-900", active: true }, ...current.users] }));
      toast.success("Kullanıcı eklendi");
    },
    upsertUsers: (users) => {
      commitData((current) => {
        const incomingIds = new Set(users.map((user) => user.id));
        return {
          ...current,
          users: [
            ...users,
            ...current.users.filter((user) => !incomingIds.has(user.id)),
          ],
        };
      });
      toast.success("Ofis kullanıcıları kaydedildi");
    },
    deleteUser: (id, reassignedToId) => {
      commitData((current) => {
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
    resetClientData: (clientId) => {
      commitData((current) => {
        const client = current.clients.find((item) => item.id === clientId);
        if (!client) {
          toast.error("Müşteri ofisi bulunamadı.");
          return current;
        }

        const clientUserIds = new Set(current.users.filter((item) => item.clientId === clientId).map((item) => item.id));
        const propertyIds = new Set(current.properties.filter((item) => clientUserIds.has(item.consultantId)).map((item) => item.id));
        const leadIds = new Set(current.leads.filter((item) => clientUserIds.has(item.consultantId) || (item.importedById ? clientUserIds.has(item.importedById) : false)).map((item) => item.id));

        return {
          ...current,
          properties: current.properties.filter((item) => !propertyIds.has(item.id)),
          leads: current.leads.filter((item) => !leadIds.has(item.id)),
          leadActions: current.leadActions.filter((item) => !leadIds.has(item.leadId) && !clientUserIds.has(item.userId)),
          tasks: current.tasks.filter((item) => !clientUserIds.has(item.assignedToId) && !clientUserIds.has(item.createdById) && !(item.leadId && leadIds.has(item.leadId)) && !(item.propertyId && propertyIds.has(item.propertyId))),
          documents: current.documents.filter((item) => !clientUserIds.has(item.assignedToId) && !((item.relatedType === "PROPERTY" && propertyIds.has(item.relatedId)) || (item.relatedType === "LEAD" && leadIds.has(item.relatedId)))),
          notifications: current.notifications.filter((item) => !item.targetUserId || !clientUserIds.has(item.targetUserId)),
          comparables: current.comparables.filter((item) => !propertyIds.has(item.propertyId)),
          reports: current.reports.filter((item) => !propertyIds.has(item.propertyId)),
          priceHistory: current.priceHistory.filter((item) => !propertyIds.has(item.propertyId)),
          activityLogs: current.activityLogs.filter((item) => !clientUserIds.has(item.userId)),
          setting: clientId === "client-unit-global" ? { ...current.setting, lastSahibindenSyncAt: undefined } : current.setting,
        };
      });
      toast.success("Müşteri ofisinin test datası temizlendi; kullanıcılar korundu");
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
