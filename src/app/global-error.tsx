"use client";

import * as React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F6F2EA] px-4 py-16 text-[#1D1B18]">
        <div className="mx-auto max-w-xl rounded-[8px] border border-[#D9D2C5] bg-[#EDE6D8] p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-[#962828]">
            HTTP 500 · Application Error
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            We could not complete your request right now.
          </h1>
          <p className="mt-2 text-sm text-[#544E46]">
            No payment was charged unless confirmed by receipt email. Please reload
            the page or return to the home page.
          </p>
          {error.digest ? (
            <p className="mt-2 font-mono text-xs text-[#544E46]">
              Reference: {error.digest}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="min-h-[44px] rounded-[4px] bg-[#A8381F] px-5 py-2.5 text-sm font-medium text-[#F6F2EA]"
            >
              Reload page
            </button>
            <a
              href="/"
              className="inline-flex min-h-[44px] items-center rounded-[4px] border border-[#D9D2C5] bg-[#F6F2EA] px-5 py-2.5 text-sm font-medium text-[#1D1B18]"
            >
              Go to Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
