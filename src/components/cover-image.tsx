"use client";

import Image from "next/image";
import { useState } from "react";

type CoverImageProps = {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  fallbackLabel?: string;
  className?: string;
};

export function CoverImage({
  src,
  alt,
  sizes,
  fallbackLabel = "暂无封面",
  className = "object-cover"
}: CoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return <span className="grid h-full place-items-center px-2 text-center text-xs text-[var(--muted)]">{fallbackLabel}</span>;
  }

  return (
    <Image
      alt={alt}
      className={className}
      fill
      onError={() => setFailedSrc(src)}
      sizes={sizes}
      src={src}
      unoptimized
    />
  );
}
