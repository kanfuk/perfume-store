type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(args: {
  key: string;
  maxRequests: number;
  windowMs: number;
}) {
  const now = Date.now();
  const current = buckets.get(args.key);

  if (!current || current.resetAt <= now) {
    buckets.set(args.key, {
      count: 1,
      resetAt: now + args.windowMs
    });

    return {
      allowed: true,
      remaining: args.maxRequests - 1,
      resetAt: now + args.windowMs
    };
  }

  if (current.count >= args.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt
    };
  }

  current.count += 1;
  buckets.set(args.key, current);

  return {
    allowed: true,
    remaining: Math.max(0, args.maxRequests - current.count),
    resetAt: current.resetAt
  };
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}
