import type { Property } from "@/lib/types";

export type ProviderListing = {
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
};

export type ListingSyncResult = {
  provider: string;
  added: Property[];
  skipped: number;
  syncedAt: string;
};

export type ListingProvider = {
  fetchOwnListings: () => Promise<ProviderListing[]>;
  normalizeListing: (listing: ProviderListing, consultantId: string, syncedAt: string) => Property;
  syncListings: (currentProperties: Property[], consultantId: string) => Promise<ListingSyncResult>;
};
