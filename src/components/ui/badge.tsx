import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  AKTIF: "bg-blue-50 text-blue-700 border-blue-200",
  PASIF: "bg-slate-100 text-slate-600 border-slate-200",
  OPSIYONLU: "bg-sky-50 text-sky-700 border-sky-200",
  SATILDI: "bg-indigo-50 text-indigo-700 border-indigo-200",
  KIRALANDI: "bg-cyan-50 text-cyan-700 border-cyan-200",
  YENI_LEAD: "bg-blue-50 text-blue-700 border-blue-200",
  ARANDI: "bg-sky-50 text-sky-700 border-sky-200",
  RANDEVU_ALINDI: "bg-indigo-50 text-indigo-700 border-indigo-200",
  YER_GOSTERILDI: "bg-cyan-50 text-cyan-700 border-cyan-200",
  TEKLIF_VERILDI: "bg-purple-50 text-purple-700 border-purple-200",
  KAPANDI: "bg-emerald-50 text-emerald-700 border-emerald-200",
  KAYBEDILDI: "bg-rose-50 text-rose-700 border-rose-200",
  TAMAMLANDI: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DEVAM: "bg-sky-50 text-sky-700 border-sky-200",
  ACIK: "bg-blue-50 text-blue-700 border-blue-200",
};

const labels: Record<string, string> = {
  YENI_LEAD: "Yeni Lead",
  ARANDI: "Arandı",
  RANDEVU_ALINDI: "Randevu Alındı",
  YER_GOSTERILDI: "Yer Gösterildi",
  TEKLIF_VERILDI: "Teklif Verildi",
  KAPANDI: "Kapandı",
  KAYBEDILDI: "Kaybedildi",
  ACIK: "Açık",
  DEVAM: "Devam",
  TAMAMLANDI: "Tamamlandı",
};

export function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", styles[label] ?? "border-border bg-muted text-foreground", className)}>
      {labels[label] ?? label.replaceAll("_", " ")}
    </span>
  );
}
