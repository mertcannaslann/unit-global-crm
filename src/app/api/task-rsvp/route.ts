import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { initialData } from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";
import type { CalendarInviteResponse } from "@/services/calendar-invite";
import { verifyTaskRsvp } from "@/services/calendar-invite";
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

function responsePage(title: string, message: string, status = 200) {
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
        </style>
      </head>
      <body>
        <main>
          <h1>${safeTitle}</h1>
          <p>${safeMessage}</p>
          <p><a href="/">CRM'e dön</a></p>
        </main>
      </body>
    </html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId") ?? "";
  const response = url.searchParams.get("response") as CalendarInviteResponse | null;
  const token = url.searchParams.get("token") ?? "";

  if (!taskId || !response || !allowedResponses.has(response) || !verifyTaskRsvp(taskId, response, token)) {
    return responsePage("Yanıt doğrulanamadı", "Bu davet linki geçersiz veya süresi dolmuş olabilir.", 400);
  }

  const state = await prisma.crmState.findUnique({ where: { id: CRM_STATE_ID } });
  const currentData = (state?.data as CrmData | null) ?? initialData;
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
    return responsePage("Görev bulunamadı", "Bu davete bağlı görev CRM içinde bulunamadı.", 404);
  }

  await prisma.crmState.upsert({
    where: { id: CRM_STATE_ID },
    create: { id: CRM_STATE_ID, data: nextData as unknown as Prisma.InputJsonValue },
    update: { data: nextData as unknown as Prisma.InputJsonValue },
  });

  return responsePage("Yanıt kaydedildi", `${taskTitle} görevi için yanıtın CRM'e ${responseLabels[response]} olarak işlendi.`);
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
