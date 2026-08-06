import { merchantSchema, type Merchant } from "@/types/domain";

export const MERCHANT_LABELS: Record<Merchant, string> = {
  imusic: "iMusic",
  hmv: "HMV Japan",
  mutant: "Mutant",
  black_screen: "Black Screen Records",
  laced: "Laced Records",
  cdjapan: "CDJapan"
};

export const MERCHANT_ICONS: Record<Merchant, { src: string; fallback: string }> = {
  imusic: { src: "/merchants/imusic.png", fallback: "iM" },
  hmv: { src: "/merchants/hmv.png", fallback: "H" },
  mutant: { src: "/merchants/mutant.png", fallback: "M" },
  black_screen: { src: "/merchants/black-screen.png", fallback: "BS" },
  laced: { src: "/merchants/laced.png", fallback: "L" },
  cdjapan: { src: "/merchants/cdjapan.svg", fallback: "CDJ" }
};

export const MERCHANT_OPTIONS = merchantSchema.options.map((value) => ({
  value,
  label: MERCHANT_LABELS[value]
}));

export function orderDetailHref(merchant: Merchant, externalOrderId: string) {
  return `/orders/${merchant}/${encodeURIComponent(externalOrderId)}`;
}
