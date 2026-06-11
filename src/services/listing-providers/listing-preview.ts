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
  confidence: "KNOWN_LISTING" | "URL_PREVIEW";
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

export function getListingPreview(sourceUrl: string, sourcePlatform?: string): ListingPreview | null {
  try {
    const url = new URL(sourceUrl);
    const externalId = externalIdFromUrl(url);
    const known = knownListings[externalId];
    if (known) return { ...known, sourceUrl };

    const platform = platformFromUrl(url, sourcePlatform);
    const title = humanTitleFromUrl(url);
    const listingType = /satilik|satılık/i.test(url.pathname) ? "SATILIK" : "KIRALIK";
    const rooms = roomsFromText(url.pathname);

    return {
      externalId,
      title,
      listingType,
      price: 0,
      currency: "TRY",
      city: "İstanbul",
      district: "Belirlenecek",
      neighborhood: "Belirlenecek",
      projectName: title.split(" ").slice(0, 3).join(" "),
      squareMeters: 20,
      rooms,
      floor: "Belirlenecek",
      buildingAge: "Belirlenecek",
      furnished: /esyali|eşyalı|furnished/i.test(url.pathname),
      description: `${platform} kaynak linkinden oluşturulan API-ready portföy ön izlemesi.`,
      features: [platform, "Kaynak linki", listingType === "KIRALIK" ? "Kiralık" : "Satılık", rooms],
      coverImage: previewImages.residence,
      gallery: [previewImages.residence, previewImages.balcony],
      videoUrl: "",
      sourcePlatform: platform,
      sourceUrl,
      sourceType: platform === "İlan kaynağı" ? "MANUAL" : "AUTHORIZED_PORTFOLIO",
      status: "AKTIF",
      confidence: "URL_PREVIEW",
    };
  } catch {
    return null;
  }
}
