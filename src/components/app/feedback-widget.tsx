"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bug, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FeedbackSource = "manual" | "error";

function errorToText(value: unknown) {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`.trim();
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Bilinmeyen hata";
  }
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<FeedbackSource>("manual");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("ORTA");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [lastErrorContext, setLastErrorContext] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  const openFeedback = useCallback((nextSource: FeedbackSource, errorContext = "") => {
    setSource(nextSource);
    if (errorContext) setLastErrorContext(errorContext.slice(0, 3000));
    if (nextSource === "error") {
      setMessage((current) => current || "Bir sorun oluştu.");
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      openFeedback("error", errorToText(event.error ?? event.message));
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      openFeedback("error", errorToText(event.reason));
    }

    function handleOpenFeedback(event: Event) {
      const detail = (event as CustomEvent<{ errorContext?: string }>).detail;
      openFeedback(detail?.errorContext ? "error" : "manual", detail?.errorContext);
    }

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("estafy:open-feedback", handleOpenFeedback);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("estafy:open-feedback", handleOpenFeedback);
    };
  }, [openFeedback]);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!open) return;
      const target = event.target as Node;
      if (modalRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  async function submitFeedback() {
    if (message.trim().length < 3) {
      toast.error("Kısa bir açıklama yazmanız yeterli.");
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.set("message", message);
      formData.set("details", details);
      formData.set("priority", priority);
      formData.set("pageUrl", typeof window !== "undefined" ? window.location.href : pathname);
      formData.set("userAgent", typeof navigator !== "undefined" ? navigator.userAgent : "Bilinmiyor");
      formData.set("errorContext", lastErrorContext);
      if (screenshot) formData.set("screenshot", screenshot);

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Bildirim gönderilemedi.");

      toast.success("Bildirim alındı");
      setOpen(false);
      setMessage("");
      setDetails("");
      setPriority("ORTA");
      setScreenshot(null);
      setLastErrorContext("");
      setSource("manual");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bildirim şu anda gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-primary shadow-[0_18px_45px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:bg-[#f5f9ff]"
        onClick={() => openFeedback("manual")}
        aria-label="Hata bildir"
      >
        <Bug className="h-4 w-4" />
        Hata Bildir
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/30 p-4 backdrop-blur-sm md:place-items-center">
          <div ref={modalRef} className="w-full max-w-xl">
          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${source === "error" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-primary"}`}>
                  {source === "error" ? <AlertTriangle className="h-5 w-5" /> : <Bug className="h-5 w-5" />}
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">{source === "error" ? "Bir sorun oluştu" : "Hata Bildir"}</h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {source === "error" ? "İstersen bize kısa bir not bırak; teknik detayları arka planda ekleyeceğiz." : "Ne olduğunu kısaca yazman yeterli. Ekran görüntüsü eklemek isteğe bağlı."}
                  </p>
                </div>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Kapat">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Ne oldu?</span>
                <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Örn: Portföy kaydederken sayfa dondu" />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Ne yapmaya çalışıyordunuz?</span>
                <Textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="İstersen birkaç cümleyle anlat" />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Öncelik</span>
                  <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                    <option value="DUSUK">Düşük</option>
                    <option value="ORTA">Orta</option>
                    <option value="ACIL">Acil</option>
                  </Select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Ekran görüntüsü</span>
                  <label className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm text-muted-foreground hover:bg-slate-50">
                    <span className="truncate">{screenshot ? screenshot.name : "İsteğe bağlı"}</span>
                    <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      className="hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </label>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Vazgeç
                </Button>
                <Button type="button" onClick={submitFeedback} disabled={sending}>
                  <Send className="h-4 w-4" />
                  {sending ? "Gönderiliyor" : "Gönder"}
                </Button>
              </div>
            </div>
          </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
