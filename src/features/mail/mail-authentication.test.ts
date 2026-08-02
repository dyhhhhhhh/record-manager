import { describe, expect, it } from "vitest";

import { verifyAutomaticStatusSender } from "@/features/mail/mail-authentication";

const shipment = { merchant: "imusic", type: "shipment" } as const;

function authenticationResults(...values: string[]) {
  return values.map((value) => ({
    key: "authentication-results",
    line: `Authentication-Results: ${value}`
  }));
}

describe("automatic status sender authentication", () => {
  it.each([
    "mx.qq.com; spf=pass smtp.mailfrom=dispatch@imusic.dk",
    "mx.qq.com; dkim=pass header.d=mail.imusic.dk",
    "mx.qq.com; dmarc=pass header.from=imusic.dk"
  ])("trusts an aligned QQ authentication result: %s", (result) => {
    expect(verifyAutomaticStatusSender(authenticationResults(result), shipment))
      .toEqual({ trusted: true });
  });

  it("accepts Sendcloud authentication only for Black Screen status mail", () => {
    const headers = authenticationResults("mx1.qq.com; dkim=pass header.d=sendcloud.com");

    expect(verifyAutomaticStatusSender(headers, {
      merchant: "black_screen",
      type: "shipment"
    })).toEqual({ trusted: true });
    expect(verifyAutomaticStatusSender(headers, shipment)).toMatchObject({ trusted: false });
  });

  it.each([
    [[], "缺少 QQ 发件人认证结果"],
    [authenticationResults("mx.qq.com; dkim=fail header.d=imusic.dk"), "QQ 未验证发件人域名"],
    [authenticationResults("mx.qq.com; dkim=pass header.d=attacker.example"), "邮件认证域名与商家不一致"],
    [authenticationResults("attacker.example; dkim=pass header.d=imusic.dk"), "认证结果不是由 QQ 接收服务器生成"]
  ] as const)("rejects an untrusted status message", (headers, warning) => {
    expect(verifyAutomaticStatusSender(headers, shipment)).toEqual({
      trusted: false,
      warning
    });
  });

  it("does not trust a forged lower Authentication-Results header", () => {
    const headers = authenticationResults(
      "mx.qq.com; dkim=fail header.d=imusic.dk",
      "mx.qq.com; dkim=pass header.d=imusic.dk"
    );

    expect(verifyAutomaticStatusSender(headers, shipment)).toMatchObject({ trusted: false });
  });

  it("does not read a passing mechanism from a failed result comment", () => {
    const headers = authenticationResults(
      'mx.qq.com; spf=fail reason="dkim=pass header.d=imusic.dk" smtp.mailfrom=attacker.example'
    );

    expect(verifyAutomaticStatusSender(headers, shipment)).toMatchObject({ trusted: false });
  });

  it("does not require automatic-status authentication for confirmations", () => {
    expect(verifyAutomaticStatusSender([], {
      merchant: "laced",
      type: "order_confirmation"
    })).toEqual({ trusted: false });
  });
});
