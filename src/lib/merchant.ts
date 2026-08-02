import { merchantSchema, type Merchant } from "@/types/domain";

export const MERCHANT_LABELS: Record<Merchant, string> = {
  imusic: "iMusic",
  hmv: "HMV Japan",
  mutant: "Mutant",
  black_screen: "Black Screen Records",
  laced: "Laced Records"
};

export const MERCHANT_OPTIONS = merchantSchema.options.map((value) => ({
  value,
  label: MERCHANT_LABELS[value]
}));

export function orderDetailHref(merchant: Merchant, externalOrderId: string) {
  return `/orders/${merchant}/${encodeURIComponent(externalOrderId)}`;
}
