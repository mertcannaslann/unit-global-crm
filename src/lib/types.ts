export type Role = "ADMIN" | "OFFICE_MANAGER" | "CONSULTANT";
export type PropertyStatus = "AKTIF" | "PASIF" | "OPSIYONLU" | "SATILDI" | "KIRALANDI";
export type PropertyType = "SATILIK" | "KIRALIK";
export type PropertySourceType = "OWN_LISTING" | "AUTHORIZED_PORTFOLIO" | "MANUAL";
export type PropertySyncStatus = "SYNCED" | "MANUAL" | "PENDING" | "ERROR";
export type LeadStatus = "YENI_LEAD" | "ARANDI" | "RANDEVU_ALINDI" | "YER_GOSTERILDI" | "TEKLIF_VERILDI" | "KAPANDI" | "KAYBEDILDI";
export type LeadCustomerType = "MULK_SAHIBI" | "KIRACI";
export type TaskStatus = "ACIK" | "DEVAM" | "TAMAMLANDI";
export type TaskType = "ARAMA" | "RANDEVU" | "YER_GOSTERIMI" | "EVRAK_TAKIBI" | "FOTOGRAF_CEKIMI" | "FIYAT_GUNCELLEME" | "MUSTERI_TAKIBI";
export type NotificationStatus = "OKUNMADI" | "OKUNDU";
export type DocumentType = "TAPU" | "YETKI_BELGESI" | "KIMLIK" | "KIRA_SOZLESMESI" | "SATIS_SOZLESMESI" | "DEGERLEME";

export type User = {
  id: string;
  name: string;
  email: string;
  calendarEmail?: string;
  role: Role;
  title: string;
  phone: string;
  avatarColor: string;
  active: boolean;
  clientId?: string;
};

export type OfficeClient = {
  id: string;
  name: string;
  ownerName: string;
  inviteFromEmail?: string;
  userLimit: number;
  status: "Hazır" | "Kurulumda" | "Pasif";
  logoUrl?: string;
  createdAt: string;
};

export type Property = {
  id: string;
  title: string;
  listingType: PropertyType;
  price: number;
  currency: "TRY" | "USD" | "EUR";
  city: string;
  district: string;
  neighborhood: string;
  projectName: string;
  squareMeters: number;
  rooms: string;
  floor: string;
  buildingAge: string;
  furnished: boolean;
  description: string;
  features: string[];
  coverImage: string;
  gallery: string[];
  videoUrl: string;
  listingUrl: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  externalId?: string;
  syncedAt?: string;
  syncStatus?: PropertySyncStatus;
  sourceType?: PropertySourceType;
  consultantId: string;
  ownerName?: string;
  ownerPhone?: string;
  notes?: string[];
  status: PropertyStatus;
  createdAt: string;
};

export type Lead = {
  id: string;
  name: string;
  externalId?: string;
  email: string;
  phone: string;
  source: string;
  budget: number;
  interest: string;
  address?: string;
  propertyOwner?: string;
  propertyOwnerPhone?: string;
  customerType?: LeadCustomerType;
  tenantStatus?: "VAR" | "YOK" | "BILINMIYOR";
  tenantName?: string;
  tenantMoveIn?: string;
  tenantMoveOut?: string;
  tenantNotes?: string;
  preferredLocation?: string;
  propertyType?: string;
  interestedPropertyIds?: string[];
  appointmentAt?: string;
  importedById?: string;
  importSource?: string;
  importedAt?: string;
  status: LeadStatus;
  consultantId: string;
  notes: string;
  createdAt: string;
};

export type LeadAction = {
  id: string;
  leadId: string;
  userId: string;
  action: string;
  note: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  type?: TaskType;
  dueDate: string;
  endDate?: string;
  location?: string;
  reminderMinutes?: number;
  priority: "DUSUK" | "ORTA" | "YUKSEK";
  status: TaskStatus;
  googleCalendarEventId?: string;
  googleCalendarHtmlLink?: string;
  googleCalendarResponseStatus?: string;
  calendarInviteUrl?: string;
  calendarInviteStatus?: string;
  calendarInviteRespondedAt?: string;
  assignedToId: string;
  createdById: string;
  leadId?: string;
  propertyId?: string;
};

export type DocumentRecord = {
  id: string;
  title: string;
  type: DocumentType;
  relatedType: "PROPERTY" | "LEAD";
  relatedId: string;
  assignedToId: string;
  status: "BEKLIYOR" | "TAMAM" | "EKSIK";
  uploadedAt: string;
};

export type Notification = {
  id: string;
  title: string;
  message: string;
  targetUserId?: string;
  status: NotificationStatus;
  createdAt: string;
};

export type MarketComparable = {
  id: string;
  propertyId: string;
  source: "Sahibinden" | "Hepsiemlak" | "Emlakjet";
  title: string;
  url: string;
  price: number;
  squareMeters: number;
  district: string;
  lastCheckedAt: string;
  status: "AKTIF" | "PASIF" | "FIYAT_DEGISTI";
};

export type MarketListing = {
  id: string;
  source: "Sahibinden" | "Hepsiemlak" | "Emlakjet";
  title: string;
  url: string;
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  listingType: PropertyType;
  price: number;
  currency: "TRY" | "USD" | "EUR";
  squareMeters: number;
  rooms: string;
  status: "AKTIF" | "PASIF";
  listedAt: string;
};

export type PriceHistory = {
  id: string;
  propertyId: string;
  price: number;
  date: string;
};

export type MarketAnalysisReport = {
  id: string;
  propertyId: string;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  averageSqmPrice: number;
  competitorCount: number;
  pricePosition: string;
  suggestedMin: number;
  suggestedMax: number;
  consultantComment: string;
  createdAt: string;
};

export type ActivityLog = {
  id: string;
  userId: string;
  action: string;
  entity: string;
  createdAt: string;
};

export type Setting = {
  companyName: string;
  defaultCurrency: "TRY" | "USD" | "EUR";
  leadSlaHours: number;
  notificationEmail: string;
  lastSahibindenSyncAt?: string;
};

export type CrmData = {
  clients: OfficeClient[];
  users: User[];
  properties: Property[];
  leads: Lead[];
  leadActions: LeadAction[];
  tasks: Task[];
  documents: DocumentRecord[];
  notifications: Notification[];
  comparables: MarketComparable[];
  marketListings: MarketListing[];
  reports: MarketAnalysisReport[];
  priceHistory: PriceHistory[];
  activityLogs: ActivityLog[];
  setting: Setting;
};
