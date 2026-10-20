"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CSRF_HEADER_NAME } from "@/lib/csrf";
import { useToast } from "@/components/ui/Toast";
import type { CustomerCartView } from "@/lib/cart/service";

export interface CartContextValue {
  cart: CustomerCartView | null;
  authenticated: boolean;
  isLoading: boolean;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  badgePulse: boolean;
  liveAnnouncement: string;
  refreshCart: () => Promise<void>;
  addItem: (params: {
    productId: string;
    productName?: string;
    quantity?: number;
    returnToPath?: string;
    openDrawer?: boolean;
  }) => Promise<boolean>;
  updateQuantity: (productId: string, quantity: number) => Promise<boolean>;
  removeItem: (productId: string) => Promise<boolean>;
  clearCart: () => Promise<boolean>;
  updatePinCode: (
    pinCode: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [cart, setCart] = React.useState<CustomerCartView | null>(null);
  const [authenticated, setAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isCartOpen, setIsCartOpen] = React.useState(false);
  const [csrfToken, setCsrfToken] = React.useState("");
  const [badgePulse, setBadgePulse] = React.useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = React.useState("");

  const ensureCsrfToken = React.useCallback(async (): Promise<string> => {
    if (csrfToken) return csrfToken;
    try {
      const res = await fetch("/api/auth/csrf");
      const data = (await res.json()) as { csrfToken?: string };
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    } catch {
      // Ignore
    }
    return "";
  }, [csrfToken]);

  const triggerBadgeTransition = React.useCallback((nextCount: number, message: string) => {
    setBadgePulse(true);
    setLiveAnnouncement(
      `${message} Shopping cart now has ${nextCount} ${
        nextCount === 1 ? "item" : "items"
      }.`
    );
    window.setTimeout(() => {
      setBadgePulse(false);
    }, 240);
  }, []);

  const refreshCart = React.useCallback(async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      if (!res.ok) {
        setIsLoading(false);
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        cart?: CustomerCartView | null;
      };
      setAuthenticated(Boolean(data.authenticated));
      setCart(data.cart ?? null);
    } catch {
      // Ignore network failure during initial hydration
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const addItem = React.useCallback(
    async (params: {
      productId: string;
      productName?: string;
      quantity?: number;
      returnToPath?: string;
      openDrawer?: boolean;
    }): Promise<boolean> => {
      const currentPath =
        params.returnToPath ??
        (typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/catalogue");

      const token = await ensureCsrfToken();

      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: token,
          },
          body: JSON.stringify({
            productId: params.productId,
            quantity: params.quantity ?? 1,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          code?: string;
          error?: string;
          notice?: string;
          cart?: CustomerCartView;
        };

        if (res.status === 401 || data.code === "AUTH_REQUIRED") {
          setAuthenticated(false);
          router.push(
            `/login?returnTo=${encodeURIComponent(currentPath)}`
          );
          return false;
        }

        if (!res.ok || !data.ok || !data.cart) {
          showToast({
            variant: "error",
            title: "Could not add to cart",
            description: data.error ?? "Please try again.",
          });
          return false;
        }

        setAuthenticated(true);
        setCart(data.cart);
        const labelName = params.productName ?? "Piece";
        triggerBadgeTransition(
          data.cart.totals.totalQuantity,
          data.notice ?? `Added ${labelName} to your cart.`
        );

        if (data.notice) {
          showToast({
            variant: "warning",
            title: "Quantity capped by studio stock",
            description: data.notice,
          });
        }

        if (params.openDrawer !== false) {
          setIsCartOpen(true);
        }

        return true;
      } catch {
        showToast({
          variant: "error",
          title: "Network error",
          description: "Unable to reach the cart service.",
        });
        return false;
      }
    },
    [ensureCsrfToken, router, showToast, triggerBadgeTransition]
  );

  const updateQuantity = React.useCallback(
    async (productId: string, quantity: number): Promise<boolean> => {
      const token = await ensureCsrfToken();
      try {
        const res = await fetch("/api/cart", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: token,
          },
          body: JSON.stringify({
            action: "quantity",
            productId,
            quantity,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          notice?: string;
          cart?: CustomerCartView;
        };

        if (!res.ok || !data.ok || !data.cart) {
          showToast({
            variant: "error",
            title: "Cart update failed",
            description: data.error ?? "Could not update item quantity.",
          });
          return false;
        }

        setCart(data.cart);
        triggerBadgeTransition(
          data.cart.totals.totalQuantity,
          data.notice ?? "Updated cart quantity."
        );
        return true;
      } catch {
        return false;
      }
    },
    [ensureCsrfToken, showToast, triggerBadgeTransition]
  );

  const removeItem = React.useCallback(
    async (productId: string): Promise<boolean> => {
      const token = await ensureCsrfToken();
      try {
        const res = await fetch(
          `/api/cart?productId=${encodeURIComponent(productId)}`,
          {
            method: "DELETE",
            headers: {
              [CSRF_HEADER_NAME]: token,
            },
          }
        );

        const data = (await res.json()) as {
          ok?: boolean;
          cart?: CustomerCartView;
        };

        if (!res.ok || !data.ok || !data.cart) {
          return false;
        }

        setCart(data.cart);
        triggerBadgeTransition(
          data.cart.totals.totalQuantity,
          "Removed item from your cart."
        );
        return true;
      } catch {
        return false;
      }
    },
    [ensureCsrfToken, triggerBadgeTransition]
  );

  const clearCart = React.useCallback(async (): Promise<boolean> => {
    const token = await ensureCsrfToken();
    try {
      const res = await fetch("/api/cart", {
        method: "DELETE",
        headers: {
          [CSRF_HEADER_NAME]: token,
        },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        cart?: CustomerCartView;
      };
      if (!res.ok || !data.ok || !data.cart) {
        return false;
      }
      setCart(data.cart);
      triggerBadgeTransition(0, "Cleared all items from your cart.");
      return true;
    } catch {
      return false;
    }
  }, [ensureCsrfToken, triggerBadgeTransition]);

  const updatePinCode = React.useCallback(
    async (pinCode: string): Promise<{ ok: boolean; error?: string }> => {
      const token = await ensureCsrfToken();
      try {
        const res = await fetch("/api/cart", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            [CSRF_HEADER_NAME]: token,
          },
          body: JSON.stringify({
            action: "pin",
            pinCode: pinCode.trim(),
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          cart?: CustomerCartView;
        };

        if (!res.ok || !data.ok || !data.cart) {
          return {
            ok: false,
            error:
              data.error ??
              "This PIN code is not currently serviceable.",
          };
        }

        setCart(data.cart);
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: "Network error while checking PIN code.",
        };
      }
    },
    [ensureCsrfToken]
  );

  const value = React.useMemo<CartContextValue>(
    () => ({
      cart,
      authenticated,
      isLoading,
      isCartOpen,
      setIsCartOpen,
      badgePulse,
      liveAnnouncement,
      refreshCart,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      updatePinCode,
    }),
    [
      cart,
      authenticated,
      isLoading,
      isCartOpen,
      badgePulse,
      liveAnnouncement,
      refreshCart,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      updatePinCode,
    ]
  );

  return (
    <CartContext.Provider value={value}>
      {/* Polite screen-reader live region for cart updates */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider.");
  }
  return ctx;
}
