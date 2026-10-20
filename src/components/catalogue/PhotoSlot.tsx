"use client";

import * as React from "react";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PhotoSlotProps {
  url?: string;
  altText?: string;
  label?: string;
  aspectRatio?: "1:1" | "4:5";
  className?: string;
  zoomed?: boolean;
  priority?: boolean;
}

/**
 * Renders a product photograph with a locked aspect ratio (1:1 square or 4:5 portrait)
 * and 0px border radius (rectangular, no radius as required).
 * Zero placeholder text is rendered in the storefront.
 */
export function PhotoSlot({
  url = "",
  altText,
  label,
  aspectRatio = "4:5",
  className,
  zoomed = false,
  priority = false,
}: PhotoSlotProps) {
  const [loadFailed, setLoadFailed] = React.useState(false);
  const resolvedAlt = altText ?? label ?? "Product photograph";
  const aspectClass =
    aspectRatio === "1:1" ? "aspect-square" : "aspect-[4/5]";

  React.useEffect(() => {
    setLoadFailed(false);
  }, [url]);

  const showImage = Boolean(url) && !loadFailed;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-none border-b border-[#DDE1E6] bg-[#FFFFFF] select-none",
        aspectClass,
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={resolvedAlt}
          loading={priority ? "eager" : "lazy"}
          onError={() => setLoadFailed(true)}
          className={cn(
            "h-full w-full rounded-none object-cover transition-transform duration-200",
            zoomed ? "scale-150 cursor-zoom-out" : "scale-100"
          )}
        />
      ) : (
        <div
          role="img"
          aria-label={resolvedAlt}
          className="flex h-full w-full items-center justify-center rounded-none bg-[#F5F6F7] text-[#98A2B3]"
        >
          <ImageIcon className="h-8 w-8 stroke-[1.25] text-[#98A2B3]" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
