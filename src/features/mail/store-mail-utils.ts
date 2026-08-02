function validGroupedWhole(value: string, separator: "," | ".") {
  const groups = value.split(separator);
  return /^\d{1,3}$/.test(groups[0] ?? "")
    && groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

export function parseLocalizedMoney(value: string) {
  const normalized = value.replace(/\u00a0/g, " ").trim();
  if (/-\s*(?:[€$¥]\s*)?\d|[€$¥]\s*-\s*\d/.test(normalized)) {
    throw new Error(`金额不能为负数：${value}`);
  }

  const matches = normalized.match(/\d[\d.,\s]*/g)?.map((entry) => entry.replace(/\s/g, "")) ?? [];
  if (matches.length !== 1 || !/^\d[\d.,]*$/.test(matches[0])) {
    throw new Error(`无法解析金额：${value}`);
  }

  const numeric = matches[0];
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  if (separatorIndex < 0) return numeric;

  const separator = numeric[separatorIndex] as "," | ".";
  const fractionCandidate = numeric.slice(separatorIndex + 1);
  const otherSeparator = separator === "," ? "." : ",";
  const hasOtherSeparator = numeric.includes(otherSeparator);
  const sameSeparatorCount = numeric.split(separator).length - 1;
  const hasDecimal = hasOtherSeparator || fractionCandidate.length <= 2;

  if (!hasDecimal) {
    if (!validGroupedWhole(numeric, separator)) throw new Error(`无法解析金额：${value}`);
    return numeric.replaceAll(separator, "");
  }

  if (!/^\d{1,2}$/.test(fractionCandidate)) throw new Error(`无法解析金额：${value}`);
  const wholeSource = numeric.slice(0, separatorIndex);
  if (wholeSource.includes(separator) && !validGroupedWhole(wholeSource, separator)) {
    throw new Error(`无法解析金额：${value}`);
  }
  if (wholeSource.includes(otherSeparator) && !validGroupedWhole(wholeSource, otherSeparator)) {
    throw new Error(`无法解析金额：${value}`);
  }
  if (!hasOtherSeparator && sameSeparatorCount > 1 && !validGroupedWhole(wholeSource, separator)) {
    throw new Error(`无法解析金额：${value}`);
  }

  const whole = wholeSource.replace(/[.,]/g, "");
  return `${whole}.${fractionCandidate}`;
}

function toMinorUnits(value: string) {
  const normalized = parseLocalizedMoney(value);
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function formatMinorUnits(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export function divideLineTotal(lineTotal: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("商品数量必须是正整数");
  const minorUnits = toMinorUnits(lineTotal);
  const divisor = BigInt(quantity);
  if (minorUnits % divisor !== 0n) throw new Error("商品行金额无法精确换算单价");
  return formatMinorUnits(minorUnits / divisor);
}

export function combineProductAndVariant(product: string, variant: string) {
  const title = product.replace(/\s+/g, " ").trim();
  const normalizedVariant = variant.replace(/\s+/g, " ").trim();
  if (!normalizedVariant || normalizedVariant.toLocaleLowerCase() === "default title") return title;
  return `${title} · ${normalizedVariant}`;
}
