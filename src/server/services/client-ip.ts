/** Client IP. On Vercel `x-forwarded-for` is overwritten by the platform with the real client IP. */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}
