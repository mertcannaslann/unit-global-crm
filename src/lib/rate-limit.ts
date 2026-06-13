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

function clientIp(request?: Request) {
  const forwardedFor = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request?.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

export function rateLimitKey(request: Request | undefined, scope: string, identity?: string | null) {
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
