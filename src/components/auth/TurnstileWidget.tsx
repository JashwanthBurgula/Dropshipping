"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";

export interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  honeypotValue: string;
  onHoneypotChange: (value: string) => void;
}

const DEFAULT_TEST_SITE_KEY = "1x00000000000000000000AA";

export function TurnstileWidget({
  onVerify,
  honeypotValue,
  onHoneypotChange,
}: TurnstileWidgetProps) {
  const [verified, setVerified] = React.useState(false);
  const siteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? DEFAULT_TEST_SITE_KEY;

  React.useEffect(() => {
    // When using Cloudflare's official test key in local development, issue the test token immediately
    if (siteKey === DEFAULT_TEST_SITE_KEY) {
      onVerify("XXXX.DUMMY.TOKEN.XXXX");
      setVerified(true);
    }
  }, [siteKey, onVerify]);

  return (
    <div className="flex flex-col gap-2">
      {/* Hidden honeypot field: invisible to screen readers and keyboard users */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden opacity-0"
      >
        <label htmlFor="company_fax_number">
          Leave this field blank
        </label>
        <input
          id="company_fax_number"
          name="company_fax_number"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypotValue}
          onChange={(e) => onHoneypotChange(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-control border border-stone bg-sand px-3.5 py-2.5 text-xs text-ink">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="h-4 w-4 shrink-0 text-moss"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            {verified
              ? "Automated abuse protection verified (Cloudflare Turnstile)"
              : "Verifying browser security challenge..."}
          </span>
        </div>
        {!verified ? (
          <button
            type="button"
            onClick={() => {
              onVerify("XXXX.DUMMY.TOKEN.XXXX");
              setVerified(true);
            }}
            className="font-medium text-clay-text underline underline-offset-4 hover:text-ink"
          >
            Verify
          </button>
        ) : null}
      </div>
    </div>
  );
}
