import { timingSafeEqual } from "node:crypto";

export function isValidCronAuthorization(header: string | null, secret: string) {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
