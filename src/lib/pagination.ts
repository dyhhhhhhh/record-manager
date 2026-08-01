export function clampPage(value: string | number | undefined, pageCount: number) {
  const parsed = Number(value ?? 1);
  const requested = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
  const available = Number.isFinite(pageCount) ? Math.max(1, Math.trunc(pageCount)) : 1;
  return Math.min(requested, available);
}
