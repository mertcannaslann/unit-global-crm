import { format } from "date-fns";
import { tr } from "date-fns/locale";

export function money(value: number, currency = "TRY") {
  if (!value) {
    return "-";
  }

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function number(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function shortDate(date: string) {
  return format(new Date(date), "d MMM", { locale: tr });
}
