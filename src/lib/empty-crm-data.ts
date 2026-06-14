import type { CrmData } from "./types";

export const emptyCrmData: CrmData = {
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
    companyName: "Estafy CRM",
    defaultCurrency: "TRY",
    leadSlaHours: 24,
    notificationEmail: "",
  },
};
