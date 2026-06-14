import { createHmac, timingSafeEqual } from "node:crypto";

export type CalendarInviteResponse = "accepted" | "tentative" | "declined";

export type EmailCalendarInvitePayload = {
  task: {
    id: string;
    title: string;
    description?: string;
    dueDate: string;
    endDate?: string;
    location?: string;
    reminderMinutes?: number;
  };
  attendeeEmail: string;
  attendeeName?: string;
  companyName: string;
  organizerEmail: string;
  companyLogoUrl?: string;
};

type SendCalendarInviteResult = {
  sent: boolean;
  mode: "email";
  rsvpEnabled?: boolean;
  error?: string;
};

const responseLabels: Record<CalendarInviteResponse, string> = {
  accepted: "Kabul Et",
  tentative: "Belki",
  declined: "Reddet",
};

function appBaseUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function rsvpSecret() {
  return process.env.TASK_RSVP_SECRET || process.env.NEXTAUTH_SECRET || process.env.RESEND_API_KEY || "unit-crm-rsvp-dev";
}

function rsvpTrackingEnabled() {
  return Boolean(process.env.TASK_RSVP_SECRET || process.env.NEXTAUTH_SECRET);
}

export function signTaskRsvp(taskId: string, response: CalendarInviteResponse) {
  return createHmac("sha256", rsvpSecret()).update(`${taskId}:${response}`).digest("hex");
}

export function verifyTaskRsvp(taskId: string, response: CalendarInviteResponse, token: string) {
  const expected = signTaskRsvp(taskId, response);
  const expectedBuffer = Buffer.from(expected);
  const tokenBuffer = Buffer.from(token);
  return expectedBuffer.length === tokenBuffer.length && timingSafeEqual(expectedBuffer, tokenBuffer);
}

function taskRsvpUrl(taskId: string, response: CalendarInviteResponse) {
  const url = new URL("/api/task-rsvp", appBaseUrl());
  url.searchParams.set("taskId", taskId);
  url.searchParams.set("response", response);
  url.searchParams.set("token", signTaskRsvp(taskId, response));
  return url.toString();
}

