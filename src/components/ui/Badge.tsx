import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "inStock"
  | "lowStock"
  | "outOfStock"
  | "sale"
  | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const badgeStyles: Record<BadgeVariant, string> = {
  inStock: "bg-moss/10 text-moss border-moss/30",
  lowStock: "bg-amber/15 text-amber-text border-amber/35",
  outOfStock: "bg-brick/10 text-brick border-brick/30",
  sale: "bg-clay text-white border-clay",
  neutral: "bg-sand text-ink border-stone",
};

export function Badge({
  className,
  variant = "neutral",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        badgeStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
