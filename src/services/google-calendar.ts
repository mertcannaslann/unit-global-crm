type GoogleCalendarConnectionRecord = {
  id: string;
  userEmail: string;
  googleEmail: string | null;
  calendarId: string;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  tokenType: string | null;
  expiryDate: Date | null;
  syncToken: string | null;
};

export type CalendarTaskPayload = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  endDate?: string;
  location?: string;
  reminderMinutes?: number;
  type?: string;
};

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

export function googleCalendarConfigReady() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleOAuthRedirectUri() {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/google-calendar/callback`;
}

export function buildGoogleOAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleOAuthRedirectUri(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleOAuthRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  }>;
}

export async function refreshGoogleAccessToken(connection: GoogleCalendarConnectionRecord) {
  if (!connection.refreshToken) {
    throw new Error("Google Calendar refresh token bulunamadı.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth refresh failed: ${response.status}`);
  }

  return response.json() as Promise<{
    access_token: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  }>;
}

function eventEndDate(task: CalendarTaskPayload) {
  if (task.endDate) return new Date(task.endDate);
  return new Date(new Date(task.dueDate).getTime() + 60 * 60 * 1000);
}

export function buildCalendarEvent(task: CalendarTaskPayload, attendeeEmail: string) {
  const start = new Date(task.dueDate);
  const end = eventEndDate(task);
  const reminderMinutes = task.reminderMinutes ?? 30;

  return {
    summary: task.title,
    description: task.description,
    location: task.location || undefined,
    start: {
      dateTime: start.toISOString(),
      timeZone: "Europe/Istanbul",
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: "Europe/Istanbul",
    },
    attendees: [
      {
        email: attendeeEmail,
        responseStatus: "needsAction",
      },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: reminderMinutes },
        { method: "email", minutes: reminderMinutes },
      ],
    },
    extendedProperties: {
      shared: {
        crmTaskId: task.id,
        crmTaskType: task.type ?? "RANDEVU",
      },
    },
  };
}

export async function insertCalendarEvent(connection: GoogleCalendarConnectionRecord, task: CalendarTaskPayload, attendeeEmail: string) {
  const calendarId = encodeURIComponent(connection.calendarId || "primary");
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildCalendarEvent(task, attendeeEmail)),
  });

  if (!response.ok) {
    throw new Error(`Google Calendar event insert failed: ${response.status}`);
  }

  return response.json() as Promise<{
    id: string;
    htmlLink?: string;
    attendees?: Array<{ email?: string; responseStatus?: string }>;
  }>;
}

export async function listCalendarChanges(connection: GoogleCalendarConnectionRecord) {
  const calendarId = encodeURIComponent(connection.calendarId || "primary");
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
  });
  if (connection.syncToken) params.set("syncToken", connection.syncToken);
  else params.set("timeMin", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar sync failed: ${response.status}`);
  }

  return response.json() as Promise<{
    nextSyncToken?: string;
    items?: Array<{
      id: string;
      htmlLink?: string;
      attendees?: Array<{ email?: string; responseStatus?: string }>;
      extendedProperties?: { shared?: Record<string, string> };
    }>;
  }>;
}
