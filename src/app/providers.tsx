"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { CrmProvider } from "@/store/crm-store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CrmProvider>
        {children}
        <Toaster richColors position="top-right" />
      </CrmProvider>
    </SessionProvider>
  );
}
