"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  position?: "left" | "right" | "bottom";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  position = "right",
  children,
  footer,
}: DrawerProps) {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        className="fixed inset-0 bg-ink/40 transition-opacity duration-base ease-editorial"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          "relative z-10 flex flex-col bg-paper border-stone shadow-floating",
          "transition-transform duration-slow ease-editorial",
          position === "right"
            ? "ml-auto h-full w-full max-w-md border-l"
            : position === "left"
              ? "mr-auto h-full w-full max-w-md border-r"
              : "mt-auto max-h-[85vh] w-full rounded-t-card border-t"
        )}
      >
        <div className="flex items-center justify-between border-b border-stone px-6 py-4">
          <h2 id="drawer-title" className="text-lg font-semibold text-ink">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-ink hover:bg-sand"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <div className="border-t border-stone bg-sand px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
