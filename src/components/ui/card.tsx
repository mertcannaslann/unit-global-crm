import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-lg border border-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</section>;
}
