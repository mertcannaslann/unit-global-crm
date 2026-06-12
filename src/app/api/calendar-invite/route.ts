import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendCalendarInviteEmail } from "@/services/calendar-invite";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as {
    task?: {
      id: string;
      title: string;
      description?: string;
      dueDate: string;
      endDate?: string;
      location?: string;
      reminderMinutes?: number;
    };
    attendeeEmail?: string;
    attendeeName?: string;
    companyName?: string;
    organizerEmail?: string;
  };

  const attendeeEmail = body.attendeeEmail?.trim().toLowerCase();
  const organizerEmail = body.organizerEmail?.trim().toLowerCase() || session.user.email;
  if (!body.task?.title || !body.task.dueDate || !attendeeEmail || !emailPattern.test(attendeeEmail) || !emailPattern.test(organizerEmail)) {
    return NextResponse.json({ error: "Davet için görev, danışman e-postası ve gönderen e-postası gerekli." }, { status: 400 });
  }

  const result = await sendCalendarInviteEmail({
    task: body.task,
    attendeeEmail,
    attendeeName: body.attendeeName,
    companyName: body.companyName?.trim() || "Unit CRM",
    organizerEmail,
  });

  if (!result.sent) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}
