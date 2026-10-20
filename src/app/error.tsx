"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCcw, Home, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Unhandled route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-content px-4 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-wider text-brick">
          HTTP 500 · Server Error
        </p>
        <h1 className="mt-2 font-sans text-3xl font-medium text-ink sm:text-4xl">
          Something went wrong while loading this page.
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          Your cart and existing orders are safe. We logged this error so our team can
          fix it. Please try reloading the page, or head back to the storefront.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-ink-muted">
            Error reference: {error.digest}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={reset}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <span>Try again</span>
          </Button>
          <Link href="/">
            <Button variant="secondary">
              <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Return to Home</span>
            </Button>
          </Link>
          <Link href="/track">
            <Button variant="outline">
              <PackageCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Track an order</span>
            </Button>
          </Link>
        </div>

        <Card surface="sand" padding="md" className="mt-8">
          <p className="text-sm font-medium text-ink">
            Need help with a payment or active delivery?
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Write to support@kalaandkiln.in with your order ID (ORD-YYYYMMDD-XXXXX) or
            registered email address and we will respond within 4 business hours.
          </p>
        </Card>
      </div>
    </div>
  );
}
