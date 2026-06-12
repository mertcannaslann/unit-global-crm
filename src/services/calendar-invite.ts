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
};

type SendCalendarInviteResult = {
  sent: boolean;
  mode: "email" | "mailto";
  calendarUrl: string;
  mailtoUrl: string;
  error?: string;
};

function encode(value: string) {
  return encodeURIComponent(value);
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

export function buildGoogleCalendarUrl(payload: EmailCalendarInvitePayload) {
  const start = calendarDate(payload.task.dueDate);
  const end = calendarDate(payload.task.endDate ?? defaultEndDate(payload.task.dueDate));
  const details = [
    payload.task.description,
    "",
    `${payload.companyName} CRM üzerinden oluşturuldu.`,
  ].filter(Boolean).join("\n");

  return [
    "https://calendar.google.com/calendar/render?action=TEMPLATE",
    `text=${encode(payload.task.title)}`,
    `dates=${start}/${end}`,
    `details=${encode(details)}`,
    `location=${encode(payload.task.location ?? "")}`,
  ].join("&");
}

export function buildIcsInvite(payload: EmailCalendarInvitePayload) {
  const start = calendarDate(payload.task.dueDate);
  const end = calendarDate(payload.task.endDate ?? defaultEndDate(payload.task.dueDate));
  const now = calendarDate(new Date().toISOString());
  const reminderMinutes = payload.task.reminderMinutes ?? 30;
  const uid = `${payload.task.id}@unit-crm`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Unit CRM//Calendar Invite//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsText(payload.task.title)}`,
    `DESCRIPTION:${icsText(payload.task.description)}`,
    `LOCATION:${icsText(payload.task.location)}`,
    `ORGANIZER;CN=${icsText(payload.companyName)}:mailto:${payload.organizerEmail}`,
    `ATTENDEE;CN=${icsText(payload.attendeeName ?? payload.attendeeEmail)};RSVP=TRUE:mailto:${payload.attendeeEmail}`,
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
  const calendarUrl = buildGoogleCalendarUrl(payload);
  const start = new Date(payload.task.dueDate);
  const end = new Date(payload.task.endDate ?? defaultEndDate(payload.task.dueDate));
  const timeLabel = `${start.toLocaleDateString("tr-TR")} ${start.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  const subject = `${payload.companyName} | ${payload.task.title}`;
  const text = [
    `${payload.companyName} takvim daveti`,
    "",
    payload.task.title,
    timeLabel,
    payload.task.location ? `Konum: ${payload.task.location}` : "",
    payload.task.description ? `Not: ${payload.task.description}` : "",
    "",
    `Takvime ekle: ${calendarUrl}`,
  ].filter(Boolean).join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:28px;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 18px 45px rgba(15,23,42,.08);">
        <p style="margin:0 0 8px;color:#64748b;font-size:14px;">${payload.companyName} takvim daveti</p>
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#0f172a;">${payload.task.title}</h1>
        <p style="margin:0 0 10px;font-size:15px;color:#334155;"><strong>Tarih:</strong> ${timeLabel}</p>
        ${payload.task.location ? `<p style="margin:0 0 10px;font-size:15px;color:#334155;"><strong>Konum:</strong> ${payload.task.location}</p>` : ""}
        ${payload.task.description ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#475569;">${payload.task.description}</p>` : ""}
        <a href="${calendarUrl}" style="display:inline-block;background:#1f57a4;color:#ffffff;text-decoration:none;border-radius:12px;padding:13px 18px;font-weight:700;">Takvime Ekle</a>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">Bu davet ${payload.companyName} CRM üzerinden hazırlanmıştır. Ekli .ics dosyası Apple Calendar, Outlook ve Google Calendar ile uyumludur.</p>
      </div>
    </div>
  `;

  return { subject, text, html, calendarUrl };
}

export async function sendCalendarInviteEmail(payload: EmailCalendarInvitePayload): Promise<SendCalendarInviteResult> {
  const { subject, text, html, calendarUrl } = buildCalendarInviteEmail(payload);
  const mailtoUrl = `mailto:${encode(payload.attendeeEmail)}?subject=${encode(subject)}&body=${encode(text)}`;
  const resendApiKey = process.env.RESEND_API_KEY;
  const verifiedFromEmail = process.env.CALENDAR_INVITE_FROM;

  if (!resendApiKey || !verifiedFromEmail) {
    return { sent: false, mode: "mailto", calendarUrl, mailtoUrl };
  }

  try {
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
        attachments: [
          {
            filename: "takvim-daveti.ics",
            content: Buffer.from(buildIcsInvite(payload)).toString("base64"),
          },
        ],
      }),
    });

    if (!response.ok) {
      return { sent: false, mode: "mailto", calendarUrl, mailtoUrl, error: "Mail servisi daveti gönderemedi." };
    }

    return { sent: true, mode: "email", calendarUrl, mailtoUrl };
  } catch {
    return { sent: false, mode: "mailto", calendarUrl, mailtoUrl, error: "Mail servisine ulaşılamadı." };
  }
}
