import type { Prisma } from "@prisma/client";
import { emptyCrmData } from "@/lib/empty-crm-data";
import { prisma } from "@/lib/prisma";
import type { CalendarInviteResponse } from "@/services/calendar-invite";
import { verifyTaskRsvp } from "@/services/calendar-invite";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import type { CrmData } from "@/lib/types";

const CRM_STATE_ID = "primary";
const allowedResponses = new Set<CalendarInviteResponse>(["accepted", "tentative", "declined"]);
const responseLabels: Record<CalendarInviteResponse, string> = {
  accepted: "Kabul edildi",
  tentative: "Belki",
  declined: "Reddedildi",
};

function htmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function responsePage(title: string, message: string, status = 200, body = "") {
  const safeTitle = htmlText(title);
  const safeMessage = htmlText(message);
  return new Response(`<!doctype html>
    <html lang="tr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
        <style>
          body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f4f8fc;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:24px}
          main{max-width:520px;background:white;border:1px solid #dbe6f3;border-radius:24px;box-shadow:0 24px 70px rgba(15,23,42,.12);padding:34px}
          p{color:#64748b;line-height:1.6}
          a{color:#1d4ed8;font-weight:700;text-decoration:none}
          button{border:0;border-radius:999px;background:#1d4ed8;color:white;font-weight:800;font-size:15px;padding:13px 18px;cursor:pointer}
          .secondary{display:inline-block;margin-left:12px;color:#64748b;font-weight:700}
        </style>
      </head>
      <body>
        <main>
          <h1>${safeTitle}</h1>
          <p>${safeMessage}</p>
          ${body}
          <p><a href="/">CRM'e dön</a></p>
        </main>
      </body>
    </html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function confirmationPage(taskId: string, response: CalendarInviteResponse, token: string) {
  const label = responseLabels[response];
  return responsePage(
    "Yanıtını onayla",
    `Bu görev davetine "${label}" yanıtı vermek üzeresin. Onayladığında CRM'deki görev durumu güncellenecek.`,
    200,
    `<form method="post" action="/api/task-rsvp">
      <input type="hidden" name="taskId" value="${htmlText(taskId)}" />
      <input type="hidden" name="response" value="${htmlText(response)}" />
      <input type="hidden" name="token" value="${htmlText(token)}" />
      <button type="submit">${htmlText(label)} olarak kaydet</button>
      <a class="secondary" href="/">Vazgeç</a>
    </form>`,
  );
}

async function saveTaskResponse(taskId: string, response: CalendarInviteResponse) {
  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  const currentData = (state?.data as CrmData | null) ?? emptyCrmData;
  let taskTitle = "";
  const respondedAt = new Date().toISOString();
  const nextData: CrmData = {
    ...currentData,
    tasks: currentData.tasks.map((task) => {
      if (task.id !== taskId) return task;
      taskTitle = task.title;
      return {
        ...task,
        googleCalendarResponseStatus: response,
        calendarInviteStatus: "Yanıt alındı",
        calendarInviteRespondedAt: respondedAt,
      };
    }),
  };

  if (!taskTitle) {
    return { ok: false, status: 404, title: "", message: "Bu davete bağlı görev CRM içinde bulunamadı." };
  }

  await prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: nextData as unknown as Prisma.InputJsonValue },
    update: { data: nextData as unknown as Prisma.InputJsonValue },
  });

  return {
    ok: true,
    status: 200,
    title: taskTitle,
    message: `${taskTitle} görevi için yanıtın CRM'e ${responseLabels[response]} olarak işlendi.`,
  };
}

export async function GET(request: Request) {
  const limit = checkRateLimit(rateLimitKey(request, "task-rsvp"), { max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return responsePage("Çok fazla deneme", "Bu davet linki kısa süre içinde çok fazla denendi.", 429);
  }

  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId") ?? "";
  const response = url.searchParams.get("response") as CalendarInviteResponse | null;
  const token = url.searchParams.get("token") ?? "";

  if (!taskId || !response || !allowedResponses.has(response) || !verifyTaskRsvp(taskId, response, token)) {
    return responsePage("Yanıt doğrulanamadı", "Bu davet linki geçersiz veya süresi dolmuş olabilir.", 400);
  }

  return confirmationPage(taskId, response, token);
}

export async function POST(request: Request) {
  const limit = checkRateLimit(rateLimitKey(request, "task-rsvp"), { max: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return responsePage("Çok fazla deneme", "Bu davet linki kısa süre içinde çok fazla denendi.", 429);
  }

  const formData = await request.formData();
  const taskId = String(formData.get("taskId") ?? "");
  const response = String(formData.get("response") ?? "") as CalendarInviteResponse;
  const token = String(formData.get("token") ?? "");

  if (!taskId || !allowedResponses.has(response) || !verifyTaskRsvp(taskId, response, token)) {
    return responsePage("Yanıt doğrulanamadı", "Bu davet linki geçersiz veya süresi dolmuş olabilir.", 400);
  }

  const result = await saveTaskResponse(taskId, response);
  if (!result.ok) {
    return responsePage("Görev bulunamadı", result.message, result.status);
  }

  return responsePage("Yanıt kaydedildi", result.message);
}
