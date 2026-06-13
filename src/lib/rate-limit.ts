type RateLimitOptions = {
  max: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as unknown as {
  crmRateLimitBuckets?: Map<string, Bucket>;
};

const buckets = globalForRateLimit.crmRateLimitBuckets ?? new Map<string, Bucket>();
globalForRateLimit.crmRateLimitBuckets = buckets;

type HeaderLike = Headers | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderLike | undefined, key: string) {
  if (!headers) return undefined;

  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(key) ?? undefined;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const value = record[key] ?? record[key.toLowerCase()] ?? record[key.toUpperCase()];
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(request?: Request | { headers?: HeaderLike }) {
  const forwardedFor = readHeader(request?.headers, "x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = readHeader(request?.headers, "x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

export function rateLimitKey(request: Request | { headers?: HeaderLike } | undefined, scope: string, identity?: string | null) {
  return [scope, identity?.toLowerCase().trim() || "anonymous", clientIp(request)].join(":");
}

export function checkRateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(options.max - 1, 0), resetAt };
  }

  current.count += 1;
  buckets.set(key, current);

  return {
    ok: current.count <= options.max,
    remaining: Math.max(options.max - current.count, 0),
    resetAt: current.resetAt,
  };
}

export function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
