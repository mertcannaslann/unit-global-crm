import assert from "node:assert/strict";
import {
  appendAuditLogs,
  createAuditLogEntry,
  ForbiddenError,
  mergeAuthorizedCrmState,
  normalizeCrmDataForSecurity,
  resolveActor,
  visibleDataForActor,
} from "./security.ts";
import type { CrmData, Lead, Property, Task } from "./types.ts";

const fallbackData: CrmData = {
  clients: [],
  users: [],
  properties: [],
  leads: [],
  leadActions: [],
  tasks: [],
  documents: [],
  notifications: [],
  comparables: [],
  marketListings: [],
  reports: [],
  priceHistory: [],
  activityLogs: [],
  auditLogs: [],
  setting: {
    companyName: "Test CRM",
    defaultCurrency: "TRY",
    leadSlaHours: 24,
    notificationEmail: "admin@test.com",
  },
};

function buildTestData(): CrmData {
  const data = normalizeCrmDataForSecurity({
    ...fallbackData,
    clients: [
      { id: "client-a", name: "Ofis A", ownerName: "Owner A", userLimit: 5, status: "Hazır", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "client-b", name: "Ofis B", ownerName: "Owner B", userLimit: 5, status: "Hazır", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
    users: [
      { id: "admin", name: "Platform Admin", email: "admin@test.com", role: "ADMIN", title: "Admin", phone: "", avatarColor: "", active: true },
      { id: "manager-a", name: "Owner A", email: "manager-a@test.com", role: "OFFICE_MANAGER", title: "Owner", phone: "", avatarColor: "", active: true, clientId: "client-a" },
      { id: "consultant-a1", name: "Consultant A1", email: "a1@test.com", role: "CONSULTANT", title: "Consultant", phone: "", avatarColor: "", active: true, clientId: "client-a" },
      { id: "consultant-a2", name: "Consultant A2", email: "a2@test.com", role: "CONSULTANT", title: "Consultant", phone: "", avatarColor: "", active: true, clientId: "client-a" },
      { id: "manager-b", name: "Owner B", email: "manager-b@test.com", role: "OFFICE_MANAGER", title: "Owner", phone: "", avatarColor: "", active: true, clientId: "client-b" },
      { id: "consultant-b1", name: "Consultant B1", email: "b1@test.com", role: "CONSULTANT", title: "Consultant", phone: "", avatarColor: "", active: true, clientId: "client-b" },
    ],
    properties: [
      property("property-a1", "consultant-a1"),
      property("property-a2", "consultant-a2"),
      property("property-b1", "consultant-b1"),
    ],
    leads: [
      lead("lead-a1", "consultant-a1"),
      lead("lead-a2", "consultant-a2"),
      lead("lead-b1", "consultant-b1"),
    ],
    tasks: [
      task("task-a1", "consultant-a1", "consultant-a1", "lead-a1", "property-a1"),
      task("task-a2", "consultant-a2", "consultant-a2", "lead-a2", "property-a2"),
      task("task-b1", "consultant-b1", "consultant-b1", "lead-b1", "property-b1"),
    ],
    auditLogs: [],
  }, fallbackData);

  return data;
}

function property(id: string, consultantId: string): Property {
  return {
    id,
    title: id,
    listingType: "SATILIK",
    price: 1,
    currency: "TRY",
    city: "İstanbul",
    district: "Beşiktaş",
    neighborhood: "Etiler",
    projectName: "",
    squareMeters: 100,
    rooms: "2+1",
    floor: "",
    buildingAge: "",
    furnished: false,
    description: "",
    features: [],
    coverImage: "",
    gallery: [],
    videoUrl: "",
    listingUrl: "",
    consultantId,
    status: "AKTIF",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function lead(id: string, consultantId: string): Lead {
  return {
    id,
    name: id,
    email: "",
    phone: "",
    source: "test",
    budget: 0,
    interest: "",
    status: "YENI_LEAD",
    consultantId,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function task(id: string, assignedToId: string, createdById: string, leadId: string, propertyId: string): Task {
  return {
    id,
    title: id,
    description: "",
    dueDate: "2026-01-01T09:00:00.000Z",
    priority: "ORTA",
    status: "ACIK",
    assignedToId,
    createdById,
    leadId,
    propertyId,
  };
}

function actor(data: CrmData, email: string) {
  const resolved = resolveActor(data, { email });
  assert.ok(resolved, `Actor resolved for ${email}`);
  return resolved;
}

const data = buildTestData();
const consultantA1 = actor(data, "a1@test.com");
const managerA = actor(data, "manager-a@test.com");
const admin = actor(data, "admin@test.com");

const consultantView = visibleDataForActor(data, consultantA1);
assert.deepEqual(consultantView.properties.map((item) => item.id).sort(), ["property-a1", "property-a2"], "Danışman kendi şirketindeki tüm portföyleri görebilmeli");
assert.deepEqual(consultantView.leads.map((item) => item.id), ["lead-a1"], "Danışman sadece atanmış müşterileri görebilmeli");
assert.deepEqual(consultantView.tasks.map((item) => item.id), ["task-a1"], "Danışman sadece kendi müşteri/görevlerini görmeli");

const managerView = visibleDataForActor(data, managerA);
assert.deepEqual(managerView.properties.map((item) => item.id).sort(), ["property-a1", "property-a2"], "Ofis sahibi sadece kendi şirket portföylerini görmeli");
assert.deepEqual(managerView.leads.map((item) => item.id).sort(), ["lead-a1", "lead-a2"], "Ofis sahibi sadece kendi şirket müşterilerini görmeli");

assert.equal(visibleDataForActor(data, admin).clients.length, 2, "Platform admin tüm ofisleri görebilmeli");

const maliciousForeignLead = {
  ...visibleDataForActor(data, consultantA1),
  leads: [data.leads.find((item) => item.id === "lead-b1")!],
};
assert.throws(() => mergeAuthorizedCrmState(data, maliciousForeignLead, consultantA1), ForbiddenError, "Danışman başka şirket müşterisini yazamamalı");

const maliciousOtherConsultantLead = {
  ...visibleDataForActor(data, consultantA1),
  leads: [{ ...data.leads.find((item) => item.id === "lead-a2")!, notes: "izinsiz" }],
};
assert.throws(() => mergeAuthorizedCrmState(data, maliciousOtherConsultantLead, consultantA1), ForbiddenError, "Danışman başka danışmanın müşterisini yazamamalı");

const currentWithAudit = appendAuditLogs(data, [createAuditLogEntry(admin, "CUSTOMER_EXPORT", undefined, 200, { metadata: { row_count: 1 } })]);
const incomingWithoutAudit = { ...visibleDataForActor(currentWithAudit, admin), auditLogs: [] };
const adminMerge = mergeAuthorizedCrmState(currentWithAudit, incomingWithoutAudit, admin);
assert.equal(adminMerge.data.auditLogs.length, 1, "Audit log kullanıcı payload'u ile silinmemeli");

const searchEntry = createAuditLogEntry(consultantA1, "CUSTOMER_SEARCH", undefined, 200, {
  metadata: { search_query: "Etiler", filters: { groupBy: "SEMT" }, result_count: 1, page: 1, limit: 25 },
});
assert.equal(searchEntry.action, "CUSTOMER_SEARCH", "Müşteri arama audit action olarak yazılmalı");
assert.equal(searchEntry.companyId, "client-a", "Audit log şirket bilgisi authenticated kullanıcıdan gelmeli");

console.log("Security authorization tests passed");
