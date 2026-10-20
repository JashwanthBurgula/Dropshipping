"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CSRF_HEADER_NAME } from "@/lib/csrf";
import { brandConfig } from "@/config/brand";

export function AdminLogoutActions() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/auth/csrf")
      .then((res) => res.json())
      .then((data: { csrfToken?: string }) => {
        if (data.csrfToken) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);
  }, []);

  const handleLogout = async (allDevices: boolean) => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [CSRF_HEADER_NAME]: csrfToken,
        },
        body: JSON.stringify({ allDevices }),
      });
      router.push(`${brandConfig.adminPortalPath}/login`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void handleLogout(false)}
      >
        <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span>Sign out</span>
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => void handleLogout(true)}
      >
        <ShieldAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <span>Sign out all devices</span>
      </Button>
    </div>
  );
}
