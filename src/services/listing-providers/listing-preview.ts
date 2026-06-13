import type { Property } from "@/lib/types";

export type ListingPreview = {
  externalId: string;
  title: string;
  listingType: Property["listingType"];
  price: number;
  currency: Property["currency"];
  city: string;
  district: string;
  neighborhood: string;
  projectName: string;
  squareMeters: number;
  rooms: string;
  floor: string;
  buildingAge: string;
  furnished: boolean;
  description: string;
  features: string[];
  coverImage: string;
  gallery: string[];
  videoUrl: string;
  sourcePlatform: string;
  sourceUrl: string;
  sourceType: NonNullable<Property["sourceType"]>;
  status: Property["status"];
  confidence: "KNOWN_LISTING" | "LIVE_LISTING";
};

const previewImages = {
  residence: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
  balcony: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80",
  cadde: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
  garden: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80",
  city: "https://images.unsplash.com/photo-1600573472591-ee6981cf35b6?auto=format&fit=crop&w=900&q=80",
};

const knownListings: Record<string, Omit<ListingPreview, "sourceUrl">> = {
  "1320111999": {
    externalId: "1320111999",
    title: "Bomonti'de genç binada full eşyalı 1+1",
    listingType: "KIRALIK",
    price: 52000,
    currency: "TRY",
    city: "İstanbul",
    district: "Şişli",
    neighborhood: "Cumhuriyet Mah.",
    projectName: "Bomonti",
    squareMeters: 65,
    rooms: "1+1",
    floor: "6",
    buildingAge: "16-20 yıl",
    furnished: true,
    description: "Sahibinden kaynak linkinden hazırlanan Unit Global ön izleme kaydı. Full eşyalı, genç bina, 1+1 kiralık daire.",
    features: ["Full eşyalı", "Merkezi konum", "1+1", "Kiralık"],
    coverImage: previewImages.city,
    gallery: [previewImages.city, previewImages.balcony, previewImages.residence],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
  "1315547901": {
    externalId: "1315547901",
    title: "Avrupa Konutları Yamanevler'de lüks eşyalı 1+1",
    listingType: "KIRALIK",
    price: 65000,
    currency: "TRY",
    city: "İstanbul",
    district: "Ümraniye",
    neighborhood: "Yamanevler",
    projectName: "Avrupa Konutları Yamanevler",
    squareMeters: 70,
    rooms: "1+1",
    floor: "Ara kat",
    buildingAge: "0-5 yıl",
    furnished: true,
    description: "Avrupa Konutları Yamanevler kaynaklı lüks eşyalı 1+1 kiralık portföy ön izlemesi.",
    features: ["Lüks eşyalı", "Balkon", "Site", "1+1"],
    coverImage: previewImages.balcony,
    gallery: [previewImages.balcony, previewImages.residence, previewImages.cadde],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
  "1320562851": {
    externalId: "1320562851",
    title: "Avrupa Konutları Esentepe'de lüks eşyalı 1+1",
    listingType: "KIRALIK",
    price: 60000,
    currency: "TRY",
    city: "İstanbul",
    district: "Kartal",
    neighborhood: "Esentepe",
    projectName: "Avrupa Konutları Esentepe",
    squareMeters: 68,
    rooms: "1+1",
    floor: "Ara kat",
    buildingAge: "0-5 yıl",
    furnished: true,
    description: "Avrupa Konutları Esentepe kaynaklı lüks eşyalı 1+1 kiralık portföy ön izlemesi.",
    features: ["Lüks eşyalı", "Balkon", "Site", "Kiralık"],
    coverImage: previewImages.residence,
    gallery: [previewImages.residence, previewImages.balcony],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
  "1321161157": {
    externalId: "1321161157",
    title: "Andromeda Gold'da yüksek kat lüks eşyalı 2+1 teraslı",
    listingType: "KIRALIK",
    price: 95000,
    currency: "TRY",
    city: "İstanbul",
    district: "Ataşehir",
    neighborhood: "Barbaros",
    projectName: "Andromeda Gold",
    squareMeters: 120,
    rooms: "2+1",
    floor: "Yüksek kat",
    buildingAge: "6-10 yıl",
    furnished: true,
    description: "Andromeda Gold kaynaklı yüksek kat, teraslı, lüks eşyalı 2+1 kiralık portföy ön izlemesi.",
    features: ["Yüksek kat", "Teras", "Lüks eşyalı", "Rezidans"],
    coverImage: previewImages.residence,
    gallery: [previewImages.residence, previewImages.city, previewImages.balcony],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
  "1320353975": {
    externalId: "1320353975",
    title: "Caddebostan'da yeni binada full eşyalı 3+1",
    listingType: "KIRALIK",
    price: 165000,
    currency: "TRY",
    city: "İstanbul",
    district: "Kadıköy",
    neighborhood: "Caddebostan",
    projectName: "Caddebostan",
    squareMeters: 155,
    rooms: "3+1",
    floor: "Ara kat",
    buildingAge: "0-5 yıl",
    furnished: true,
    description: "Caddebostan kaynaklı yeni bina, full eşyalı 3+1 kiralık portföy ön izlemesi.",
    features: ["Yeni bina", "Full eşyalı", "3+1", "Caddebostan"],
    coverImage: previewImages.cadde,
    gallery: [previewImages.cadde, previewImages.balcony, previewImages.garden],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
  "1317104822": {
    externalId: "1317104822",
    title: "Çınarköy Evleri'nde orman cepheli 3+1 özel bahçeli",
    listingType: "KIRALIK",
    price: 185000,
    currency: "TRY",
    city: "İstanbul",
    district: "Beykoz",
    neighborhood: "Çubuklu",
    projectName: "Çınarköy Evleri",
    squareMeters: 190,
    rooms: "3+1",
    floor: "Bahçe katı",
    buildingAge: "0-5 yıl",
    furnished: false,
    description: "Çınarköy Evleri kaynaklı orman cepheli, büyük tip, özel bahçeli 3+1 kiralık portföy ön izlemesi.",
    features: ["Orman cepheli", "Özel bahçe", "Site", "3+1"],
    coverImage: previewImages.garden,
    gallery: [previewImages.garden, previewImages.cadde, previewImages.residence],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
  "1271281357": {
    externalId: "1271281357",
    title: "Ortaköy Dereboyu Caddesi bahçeli müstakil ev full eşyalı",
    listingType: "KIRALIK",
    price: 140000,
    currency: "TRY",
    city: "İstanbul",
    district: "Beşiktaş",
    neighborhood: "Mecidiye Mah.",
    projectName: "Ortaköy Dereboyu",
    squareMeters: 270,
    rooms: "5+1",
    floor: "Müstakil",
    buildingAge: "16-20 arası",
    furnished: true,
    description: "Boğaz'ın eşsiz huzuru; Ortaköy'de müstakil köşk. Tarihi dokusu ve modern detayları bir araya getiren, bahçeli ve full eşyalı kiralık müstakil ev.",
    features: ["Bahçeli", "Müstakil ev", "Full eşyalı", "5+1", "Ortaköy"],
    coverImage: previewImages.garden,
    gallery: [previewImages.garden, previewImages.cadde, previewImages.residence],
    videoUrl: "",
    sourcePlatform: "Sahibinden",
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "KNOWN_LISTING",
  },
};

function platformFromUrl(url: URL, fallback?: string) {
  const host = url.hostname.toLocaleLowerCase("tr");
  if (host.includes("sahibinden")) return "Sahibinden";
  if (host.includes("emlakjet")) return "Emlakjet";
  if (host.includes("hepsiemlak")) return "Hepsiemlak";
  if (host.includes("hurriyet")) return "Hürriyet Emlak";
  return fallback || "İlan kaynağı";
}

function humanTitleFromUrl(url: URL) {
  const pieces = url.pathname.split("/").filter(Boolean);
  const listingSlug = pieces.find((piece) => /\d{6,}/.test(piece)) ?? pieces.at(-2) ?? pieces.at(-1) ?? "portfoy";
  const withoutId = decodeURIComponent(listingSlug)
    .replace(/-\d{6,}$/g, "")
    .replace(/emlak-konut-/g, "")
    .replace(/kiralik-/g, "")
    .replace(/satilik-/g, "")
    .replace(/plus/g, "+")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return withoutId
    ? withoutId.replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("tr"))
    : "Kaynak linkinden eklenen portföy";
}

function externalIdFromUrl(url: URL) {
  const match = url.pathname.match(/(\d{7,})/);
  return match?.[1] ?? `${url.hostname}-${Math.abs(url.href.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0))}`;
}

function roomsFromText(value: string) {
  const match = value.match(/(\d)\s*(?:\+|plus)\s*(\d)/i);
  return match ? `${match[1]}+${match[2]}` : "1+1";
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function textLinesFromHtml(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|\/li|\/tr|\/p|\/h1|\/h2|\/h3)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function fieldFromLines(lines: string[], labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLocaleLowerCase("tr"));
  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = lines[index].toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
    const matched = normalizedLabels.find((label) => normalizedLine === label || normalizedLine.startsWith(`${label} `));
    if (!matched) continue;

    const inlineValue = lines[index].slice(matched.length).replace(/^[:\s]+/, "").trim();
    if (inlineValue) return inlineValue;

    for (let next = index + 1; next < Math.min(index + 5, lines.length); next += 1) {
      if (lines[next] && !normalizedLabels.includes(lines[next].toLocaleLowerCase("tr"))) return lines[next];
    }
  }
  return "";
}

function numberFromText(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function titleFromHtml(html: string, fallback: string) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1];
  return decodeHtml((h1 || ogTitle || fallback).replace(/<[^>]+>/g, " "));
}

function imagesFromHtml(html: string) {
  const images = new Set<string>();
  const ogImage = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1];
  if (ogImage) images.add(decodeHtml(ogImage));

  for (const match of html.matchAll(/https?:\/\/[^"'()\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'()\s]*)?/gi)) {
    const image = decodeHtml(match[0]);
    if (/sahibinden|shbdn|classified/i.test(image)) images.add(image);
  }

  return Array.from(images).slice(0, 12);
}

function descriptionFromHtml(html: string) {
  const descriptionBlock = html.match(/<div[^>]+id=["']classifiedDescription["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?? html.match(/<div[^>]+class=["'][^"']*classifiedDescription[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?? "";
  const description = decodeHtml(descriptionBlock.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "\n"));
  return description || "";
}

function sahibindenPreviewFromHtml(sourceUrl: string, html: string, sourcePlatform?: string): ListingPreview | null {
  const url = new URL(sourceUrl);
  const lines = textLinesFromHtml(html);
  const externalId = fieldFromLines(lines, ["İlan No", "Ilan No"]) || externalIdFromUrl(url);
  const priceText = fieldFromLines(lines, ["Fiyat"]) || lines.find((line) => /\d[\d.]*\s*TL/i.test(line)) || "";
  const title = titleFromHtml(html, humanTitleFromUrl(url));
  const listingTypeText = fieldFromLines(lines, ["Emlak Tipi"]);
  const grossArea = fieldFromLines(lines, ["m² (Brüt)", "m2 (Brüt)", "m² Brüt", "m2 Brüt"]);
  const netArea = fieldFromLines(lines, ["m² (Net)", "m2 (Net)", "m² Net", "m2 Net"]);
  const location = lines.find((line) => /İstanbul\s*\/|Istanbul\s*\//i.test(line)) ?? "";
  const locationParts = location.split("/").map((part) => part.trim()).filter(Boolean);
  const images = imagesFromHtml(html);
  const description = descriptionFromHtml(html);

  const price = numberFromText(priceText);
  const squareMeters = numberFromText(grossArea || netArea);
  if (!externalId || !title || !price || !squareMeters) return null;

  return {
    externalId,
    title,
    listingType: /satılık|satilik/i.test(listingTypeText || url.pathname) ? "SATILIK" : "KIRALIK",
    price,
    currency: "TRY",
    city: locationParts[0] || "İstanbul",
    district: locationParts[1] || fieldFromLines(lines, ["İlçe", "Ilçe"]) || "Belirlenecek",
    neighborhood: locationParts[2] || fieldFromLines(lines, ["Mahalle"]) || "Belirlenecek",
    projectName: title.split(" ").slice(0, 3).join(" "),
    squareMeters,
    rooms: fieldFromLines(lines, ["Oda Sayısı"]) || roomsFromText(url.pathname),
    floor: fieldFromLines(lines, ["Bulunduğu Kat"]) || "Belirlenecek",
    buildingAge: fieldFromLines(lines, ["Bina Yaşı"]) || "Belirlenecek",
    furnished: /eşyalı|esyali|mobilya/i.test(`${title} ${description} ${fieldFromLines(lines, ["Eşyalı"])}`),
    description: description || `${platformFromUrl(url, sourcePlatform)} ilan sayfasından alınan portföy ön izlemesi.`,
    features: [
      fieldFromLines(lines, ["Isıtma"]),
      fieldFromLines(lines, ["Banyo Sayısı"]),
      fieldFromLines(lines, ["Balkon"]),
      fieldFromLines(lines, ["Kullanım Durumu"]),
    ].filter(Boolean),
    coverImage: images[0] || previewImages.residence,
    gallery: images.length ? images : [previewImages.residence],
    videoUrl: "",
    sourcePlatform: platformFromUrl(url, sourcePlatform),
    sourceUrl,
    sourceType: "AUTHORIZED_PORTFOLIO",
    status: "AKTIF",
    confidence: "LIVE_LISTING",
  };
}

async function fetchSahibindenPreview(sourceUrl: string, sourcePlatform?: string) {
  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.6",
        "user-agent": "UnitGlobalCRM/1.0 link-preview",
      },
      next: { revalidate: 300 },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  return sahibindenPreviewFromHtml(sourceUrl, await response.text(), sourcePlatform);
}

export async function getListingPreview(sourceUrl: string, sourcePlatform?: string): Promise<ListingPreview | null> {
  try {
    const url = new URL(sourceUrl);
    const externalId = externalIdFromUrl(url);
    const platform = platformFromUrl(url, sourcePlatform);
    const known = knownListings[externalId];
    if (known) {
      const live = platform === "Sahibinden" ? await fetchSahibindenPreview(sourceUrl, sourcePlatform) : null;
      return live ? { ...known, ...live, sourceUrl } : { ...known, sourceUrl };
    }

    if (platform !== "Sahibinden") return null;

    return fetchSahibindenPreview(sourceUrl, sourcePlatform);
  } catch {
    return null;
  }
}
