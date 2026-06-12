import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0x10000 - 22);
  for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("Excel dosyası okunamadı.");
}

function readZipEntries(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipFile(buffer: Buffer, entries: ZipEntry[], name: string) {
  const entry = entries.find((item) => item.name === name);
  if (!entry) return null;

  const localOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) return null;

  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return compressed.toString("utf8");
  if (entry.method === 8) return inflateRawSync(compressed).toString("utf8");
  throw new Error("Bu Excel sıkıştırma tipi desteklenmiyor.");
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function attr(source: string, name: string) {
  const match = source.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

function parseSharedStrings(xml: string | null) {
  if (!xml) return [];
  const strings: string[] = [];
  const sharedStringMatches = xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g);

  for (const sharedString of sharedStringMatches) {
    const parts = [...sharedString[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1]));
    strings.push(parts.join(""));
  }

  return strings;
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/)?.[0] ?? "";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cellAttributes: string, cellXml: string, sharedStrings: string[]) {
  const type = attr(cellAttributes, "t");
  const value = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";

  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "inlineStr") {
    return [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => decodeXml(item[1])).join("");
  }

  return decodeXml(value);
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  const rowMatches = xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);

  for (const row of rowMatches) {
    const values: string[] = [];
    const cellMatches = row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g);

    for (const cell of cellMatches) {
      const reference = attr(cell[1], "r");
      const index = reference ? columnIndex(reference) : values.length;
      values[index] = cellValue(cell[1], cell[2], sharedStrings).trim();
    }

    if (values.some(Boolean)) rows.push(values.map((value) => value ?? ""));
  }

  return rows;
}

function parseXlsx(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(readZipFile(buffer, entries, "xl/sharedStrings.xml"));
  const firstSheetName = entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))?.name;

  if (!firstSheetName) throw new Error("Excel dosyasında okunacak sayfa bulunamadı.");

  const worksheet = readZipFile(buffer, entries, firstSheetName);
  if (!worksheet) throw new Error("Excel sayfası okunamadı.");

  return parseWorksheetRows(worksheet, sharedStrings);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      return NextResponse.json({ error: "Şimdilik doğrudan Excel için .xlsx formatı destekleniyor." }, { status: 400 });
    }

    const rows = parseXlsx(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Excel dosyası okunamadı." }, { status: 400 });
  }
}
