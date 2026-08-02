import type { HeaderLines } from "mailparser";

import type { MailEventType, Merchant } from "@/types/domain";

type ClassifiedStatusMail = {
  merchant: Merchant;
  type: MailEventType;
};

type AuthenticationResult = {
  trusted: boolean;
  warning?: string;
};

const AUTOMATIC_STATUS_DOMAINS: Partial<Record<Merchant, string>> = {
  imusic: "imusic.dk",
  hmv: "hmv.co.jp",
  black_screen: "sendcloud.com",
  laced: "lacedmusic.com"
};

function domainMatches(value: string, expected: string) {
  const normalized = value
    .trim()
    .replace(/^[<"']+|[>"',.]+$/g, "")
    .toLocaleLowerCase();
  const domain = (normalized.includes("@") ? normalized.slice(normalized.lastIndexOf("@") + 1) : normalized)
    .replace(/\.$/, "");
  return domain === expected || domain.endsWith(`.${expected}`);
}

function resultDomain(clause: string, method: string) {
  const property = method === "spf"
    ? /(?:smtp\.mailfrom|envelope-from)\s*=\s*([^\s;]+)/i
    : method === "dkim"
      ? /header\.d\s*=\s*([^\s;]+)/i
      : /header\.from\s*=\s*([^\s;]+)/i;
  return clause.match(property)?.[1] ?? null;
}

export function verifyAutomaticStatusSender(
  headerLines: HeaderLines,
  classification: ClassifiedStatusMail
): AuthenticationResult {
  if (classification.type === "order_confirmation") return { trusted: false };

  const expectedDomain = AUTOMATIC_STATUS_DOMAINS[classification.merchant];
  if (!expectedDomain) {
    return { trusted: false, warning: "该商城不支持自动状态认证" };
  }

  const firstResult = headerLines.find((header) => header.key.toLocaleLowerCase() === "authentication-results");
  if (!firstResult) {
    return { trusted: false, warning: "缺少 QQ 发件人认证结果" };
  }

  const value = firstResult.line.replace(/^authentication-results\s*:/i, "").trim();
  const [authservId = "", ...clauses] = value.split(";");
  const normalizedAuthservId = authservId.trim().split(/\s+/)[0]?.toLocaleLowerCase().replace(/\.$/, "") ?? "";
  if (normalizedAuthservId !== "qq.com" && !normalizedAuthservId.endsWith(".qq.com")) {
    return { trusted: false, warning: "认证结果不是由 QQ 接收服务器生成" };
  }

  let hasPassingMethod = false;
  for (const clause of clauses) {
    const method = clause.match(/^\s*(spf|dkim|dmarc)\s*=\s*pass\b/i)?.[1]?.toLocaleLowerCase();
    if (!method) continue;
    hasPassingMethod = true;
    const authenticatedDomain = resultDomain(clause, method);
    if (authenticatedDomain && domainMatches(authenticatedDomain, expectedDomain)) {
      return { trusted: true };
    }
  }

  return hasPassingMethod
    ? { trusted: false, warning: "邮件认证域名与商家不一致" }
    : { trusted: false, warning: "QQ 未验证发件人域名" };
}
