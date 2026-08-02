import { mergeOrderItemMetadata } from "@/features/orders/item-enrichment";
import type { ParsedOrderItem } from "@/types/domain";

export type StoredItemForEnrichment = {
  id: string;
  album_title: string;
  artist_name: string;
  unit_price: string | number;
  quantity: number;
  image_path: string | null;
  source_image_url: string | null;
  product_url: string | null;
};

export type StoredItemEnrichmentUpdate = {
  id: string;
  artistName?: string;
  sourceImageUrl?: string;
  productUrl?: string;
  coverUrl?: string;
};

export function planStoredItemEnrichment(
  storedItems: StoredItemForEnrichment[],
  candidates: ParsedOrderItem[]
) {
  const baseItems: ParsedOrderItem[] = storedItems.map((item) => ({
    albumTitle: item.album_title,
    artistName: item.artist_name,
    unitPrice: String(item.unit_price),
    quantity: item.quantity,
    imageUrl: item.source_image_url ?? undefined,
    productUrl: item.product_url ?? undefined
  }));
  const merged = mergeOrderItemMetadata(baseItems, candidates);
  const updates: StoredItemEnrichmentUpdate[] = [];

  storedItems.forEach((stored, index) => {
    const item = merged.items[index];
    const update: StoredItemEnrichmentUpdate = { id: stored.id };
    if (stored.artist_name === "未知艺人" && item.artistName !== "未知艺人") {
      update.artistName = item.artistName;
    }
    if (!stored.product_url && item.productUrl) update.productUrl = item.productUrl;
    if (!stored.image_path && !stored.source_image_url && item.imageUrl) {
      update.sourceImageUrl = item.imageUrl;
    }
    if (!stored.image_path) {
      update.coverUrl = stored.source_image_url ?? update.sourceImageUrl;
    }
    if (Object.keys(update).length > 1) updates.push(update);
  });

  return { updates, warnings: merged.warnings };
}
