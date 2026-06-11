import { z } from "zod";

export const propertySchema = z.object({
  title: z.string().min(3, "Başlık en az 3 karakter olmalı"),
  listingType: z.enum(["SATILIK", "KIRALIK"]),
  price: z.coerce.number().min(0, "Fiyat negatif olamaz"),
  currency: z.enum(["TRY", "USD", "EUR"]),
  district: z.string().min(2, "İlçe girilmeli"),
  neighborhood: z.string().min(2, "Mahalle girilmeli"),
  squareMeters: z.coerce.number().min(20, "m² gerçekçi olmalı"),
  rooms: z.string().min(1, "Oda sayısı girilmeli"),
  consultantId: z.string().min(1, "Danışman seçilmeli"),
  status: z.enum(["AKTIF", "PASIF", "OPSIYONLU", "SATILDI", "KIRALANDI"]),
  listingUrl: z.string().optional(),
  sourcePlatform: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceType: z.enum(["OWN_LISTING", "AUTHORIZED_PORTFOLIO", "MANUAL"]).optional(),
});

export const leadSchema = z.object({
  name: z.string().min(3, "Ad soyad girilmeli"),
  email: z.string().email("Geçerli e-posta girilmeli"),
  phone: z.string().min(10, "Telefon girilmeli"),
  source: z.string().min(2, "Kaynak girilmeli"),
  budget: z.coerce.number().min(1, "Bütçe girilmeli"),
  interest: z.string().min(3, "İlgi alanı girilmeli"),
  consultantId: z.string().min(1, "Danışman seçilmeli"),
});
