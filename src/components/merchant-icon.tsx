"use client";

import Image from "next/image";
import { useState } from "react";

import { MERCHANT_ICONS, MERCHANT_LABELS } from "@/lib/merchant";
import type { Merchant } from "@/types/domain";

export type MerchantIconProps = {
  merchant: Merchant;
  size?: number;
  className?: string;
};

export function MerchantIcon({ merchant, size = 20, className = "" }: MerchantIconProps) {
  const [failed, setFailed] = useState(false);
  const label = MERCHANT_LABELS[merchant];
  const config = MERCHANT_ICONS[merchant];

  return (
    <span
      aria-label={label}
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-md border border-black/10 bg-white font-bold leading-none text-[var(--muted)] shadow-sm ${className}`}
      role="img"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.38)) }}
      title={label}
    >
      {failed ? (
        <span aria-hidden="true">{config.fallback}</span>
      ) : (
        <Image
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          height={size}
          onError={() => setFailed(true)}
          src={config.src}
          unoptimized
          width={size}
        />
      )}
    </span>
  );
}
