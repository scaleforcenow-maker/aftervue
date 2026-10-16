const parseList = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function loadConfig(env = process.env) {
  return {
    allowedOrigins: parseList(env.ALLOWED_ORIGINS),
    rateLimit: {
      capacity: num(env.RATE_LIMIT_CAPACITY, 10),
      refillPerMinute: num(env.RATE_LIMIT_REFILL_PER_MINUTE, 6),
    },
    turnstile: {
      secret: env.TURNSTILE_SECRET || '',
      // Explicit, loud opt-out for local development only. Never set on Cloud Run.
      disabled: env.TURNSTILE_DISABLED === 'true',
    },
    vertexProjectId: env.VERTEX_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || '',
    vertexLocation: env.VERTEX_LOCATION || 'global',
    vertexImageModel: env.VERTEX_IMAGE_MODEL || 'gemini-3-pro-image',
    vertexFallbackModel: env.VERTEX_FALLBACK_MODEL || 'gemini-3.1-flash-image',
    // Base64 images are large; the Vercel function accepted roughly this much.
    bodyLimit: env.BODY_LIMIT || '12mb',
  };
}
