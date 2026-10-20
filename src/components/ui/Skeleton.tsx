import * as React from "react";
import { cn } from "@/lib/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: "photo" | "control" | "card";
}

export function Skeleton({
  className,
  shape = "control",
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-sand border border-stone/60",
        shape === "photo" && "rounded-none",
        shape === "control" && "rounded-control",
        shape === "card" && "rounded-card",
        className
      )}
      {...props}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading product">
      <Skeleton shape="photo" className="aspect-[4/5] w-full" />
      <Skeleton shape="control" className="h-4 w-2/3" />
      <Skeleton shape="control" className="h-4 w-1/3" />
    </div>
  );
}