function calendarDate(value: string) {
  const date = new Date(value);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value?: string) {
  return (value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function defaultEndDate(startDate: string) {
  return new Date(new Date(startDate).getTime() + 60 * 60 * 1000).toISOString();
}

function htmlText(value?: string) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resendErrorMessage(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (text.includes("Testing domain restriction")) {
    return "Resend test domaini sadece hesap e-postasına gönderir. Diğer danışmanlara mail için domain doğrulaması gerekli.";
  }
  if (text.includes("domain")) {
    return "Mail domain doğrulaması gerekli.";
  }
  return "Mail servisi daveti gönderemedi.";
}

export function buildIcsInvite(payload: EmailCalendarInvitePayload) {
  const start = calendarDate(payload.task.dueDate);
  const end = calendarDate(payload.task.endDate ?? defaultEndDate(payload.task.dueDate));
  const now = calendarDate(new Date().toISOString());
  const reminderMinutes = payload.task.reminderMinutes ?? 30;
  const uid = `${payload.task.id}@estafy-crm`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Estafy CRM//Calendar Invite//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    "SEQUENCE:0",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsText(payload.task.title)}`,
    `DESCRIPTION:${icsText([payload.task.description, "", `${payload.companyName} CRM üzerinde oluşturuldu.`].filter(Boolean).join("\n"))}`,
    `LOCATION:${icsText(payload.task.location)}`,
    `ORGANIZER;CN=${icsText(payload.companyName)}:mailto:${payload.organizerEmail}`,
    `ATTENDEE;CN=${icsText(payload.attendeeName ?? payload.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${payload.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(payload.task.title)}`,
    `TRIGGER:-PT${reminderMinutes}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function buildCalendarInviteEmail(payload: EmailCalendarInvitePayload) {
  const start = new Date(payload.task.dueDate);
  const end = new Date(payload.task.endDate ?? defaultEndDate(payload.task.dueDate));
  const timeLabel = `${start.toLocaleDateString("tr-TR")} ${start.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  const recipientName = payload.attendeeName?.trim() || payload.attendeeEmail;
  const subject = `${recipientName} | Görev Daveti`;
  const companyName = htmlText(payload.companyName);
  const title = htmlText(payload.task.title);
  const recipientTitle = htmlText(recipientName);
  const description = htmlText(payload.task.description);
  const location = htmlText(payload.task.location);
  const logoUrl = htmlText(payload.companyLogoUrl);
  const rsvpLinks = (["accepted", "tentative", "declined"] as const).map((response) => ({
    response,
    label: responseLabels[response],
    url: taskRsvpUrl(payload.task.id, response),
  }));
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" style="display:block;max-width:190px;max-height:58px;object-fit:contain;border:0;margin:0;" />`
    : `<div style="height:42px;width:42px;border-radius:14px;background:#0f172a;color:#ffffff;font-weight:700;font-size:14px;display:inline-flex;align-items:center;justify-content:center;">CRM</div>`;
  const text = [
    `${payload.companyName} görev daveti`,
    "",
    recipientName,
    `Görev: ${payload.task.title}`,
    timeLabel,
    payload.task.location ? `Konum: ${payload.task.location}` : "",
    payload.task.description ? `Not: ${payload.task.description}` : "",
    "",
    "Yanıt linkleri:",
    ...rsvpLinks.map((item) => `${item.label}: ${item.url}`),
    "",
    "Bu görev CRM üzerinde oluşturuldu. Davet yanıtı e-posta/takvim uygulamasından verilebilir.",
  ].filter(Boolean).join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f3f7fc;padding:30px;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe6f3;border-radius:22px;overflow:hidden;box-shadow:0 22px 60px rgba(15,23,42,.10);">
        <div style="padding:26px 30px 18px;border-bottom:1px solid #eef2f7;background:linear-gradient(135deg,#ffffff 0%,#f5f9ff 100%);">
          ${logoBlock}
          <p style="margin:18px 0 7px;color:#2563eb;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Görev daveti</p>
          <h1 style="margin:0;font-size:25px;line-height:1.25;color:#0f172a;font-weight:800;">${recipientTitle}</h1>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;line-height:1.5;">${companyName} CRM üzerinden yeni görev atandı.</p>
        </div>
        <div style="padding:26px 30px 30px;">
          <div style="margin:0 0 22px;border:1px solid #dbeafe;background:#f8fbff;border-radius:18px;padding:18px 18px 16px;">
            <p style="margin:0 0 12px;color:#1e3a8a;font-size:14px;font-weight:800;">Davet yanıtı</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px 0;">
              <tr>
                <td><a href="${htmlText(rsvpLinks[0].url)}" style="display:inline-block;border-radius:999px;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:14px;font-weight:800;">${rsvpLinks[0].label}</a></td>
                <td><a href="${htmlText(rsvpLinks[1].url)}" style="display:inline-block;border-radius:999px;background:#f59e0b;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:14px;font-weight:800;">${rsvpLinks[1].label}</a></td>
                <td><a href="${htmlText(rsvpLinks[2].url)}" style="display:inline-block;border-radius:999px;background:#ef4444;color:#ffffff;text-decoration:none;padding:12px 18px;font-size:14px;font-weight:800;">${rsvpLinks[2].label}</a></td>
              </tr>
            </table>
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0 10px;margin:0 0 18px;">
            <tr>
              <td style="width:92px;color:#64748b;font-size:13px;font-weight:700;">Görev</td>
              <td style="color:#0f172a;font-size:15px;font-weight:700;">${title}</td>
            </tr>
            <tr>
              <td style="width:92px;color:#64748b;font-size:13px;font-weight:700;">Tarih</td>
              <td style="color:#0f172a;font-size:15px;font-weight:700;">${timeLabel}</td>
            </tr>
            ${payload.task.location ? `
            <tr>
              <td style="width:92px;color:#64748b;font-size:13px;font-weight:700;">Konum</td>
              <td style="color:#334155;font-size:15px;line-height:1.5;">${location}</td>
            </tr>` : ""}
            <tr>
              <td style="width:92px;color:#64748b;font-size:13px;font-weight:700;">Durum</td>
              <td><span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;padding:7px 11px;color:#1d4ed8;font-size:13px;font-weight:700;">Davet gönderildi</span></td>
            </tr>
          </table>
          ${payload.task.description ? `<div style="margin:0 0 20px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:16px;padding:16px 18px;color:#334155;font-size:15px;line-height:1.65;">${description}</div>` : ""}
          <div style="margin:0 0 20px;">
            <p style="margin:0 0 10px;color:#64748b;font-size:13px;font-weight:700;">Yanıt linkleri</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px 0;">
              <tr>
                <td><a href="${htmlText(rsvpLinks[0].url)}" style="display:inline-block;border-radius:999px;background:#16a34a;color:#ffffff;text-decoration:none;padding:11px 16px;font-size:14px;font-weight:800;">${rsvpLinks[0].label}</a></td>
                <td><a href="${htmlText(rsvpLinks[1].url)}" style="display:inline-block;border-radius:999px;background:#f59e0b;color:#ffffff;text-decoration:none;padding:11px 16px;font-size:14px;font-weight:800;">${rsvpLinks[1].label}</a></td>
                <td><a href="${htmlText(rsvpLinks[2].url)}" style="display:inline-block;border-radius:999px;background:#ef4444;color:#ffffff;text-decoration:none;padding:11px 16px;font-size:14px;font-weight:800;">${rsvpLinks[2].label}</a></td>
              </tr>
            </table>
          </div>
          <div style="border:1px solid #dbeafe;background:#f0f7ff;border-radius:16px;padding:15px 17px;color:#1e3a8a;font-size:14px;line-height:1.65;">
            Bu görev ${companyName} CRM üzerinde oluşturuldu. Daveti e-posta veya takvim uygulamandan yanıtlayabilirsin.
          </div>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">
            Ekli .ics daveti Apple Calendar, Outlook ve Google Calendar ile uyumludur.
          </p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

export async function sendCalendarInviteEmail(payload: EmailCalendarInvitePayload): Promise<SendCalendarInviteResult> {
  const { subject, text, html } = buildCalendarInviteEmail(payload);
  const resendApiKey = process.env.RESEND_API_KEY;
  const verifiedFromEmail = process.env.CALENDAR_INVITE_FROM;

  if (!resendApiKey || !verifiedFromEmail) {
    return { sent: false, mode: "email", rsvpEnabled: false, error: "Mail servisi bağlı değil." };
  }

  try {
    const icsInvite = buildIcsInvite(payload);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${payload.companyName} <${verifiedFromEmail}>`,
        to: [payload.attendeeEmail],
        reply_to: payload.organizerEmail,
        subject,
        html,
        text,
        headers: {
          "Content-Class": "urn:content-classes:calendarmessage",
          "X-CRM-Task-ID": payload.task.id,
        },
        attachments: [
          {
            filename: "gorev-daveti.ics",
            content: Buffer.from(icsInvite).toString("base64"),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => response.text().catch(() => ""));
      return { sent: false, mode: "email", rsvpEnabled: false, error: resendErrorMessage(errorBody) };
    }

    return { sent: true, mode: "email", rsvpEnabled: rsvpTrackingEnabled() };
  } catch {
    return { sent: false, mode: "email", rsvpEnabled: false, error: "Mail servisine ulaşılamadı." };
  }
}
