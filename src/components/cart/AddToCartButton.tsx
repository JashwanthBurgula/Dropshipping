"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/components/cart/CartProvider";

export interface AddToCartButtonProps {
  productId: string;
  productName: string;
  isPurchasable: boolean;
  returnToPath?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "amber" | "buyNow";
  fullWidth?: boolean;
  label?: string;
  mode?: "add" | "buyNow";
  quantity?: number;
}

export function AddToCartButton({
  productId,
  productName,
  isPurchasable,
  returnToPath,
  size = "md",
  variant = "amber",
  fullWidth = false,
  label,
  mode = "add",
  quantity = 1,
}: AddToCartButtonProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const [isProcessing, setIsProcessing] = React.useState(false);

  const isBuyNow = mode === "buyNow";
  const defaultLabel = isBuyNow ? "Buy Now" : "Add to Cart";
  const displayLabel = label ?? defaultLabel;

  const handleClick = async () => {
    if (!isPurchasable || isProcessing) return;
    setIsProcessing(true);
    try {
      const ok = await addItem({
        productId,
        productName,
        quantity,
        returnToPath: isBuyNow ? "/checkout" : returnToPath,
        openDrawer: !isBuyNow,
      });
      if (ok && isBuyNow) {
        router.push("/checkout");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (isBuyNow) {
    return (
      <button
        type="button"
        disabled={!isPurchasable || isProcessing}
        onClick={handleClick}
        className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[4px] bg-[#C2410C] px-6 py-3 text-base font-semibold text-[#FFFFFF] transition-colors hover:bg-[#9A3412] disabled:opacity-60 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        <ArrowRight className="h-4 w-4 shrink-0" />
        <span>{isProcessing ? "Processing..." : isPurchasable ? displayLabel : "Out of Stock"}</span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      disabled={!isPurchasable}
      isLoading={isProcessing}
      loadingText="Adding..."
      onClick={handleClick}
    >
      <ShoppingBag
        className="h-4 w-4 shrink-0"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span>{isPurchasable ? displayLabel : "Out of Stock"}</span>
    </Button>
  );
}
