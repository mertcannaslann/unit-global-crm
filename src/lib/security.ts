import type {
  ActivityLog,
  AuditLogAction,
  AuditLogEntry,
  CrmData,
  DocumentRecord,
  Lead,
  MarketAnalysisReport,
  MarketComparable,
  Notification,
  PriceHistory,
  Property,
  Role,
  Task,
  User,
} from "@/lib/types";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId?: string;
  isPlatformAdmin: boolean;
};

type SessionUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: Role | null;
};

type MergeResult = {
  data: CrmData;
  auditEntries: AuditLogEntry[];
};

export class ForbiddenError extends Error {
  status = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const MAX_AUDIT_LOGS = 10000;

function list<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asLower(value?: string | null) {
  return value?.toLowerCase().trim() ?? "";
}

function snapshot(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function normalizeCrmDataForSecurity(data: Partial<CrmData> | null | undefined, fallback: CrmData): CrmData {
  const source = data ?? fallback;
  const clients = list(source.clients).length ? list(source.clients) : list(fallback.clients);
  const firstClientId = clients[0]?.id;

  return {
    ...fallback,
    ...source,
    clients,
    users: list(source.users).map((user) => (user.role === "ADMIN" || user.clientId || !firstClientId ? user : { ...user, clientId: firstClientId })),
    properties: list(source.properties),
    leads: list(source.leads).map((lead) => ({
      ...lead,
      customerType: lead.customerType ?? "MULK_SAHIBI",
      tenantStatus: lead.tenantStatus ?? "BILINMIYOR",
      tenantNotes: lead.tenantNotes ?? "",
    })),
    leadActions: list(source.leadActions),
    tasks: list(source.tasks),
    documents: list(source.documents),
    notifications: list(source.notifications),
    comparables: list(source.comparables),
    marketListings: list(source.marketListings),
    reports: list(source.reports),
    priceHistory: list(source.priceHistory),
    activityLogs: list(source.activityLogs),
    auditLogs: list(source.auditLogs),
    setting: source.setting ?? fallback.setting,
  };
}

export function resolveActor(data: CrmData, sessionUser: SessionUser): Actor | null {
  const email = asLower(sessionUser.email);
  if (!email) return null;

  const matchedUser = data.users.find((user) => asLower(user.email) === email && user.active !== false);
  const role = matchedUser?.role ?? sessionUser.role ?? undefined;
  const id = matchedUser?.id ?? sessionUser.id ?? undefined;
  if (!role || !id) return null;

  const companyId = role === "ADMIN" ? matchedUser?.clientId : matchedUser?.clientId;
  if (role !== "ADMIN" && !companyId) return null;

  return {
    id,
    name: matchedUser?.name ?? sessionUser.name ?? email,
    email,
    role,
    companyId,
    isPlatformAdmin: role === "ADMIN" && !companyId,
  };
}

export function userIdsForCompany(data: CrmData, companyId?: string) {
  return new Set(data.users.filter((user) => user.clientId === companyId).map((user) => user.id));
}

function companyIdForUser(data: CrmData, userId?: string) {
  if (!userId) return undefined;
  return data.users.find((user) => user.id === userId)?.clientId;
}

export function companyIdForProperty(data: CrmData, property?: Property) {
  return companyIdForUser(data, property?.consultantId);
}

export function companyIdForLead(data: CrmData, lead?: Lead) {
  return companyIdForUser(data, lead?.consultantId) ?? companyIdForUser(data, lead?.importedById);
}

export function companyIdForTask(data: CrmData, task?: Task) {
  if (!task) return undefined;
  return (
    companyIdForUser(data, task.assignedToId) ??
    companyIdForUser(data, task.createdById) ??
    companyIdForLead(data, data.leads.find((lead) => lead.id === task.leadId)) ??
    companyIdForProperty(data, data.properties.find((property) => property.id === task.propertyId))
  );
}

export function canReadProperty(actor: Actor, data: CrmData, property: Property) {
  if (actor.role === "ADMIN") return true;
  return !!actor.companyId && companyIdForProperty(data, property) === actor.companyId;
}

export function canWriteProperty(actor: Actor, data: CrmData, property: Property) {
  if (actor.role === "ADMIN") return true;
  if (!actor.companyId || companyIdForProperty(data, property) !== actor.companyId) return false;
  if (actor.role === "OFFICE_MANAGER") return true;
  return property.consultantId === actor.id;
}

export function canReadLead(actor: Actor, data: CrmData, lead: Lead) {
  if (actor.role === "ADMIN") return true;
  if (!actor.companyId || companyIdForLead(data, lead) !== actor.companyId) return false;
  if (actor.role === "OFFICE_MANAGER") return true;
  return lead.consultantId === actor.id;
}

export function canWriteLead(actor: Actor, data: CrmData, lead: Lead) {
  return canReadLead(actor, data, lead);
}

export function canReadTask(actor: Actor, data: CrmData, task: Task) {
  if (actor.role === "ADMIN") return true;
  if (!actor.companyId || companyIdForTask(data, task) !== actor.companyId) return false;
  if (actor.role === "OFFICE_MANAGER") return true;
  if (task.assignedToId === actor.id || task.createdById === actor.id) return true;

  const linkedLead = data.leads.find((lead) => lead.id === task.leadId);
  if (linkedLead && !canReadLead(actor, data, linkedLead)) return false;

  return !!task.propertyId && !!data.properties.find((property) => property.id === task.propertyId && canReadProperty(actor, data, property));
}

export function canWriteTask(actor: Actor, data: CrmData, task: Task) {
  if (actor.role === "ADMIN") return true;
  if (!actor.companyId || companyIdForTask(data, task) !== actor.companyId) return false;
  if (actor.role === "OFFICE_MANAGER") return true;
  return task.assignedToId === actor.id || task.createdById === actor.id;
}

function canReadDocument(actor: Actor, data: CrmData, document: DocumentRecord) {
  if (actor.role === "ADMIN") return true;
  const assignedCompanyId = companyIdForUser(data, document.assignedToId);
  if (!actor.companyId || assignedCompanyId !== actor.companyId) return false;
  if (actor.role === "OFFICE_MANAGER") return true;
  if (document.relatedType === "LEAD") {
    const lead = data.leads.find((item) => item.id === document.relatedId);
    return !!lead && canReadLead(actor, data, lead);
  }
  if (document.relatedType === "PROPERTY") {
    const property = data.properties.find((item) => item.id === document.relatedId);
    return !!property && canReadProperty(actor, data, property);
  }
  return document.assignedToId === actor.id;
}

function companyIdForNotification(data: CrmData, notification: Notification) {
  return notification.targetUserId ? companyIdForUser(data, notification.targetUserId) : undefined;
}

function canReadNotification(actor: Actor, data: CrmData, notification: Notification) {
  if (actor.role === "ADMIN") return true;
  if (!notification.targetUserId) return true;
  if (actor.role === "OFFICE_MANAGER") return companyIdForNotification(data, notification) === actor.companyId;
  return notification.targetUserId === actor.id;
}

function canWriteNotification(actor: Actor, data: CrmData, notification: Notification) {
  if (actor.role === "ADMIN") return true;
  if (actor.role === "OFFICE_MANAGER") return companyIdForNotification(data, notification) === actor.companyId || !notification.targetUserId;
  return notification.targetUserId === actor.id;
}

function isCompanyActivity(data: CrmData, companyUserIds: Set<string>, activity: ActivityLog) {
  return companyUserIds.has(activity.userId);
}

function allowedPropertyIdsForActor(actor: Actor, data: CrmData) {
  return new Set(data.properties.filter((property) => canReadProperty(actor, data, property)).map((property) => property.id));
}

function allowedLeadIdsForActor(actor: Actor, data: CrmData) {
  return new Set(data.leads.filter((lead) => canReadLead(actor, data, lead)).map((lead) => lead.id));
}

export function visibleDataForActor(data: CrmData, actor: Actor): CrmData {
  if (actor.role === "ADMIN") {
    return data;
  }

  const companyUserIds = userIdsForCompany(data, actor.companyId);
  const visibleProperties = data.properties.filter((property) => canReadProperty(actor, data, property));
  const visibleLeads = data.leads.filter((lead) => canReadLead(actor, data, lead));
  const propertyIds = new Set(visibleProperties.map((property) => property.id));
  const leadIds = new Set(visibleLeads.map((lead) => lead.id));

  return {
    ...data,
    clients: data.clients.filter((client) => client.id === actor.companyId),
    users: data.users.filter((user) => user.clientId === actor.companyId),
    properties: visibleProperties,
    leads: visibleLeads,
    leadActions: data.leadActions.filter((action) => leadIds.has(action.leadId) || action.userId === actor.id),
    tasks: data.tasks.filter((task) => canReadTask(actor, data, task)),
    documents: data.documents.filter((document) => canReadDocument(actor, data, document)),
    notifications: data.notifications.filter((notification) => canReadNotification(actor, data, notification)),
    comparables: data.comparables.filter((comparable) => propertyIds.has(comparable.propertyId)),
    reports: data.reports.filter((report) => propertyIds.has(report.propertyId)),
    priceHistory: data.priceHistory.filter((history) => propertyIds.has(history.propertyId)),
    activityLogs: data.activityLogs.filter((activity) => isCompanyActivity(data, companyUserIds, activity)),
    auditLogs: actor.role === "OFFICE_MANAGER" ? data.auditLogs.filter((entry) => entry.companyId === actor.companyId) : [],
  };
}

function assertNoForeignUsers(actor: Actor, data: CrmData, incomingUsers: User[]) {
  if (actor.role === "ADMIN") return;
  const foreign = incomingUsers.find((user) => user.role === "ADMIN" || user.clientId !== actor.companyId);
  if (foreign) {
    throw new ForbiddenError("Bu kullanıcı kaydı bu şirkete ait değil.");
  }
}

function mergeScopedCollection<T extends { id: string }>(
  current: T[],
  incoming: T[],
  canRead: (item: T) => boolean,
  canWrite: (item: T) => boolean,
  options: { rejectForeign?: boolean } = {},
) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const next: T[] = [];

  for (const incomingItem of incoming) {
    if (!canRead(incomingItem)) {
      if (options.rejectForeign) {
        throw new ForbiddenError("Bu kayıt farklı şirkete ait.");
      }
      continue;
    }
  }

  for (const currentItem of current) {
    const incomingItem = incomingById.get(currentItem.id);
    if (!incomingItem) {
      if (canWrite(currentItem)) continue;
      next.push(currentItem);
      continue;
    }

    if (canWrite(currentItem) || snapshot(currentItem) === snapshot(incomingItem)) {
      next.push(canWrite(currentItem) ? incomingItem : currentItem);
    } else {
      throw new ForbiddenError("Bu kaydı değiştirme yetkin yok.");
    }
  }

  const currentIds = new Set(current.map((item) => item.id));
  for (const incomingItem of incoming) {
    if (currentIds.has(incomingItem.id)) continue;
    if (!canWrite(incomingItem)) {
      throw new ForbiddenError("Bu kaydı oluşturma yetkin yok.");
    }
    next.push(incomingItem);
  }

  return next;
}

function mergeComparableRecords(
  current: MarketComparable[],
  incoming: MarketComparable[],
  writablePropertyIds: Set<string>,
  visiblePropertyIds: Set<string>,
) {
  return mergeScopedCollection(
    current,
    incoming,
    (item) => visiblePropertyIds.has(item.propertyId),
    (item) => writablePropertyIds.has(item.propertyId),
  );
}

function mergeReportRecords(
  current: MarketAnalysisReport[],
  incoming: MarketAnalysisReport[],
  writablePropertyIds: Set<string>,
  visiblePropertyIds: Set<string>,
) {
  return mergeScopedCollection(
    current,
    incoming,
    (item) => visiblePropertyIds.has(item.propertyId),
    (item) => writablePropertyIds.has(item.propertyId),
  );
}

function mergePriceHistoryRecords(
  current: PriceHistory[],
  incoming: PriceHistory[],
  writablePropertyIds: Set<string>,
  visiblePropertyIds: Set<string>,
) {
  return mergeScopedCollection(
    current,
    incoming,
    (item) => visiblePropertyIds.has(item.propertyId),
    (item) => writablePropertyIds.has(item.propertyId),
  );
}

function buildLeadAuditEntries(before: CrmData, after: CrmData, actor: Actor, request: Request | undefined) {
  const entries: AuditLogEntry[] = [];
  const beforeMap = new Map(before.leads.map((lead) => [lead.id, lead]));
  const afterMap = new Map(after.leads.map((lead) => [lead.id, lead]));

  for (const lead of after.leads) {
    const previous = beforeMap.get(lead.id);
    if (!canReadLead(actor, after, lead)) continue;
    if (!previous) {
      entries.push(createAuditLogEntry(actor, "CUSTOMER_CREATE", request, 200, {
        entityId: lead.id,
        targetCustomerId: lead.id,
        metadata: { consultant_id: lead.consultantId },
      }));
    } else if (snapshot(previous) !== snapshot(lead)) {
      entries.push(createAuditLogEntry(actor, "CUSTOMER_UPDATE", request, 200, {
        entityId: lead.id,
        targetCustomerId: lead.id,
        metadata: { changed: true },
      }));
    }
  }

  for (const lead of before.leads) {
    if (afterMap.has(lead.id) || !canReadLead(actor, before, lead)) continue;
    entries.push(createAuditLogEntry(actor, "CUSTOMER_DELETE", request, 200, {
      entityId: lead.id,
      targetCustomerId: lead.id,
      metadata: { consultant_id: lead.consultantId },
    }));
  }

  return entries;
}

export function mergeAuthorizedCrmState(current: CrmData, incoming: CrmData, actor: Actor, request?: Request): MergeResult {
  const currentAuditLogs = current.auditLogs;

  if (actor.role === "ADMIN") {
    const merged = {
      ...incoming,
      auditLogs: currentAuditLogs,
    };
    return {
      data: merged,
      auditEntries: buildLeadAuditEntries(current, merged, actor, request),
    };
  }

  if (!actor.companyId) {
    throw new ForbiddenError("Şirket bilgisi bulunamadı.");
  }

  assertNoForeignUsers(actor, current, incoming.users);

  if (incoming.clients.some((client) => client.id !== actor.companyId)) {
    throw new ForbiddenError("Bu şirket kaydına erişim yok.");
  }

  const visibleLeadIds = allowedLeadIdsForActor(actor, current);
  const companyUserIds = userIdsForCompany(current, actor.companyId);

  const nextUsers = mergeScopedCollection(
    current.users,
    incoming.users,
    (user) => user.clientId === actor.companyId,
    (user) => actor.role === "OFFICE_MANAGER" && user.clientId === actor.companyId,
  );

  const nextProperties = mergeScopedCollection(
    current.properties,
    incoming.properties,
    (property) => canReadProperty(actor, current, property),
    (property) => canWriteProperty(actor, current, property),
    { rejectForeign: true },
  );

  const dataForLeadChecks = { ...current, properties: nextProperties, users: nextUsers };
  const nextLeads = mergeScopedCollection(
    current.leads,
    incoming.leads,
    (lead) => canReadLead(actor, dataForLeadChecks, lead),
    (lead) => canWriteLead(actor, dataForLeadChecks, lead),
    { rejectForeign: true },
  );

  const dataForTaskChecks = { ...dataForLeadChecks, leads: nextLeads };
  const nextTasks = mergeScopedCollection(
    current.tasks,
    incoming.tasks,
    (task) => canReadTask(actor, dataForTaskChecks, task),
    (task) => canWriteTask(actor, dataForTaskChecks, task),
  );

  const nextDocuments = mergeScopedCollection(
    current.documents,
    incoming.documents,
    (document) => canReadDocument(actor, dataForTaskChecks, document),
    (document) => actor.role === "OFFICE_MANAGER" ? canReadDocument(actor, dataForTaskChecks, document) : document.assignedToId === actor.id,
  );

  const nextNotifications = mergeScopedCollection(
    current.notifications,
    incoming.notifications,
    (notification) => canReadNotification(actor, current, notification),
    (notification) => canWriteNotification(actor, current, notification),
  );

  const nextActivityLogs = mergeScopedCollection(
    current.activityLogs,
    incoming.activityLogs,
    (activity) => isCompanyActivity(current, companyUserIds, activity),
    (activity) => activity.userId === actor.id || (actor.role === "OFFICE_MANAGER" && companyUserIds.has(activity.userId)),
  );

  const nextVisiblePropertyIds = allowedPropertyIdsForActor(actor, { ...current, properties: nextProperties, users: nextUsers });
  const nextWritablePropertyIds = new Set(nextProperties.filter((property) => canWriteProperty(actor, { ...current, properties: nextProperties, users: nextUsers }, property)).map((property) => property.id));

  const merged: CrmData = {
    ...current,
    clients: mergeScopedCollection(
      current.clients,
      incoming.clients,
      (client) => client.id === actor.companyId,
      () => actor.role === "OFFICE_MANAGER",
    ),
    users: nextUsers,
    properties: nextProperties,
    leads: nextLeads,
    leadActions: mergeScopedCollection(
      current.leadActions,
      incoming.leadActions,
      (action) => visibleLeadIds.has(action.leadId) || action.userId === actor.id,
      (action) => visibleLeadIds.has(action.leadId) && (actor.role === "OFFICE_MANAGER" || action.userId === actor.id),
    ),
    tasks: nextTasks,
    documents: nextDocuments,
    notifications: nextNotifications,
    comparables: mergeComparableRecords(current.comparables, incoming.comparables, nextWritablePropertyIds, nextVisiblePropertyIds),
    reports: mergeReportRecords(current.reports, incoming.reports, nextWritablePropertyIds, nextVisiblePropertyIds),
    priceHistory: mergePriceHistoryRecords(current.priceHistory, incoming.priceHistory, nextWritablePropertyIds, nextVisiblePropertyIds),
    activityLogs: nextActivityLogs,
    marketListings: current.marketListings,
    setting: actor.role === "OFFICE_MANAGER" ? incoming.setting : current.setting,
    auditLogs: currentAuditLogs,
  };

  return {
    data: merged,
    auditEntries: buildLeadAuditEntries(current, merged, actor, request),
  };
}

export function createAuditLogEntry(
  actor: Actor,
  action: AuditLogAction,
  request: Request | undefined,
  statusCode: number,
  fields: Partial<Pick<AuditLogEntry, "entityId" | "entityType" | "metadata" | "targetCustomerId">> = {},
): AuditLogEntry {
  const headers = request?.headers;
  const forwardedFor = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers?.get("x-real-ip")?.trim();
  const requestUrl = request?.url ? new URL(request.url) : undefined;

  return {
    id: safeId("audit"),
    companyId: actor.companyId,
    userId: actor.id,
    userRole: actor.role,
    action,
    entityType: fields.entityType ?? "CUSTOMER",
    entityId: fields.entityId,
    targetCustomerId: fields.targetCustomerId,
    metadata: fields.metadata,
    ipAddress: forwardedFor || realIp,
    userAgent: headers?.get("user-agent") ?? undefined,
    requestPath: requestUrl?.pathname,
    requestMethod: request?.method,
    statusCode,
    createdAt: new Date().toISOString(),
  };
}

export function appendAuditLogs(data: CrmData, entries: AuditLogEntry[]) {
  if (!entries.length) return data;
  return {
    ...data,
    auditLogs: [...entries, ...data.auditLogs].slice(0, MAX_AUDIT_LOGS),
  };
}

export function assertCanAccessLead(actor: Actor, data: CrmData, leadId: string, request?: Request) {
  const lead = data.leads.find((item) => item.id === leadId);
  if (lead && canReadLead(actor, data, lead)) return lead;

  const entry = createAuditLogEntry(actor, "CUSTOMER_UNAUTHORIZED_ACCESS", request, 403, {
    entityId: leadId,
    targetCustomerId: leadId,
    metadata: { reason: lead ? "not_assigned" : "not_found" },
  });
  throw Object.assign(new ForbiddenError("Bu müşteri kaydına erişim yok."), { auditEntry: entry });
}
