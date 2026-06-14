"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { FeedbackWidget } from "@/components/app/feedback-widget";
import { CrmProvider } from "@/store/crm-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CrmProvider>
        {children}
        <FeedbackWidget />
        <Toaster richColors position="top-right" />
      </CrmProvider>
    </SessionProvider>
  );
}
