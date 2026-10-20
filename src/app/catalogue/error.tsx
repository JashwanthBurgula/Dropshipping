"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function CatalogueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[Catalogue] Error boundary caught:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] bg-[#F5F6F7] py-12 sm:py-16">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[4px] bg-[#FEF3C7] text-[#92400E]">
            <AlertCircle className="h-6 w-6" />
          </div>

          <h1 className="mt-4 text-xl font-bold text-[#101828]">
            Unable to load catalogue
          </h1>

          <p className="mt-2 text-sm text-[#475467]">
            We encountered a temporary issue retrieving product records. Your cart and session are safe.
          </p>

          {error?.digest && (
            <p className="mt-2 font-mono text-xs text-[#475467]">
              Reference: {error.digest}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[4px] bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-[#FFFFFF] hover:bg-[#1E40AF]"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-5 py-2.5 text-sm font-medium text-[#101828] hover:bg-[#F5F6F7]"
            >
              <Home className="h-4 w-4" />
              Return to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
