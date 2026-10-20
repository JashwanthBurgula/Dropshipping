import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocalInboxMessages } from "@/lib/email";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function DevInboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const filterEmail = resolvedParams.email?.trim() || undefined;
  const messages = getLocalInboxMessages(filterEmail);

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6 lg:py-14">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border-warm pb-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-clay-text">
            Development Only Tooling
          </p>
          <h1 className="mt-1 font-sans text-3xl font-semibold text-ink">
            Local Captured Email Inbox
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Inspect verification OTP codes and transactional emails captured in{" "}
            <code className="font-mono text-xs text-ink">.local-inbox.json</code>
            . Returns HTTP 404 outside development.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/verify-email"
            className="inline-flex min-h-[38px] items-center rounded-control border border-border-warm bg-sand px-3.5 py-2 text-xs font-medium text-ink hover:bg-paper"
          >
            Back to Verify Email
          </Link>
          <Link
            href="/dev/inbox"
            className="inline-flex min-h-[38px] items-center rounded-control bg-clay px-3.5 py-2 text-xs font-medium text-paper hover:bg-clay-hover"
          >
            Refresh Inbox
          </Link>
        </div>
      </div>

      {messages.length === 0 ? (
        <Card surface="sand" padding="lg">
          <p className="text-sm text-ink-muted">
            No emails have been captured yet. Register an account or run{" "}
            <code className="font-mono text-xs text-ink">
              npm run email:test -- test@example.com
            </code>{" "}
            to capture a verification OTP email.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {messages.map((msg) => (
            <Card
              key={msg.id}
              surface="sand"
              padding="lg"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-warm pb-3">
                <div>
                  <h2 className="font-sans text-lg font-semibold text-ink">
                    {msg.subject}
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    To:{" "}
                    <span className="font-mono font-medium text-ink">
                      {msg.to}
                    </span>{" "}
                    | From: <span className="font-mono">{msg.from}</span> |
                    Provider:{" "}
                    <span className="font-mono uppercase">{msg.provider}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {msg.metadata?.otpCode ? (
                    <span className="rounded-control border border-clay bg-paper px-3 py-1 font-mono text-base font-bold tracking-widest text-clay-text">
                      OTP: {msg.metadata.otpCode}
                    </span>
                  ) : null}
                  <span className="font-mono text-xs text-ink-muted">
                    {new Date(msg.sentAt).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              <pre className="overflow-x-auto whitespace-pre-wrap rounded-control border border-border-warm bg-paper p-4 font-mono text-xs leading-relaxed text-ink">
                {msg.text}
              </pre>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
