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
  mode: "email";
  error?: string;
};

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
  const subject = `Görev Daveti: ${payload.task.title}`;
  const text = [
    `${payload.companyName} görev daveti`,
    "",
    payload.task.title,
    timeLabel,
    payload.task.location ? `Konum: ${payload.task.location}` : "",
    payload.task.description ? `Not: ${payload.task.description}` : "",
    "",
    "Bu görev CRM üzerinde oluşturuldu. Davet yanıtı e-posta/takvim uygulamasından verilebilir.",
  ].filter(Boolean).join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;padding:28px;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 18px 45px rgba(15,23,42,.08);">
        <p style="margin:0 0 8px;color:#64748b;font-size:14px;">${payload.companyName} görev daveti</p>
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#0f172a;">${payload.task.title}</h1>
        <p style="margin:0 0 10px;font-size:15px;color:#334155;"><strong>Tarih:</strong> ${timeLabel}</p>
        ${payload.task.location ? `<p style="margin:0 0 10px;font-size:15px;color:#334155;"><strong>Konum:</strong> ${payload.task.location}</p>` : ""}
        ${payload.task.description ? `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#475569;">${payload.task.description}</p>` : ""}
        <div style="border:1px solid #dbeafe;background:#eff6ff;border-radius:14px;padding:14px 16px;color:#1e3a8a;font-size:14px;line-height:1.6;">
          Bu görev ${payload.companyName} CRM üzerinde oluşturuldu. Daveti e-posta veya takvim uygulamandan yanıtlayabilirsin.
        </div>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">Ekli .ics daveti Apple Calendar, Outlook ve Google Calendar ile uyumludur.</p>
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
    return { sent: false, mode: "email", error: "Mail servisi bağlı değil." };
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
      return { sent: false, mode: "email", error: "Mail servisi daveti gönderemedi." };
    }

    return { sent: true, mode: "email" };
  } catch {
    return { sent: false, mode: "email", error: "Mail servisine ulaşılamadı." };
  }
}
