"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  variant?: ToastTone;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastMessage, "id">) => void;
  showToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const dismissToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = React.useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider
      value={{ pushToast, showToast: pushToast, dismissToast }}
    >
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const tone = toast.tone ?? toast.variant ?? "info";
          return (
            <div
              key={toast.id}
              role={tone === "error" || tone === "warning" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-card border bg-paper p-4 shadow-floating",
                "transition-[opacity,transform] duration-base ease-editorial",
                tone === "success" && "border-moss",
                tone === "error" && "border-brick",
                tone === "warning" && "border-amber",
                tone === "info" && "border-stone"
              )}
            >
              {tone === "success" ? (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-moss"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : tone === "error" ? (
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-brick"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : tone === "warning" ? (
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <Info
                  className="mt-0.5 h-5 w-5 shrink-0 text-ink"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              <div className="flex-1 text-sm">
                <p className="font-medium text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-ink-muted">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-control text-ink-muted hover:bg-sand hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
