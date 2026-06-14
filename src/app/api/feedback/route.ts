import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkRateLimit, rateLimitHeaders, rateLimitKey } from "@/lib/rate-limit";

const priorities = new Set(["DUSUK", "ORTA", "ACIL"]);
const statuses = new Set(["open", "in_progress", "resolved"]);
const maxScreenshotSize = 750 * 1024;

async function ensureFeedbackTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "FeedbackReport" (
      "id" TEXT NOT NULL,
      "userId" TEXT,
      "userEmail" TEXT,
      "pageUrl" TEXT NOT NULL,
      "userAgent" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "details" TEXT,
      "priority" TEXT NOT NULL DEFAULT 'ORTA',
      "screenshotUrl" TEXT,
      "errorContext" TEXT,
      "status" TEXT NOT NULL DEFAULT 'open',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "FeedbackReport_status_createdAt_idx" ON "FeedbackReport"("status", "createdAt")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "FeedbackReport_priority_createdAt_idx" ON "FeedbackReport"("priority", "createdAt")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "FeedbackReport_userId_createdAt_idx" ON "FeedbackReport"("userId", "createdAt")`;
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

async function screenshotDataUrl(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) {
    throw new Error("Ekran görüntüsü için görsel dosya yükleyin.");
  }
  if (file.size > maxScreenshotSize) {
    throw new Error("Ekran görüntüsü 750 KB altında olmalı.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

function requireAdmin(session: { user?: { role?: string } } | null) {
  return session?.user?.role === "ADMIN";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const actorEmail = session?.user?.email ?? "anonymous";
  const limit = checkRateLimit(rateLimitKey(request, "feedback:post", actorEmail), { max: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla bildirim gönderildi. Lütfen biraz sonra tekrar deneyin." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  try {
    await ensureFeedbackTable();
    const formData = await request.formData();
    const message = cleanText(formData.get("message"), 600);
    const details = cleanText(formData.get("details"), 2000);
    const pageUrl = cleanText(formData.get("pageUrl"), 1200) || new URL(request.url).origin;
    const userAgent = cleanText(formData.get("userAgent"), 1200) || request.headers.get("user-agent") || "Bilinmiyor";
    const errorContext = cleanText(formData.get("errorContext"), 3000);
    const priority = cleanText(formData.get("priority"), 20) || "ORTA";

    if (!message || message.length < 3) {
      return NextResponse.json({ error: "Kısa bir açıklama yazmanız yeterli." }, { status: 400 });
    }
    if (!priorities.has(priority)) {
      return NextResponse.json({ error: "Öncelik seçimi geçerli değil." }, { status: 400 });
    }

    const user = session?.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email } })
      : null;
    const screenshotUrl = await screenshotDataUrl(formData.get("screenshot"));

    const report = await prisma.feedbackReport.create({
      data: {
        userId: user?.id,
        userEmail: session?.user?.email ?? null,
        pageUrl,
        userAgent,
        message,
        details: details || null,
        priority,
        screenshotUrl,
        errorContext: errorContext || null,
        status: "open",
      },
      select: { id: true, createdAt: true },
    });

    console.info("[feedback] created", {
      id: report.id,
      userId: user?.id ?? null,
      userEmail: session?.user?.email ?? null,
      priority,
      pageUrl,
    });
    return NextResponse.json({ ok: true, id: report.id, createdAt: report.createdAt });
  } catch (error) {
    console.error("[feedback] create failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bildirim şu anda gönderilemedi." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!requireAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = checkRateLimit(rateLimitKey(request, "feedback:get", session?.user?.email), { max: 60, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "Çok fazla istek gönderildi." }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  try {
    await ensureFeedbackTable();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const where = id ? { id } : undefined;
    const reports = await prisma.feedbackReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: id ? 1 : 100,
      select: {
        id: true,
        userId: true,
        userEmail: true,
        pageUrl: true,
        userAgent: true,
        message: true,
        details: true,
        priority: true,
        screenshotUrl: true,
        errorContext: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[feedback] read failed", error);
    return NextResponse.json({ error: "Geri bildirimler okunamadı." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!requireAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await ensureFeedbackTable();
    const body = await request.json() as { id?: string; status?: string };
    if (!body.id || !body.status || !statuses.has(body.status)) {
      return NextResponse.json({ error: "Durum bilgisi geçerli değil." }, { status: 400 });
    }

    const report = await prisma.feedbackReport.update({
      where: { id: body.id },
      data: { status: body.status },
      select: { id: true, status: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    console.error("[feedback] update failed", error);
    return NextResponse.json({ error: "Bildirim durumu güncellenemedi." }, { status: 500 });
  }
}
