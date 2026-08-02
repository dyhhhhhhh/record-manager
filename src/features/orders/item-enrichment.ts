import type { MailEventPayload, OrderConfirmationPayload, ParsedOrderItem } from "@/types/domain";

export function normalizeOrderItemTitle(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[〜～~]/g, "~")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function itemKey(item: Pick<ParsedOrderItem, "albumTitle" | "unitPrice" | "quantity">) {
  return `${normalizeOrderItemTitle(item.albumTitle)}\u0000${item.unitPrice}\u0000${item.quantity}`;
}

function groupIndexes(items: ParsedOrderItem[]) {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = itemKey(item);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return groups;
}

export function mergeOrderItemMetadata(baseItems: ParsedOrderItem[], candidateItems: ParsedOrderItem[]) {
  const items = baseItems.map((item) => ({ ...item }));
  const baseGroups = groupIndexes(baseItems);
  const candidateGroups = groupIndexes(candidateItems);
  const warnings: string[] = [];

  for (const [key, baseIndexes] of baseGroups) {
    const candidates = candidateGroups.get(key) ?? [];
    if (!candidates.length) continue;
    if (baseIndexes.length !== 1 || candidates.length !== 1) {
      warnings.push(`商品元数据匹配歧义：${baseItems[baseIndexes[0]].albumTitle}`);
      continue;
    }

    const target = items[baseIndexes[0]];
    const candidate = candidateItems[candidates[0]];
    items[baseIndexes[0]] = {
      ...target,
      artistName: target.artistName === "未知艺人" ? candidate.artistName : target.artistName,
      imageUrl: target.imageUrl ?? candidate.imageUrl,
      productUrl: target.productUrl ?? candidate.productUrl
    };
  }

  return { items, warnings };
}

export function mergeOrderConfirmationMetadata(
  confirmation: OrderConfirmationPayload,
  events: MailEventPayload[]
) {
  let items = confirmation.items;
  const warnings: string[] = [];
  const candidates = events
    .filter((event) => event.type !== "order_confirmation"
      && event.merchant === confirmation.merchant
      && event.externalOrderId === confirmation.externalOrderId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  for (const event of candidates) {
    const merged = mergeOrderItemMetadata(items, event.items);
    items = merged.items;
    warnings.push(...merged.warnings);
  }

  return { payload: { ...confirmation, items }, warnings };
}
