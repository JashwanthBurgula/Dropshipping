"use client";

import * as React from "react";
import { ZoomIn, ZoomOut, Truck, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PhotoSlot } from "@/components/catalogue/PhotoSlot";
import { formatInrFromPaise } from "@/lib/catalogue/stock";
import type { StorefrontProductImage } from "@/lib/catalogue/service";
import type { DeliveryEstimateResult } from "@/lib/orders/estimate-delivery";

interface PinEstimateApiResponse {
  serviceable: boolean;
  pinCode?: string;
  city?: string;
  state?: string;
  zoneCode?: string;
  shippingFeePaise?: number;
  codAvailable?: boolean;
  estimate?: DeliveryEstimateResult;
  message?: string;
}

export interface ProductDetailGalleryProps {
  images: StorefrontProductImage[];
  productName: string;
}

export function ProductDetailGallery({
  images,
  productName,
}: ProductDetailGalleryProps) {
  const safeImages: StorefrontProductImage[] =
    images.length > 0
      ? images
      : [
          {
            id: "default-slot",
            url: "",
            altText: productName,
            aspectRatio: "4:5",
            sortOrder: 0,
          },
        ];

  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [isZoomed, setIsZoomed] = React.useState(false);

  const activeImage: StorefrontProductImage = safeImages[selectedIndex] ??
    safeImages[0] ?? {
      id: "default-slot",
      url: "",
      altText: productName,
      aspectRatio: "4:5",
      sortOrder: 0,
    };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative border border-stone bg-sand">
        <button
          type="button"
          onClick={() => setIsZoomed((prev) => !prev)}
          aria-label={
            isZoomed ? "Reset product photo zoom" : "Zoom in on product photo"
          }
          className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
        >
          <PhotoSlot
            url={activeImage.url}
            altText={activeImage.altText}
            aspectRatio={activeImage.aspectRatio}
            zoomed={isZoomed}
            priority
            className="border-b-0"
          />
        </button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setIsZoomed((prev) => !prev)}
          className="absolute right-3 bottom-3 bg-paper/95"
        >
          {isZoomed ? (
            <>
              <ZoomOut
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Reset zoom</span>
            </>
          ) : (
            <>
              <ZoomIn
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Inspect detail (Zoom)</span>
            </>
          )}
        </Button>
      </div>

      {safeImages.length > 1 ? (
        <div
          role="tablist"
          aria-label="Product views"
          className="grid grid-cols-4 gap-2.5 sm:grid-cols-5"
        >
          {safeImages.map((img, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                key={img.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedIndex(index);
                  setIsZoomed(false);
                }}
                className={
                  isSelected
                    ? "overflow-hidden rounded-none border-2 border-clay bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                    : "overflow-hidden rounded-none border border-stone bg-sand opacity-80 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                }
              >
                <PhotoSlot
                  url={img.url}
                  altText={img.altText}
                  aspectRatio="1:1"
                  className="border-b-0"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface PinDeliveryEstimatorProps {
  dispatchTimeDays: number;
}

export function PinDeliveryEstimator({
  dispatchTimeDays,
}: PinDeliveryEstimatorProps) {
  const [pinCode, setPinCode] = React.useState("560038");
  const [pinError, setPinError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PinEstimateApiResponse | null>(
    null
  );

  const checkPinEstimate = React.useCallback(
    async (pinToCheck: string) => {
      const cleaned = pinToCheck.trim();
      if (!/^[1-9]\d{5}$/.test(cleaned)) {
        setPinError("Enter a valid 6-digit Indian PIN code (e.g. 560038).");
        setResult(null);
        return;
      }

      setPinError("");
      setLoading(true);
      try {
        const res = await fetch(
          `/api/pin-codes/${encodeURIComponent(
            cleaned
          )}/estimate?processingDays=${dispatchTimeDays}`
        );
        const data = (await res.json()) as PinEstimateApiResponse;
        if (!res.ok || !data.serviceable) {
          setResult(null);
          setPinError(
            data.message ??
              "That PIN code is not in our delivery area yet. Try a nearby 6-digit PIN code."
          );
          return;
        }
        setResult(data);
      } catch {
        setPinError("Unable to check PIN code right now. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [dispatchTimeDays]
  );

  React.useEffect(() => {
    void checkPinEstimate("560038");
  }, [checkPinEstimate]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void checkPinEstimate(pinCode);
  };

  return (
    <div className="rounded-card border border-stone bg-sand p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Truck
          className="h-4 w-4 text-clay"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span>Check Delivery Date &amp; Serviceability</span>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-3 flex items-start gap-2.5"
      >
        <div className="flex-1">
          <Input
            id="pdp-pin-code"
            name="pinCode"
            label="6-digit Delivery PIN Code"
            inputMode="numeric"
            maxLength={6}
            value={pinCode}
            onChange={(e) =>
              setPinCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="560038"
            error={pinError || undefined}
          />
        </div>
        <div className="pt-7">
          <Button
            type="submit"
            variant="secondary"
            isLoading={loading}
            loadingText="Checking..."
          >
            Check PIN
          </Button>
        </div>
      </form>

      {result && result.estimate ? (
        <div className="mt-4 rounded-control border border-stone bg-paper p-3.5 text-xs">
          <div className="flex items-start gap-2 font-medium text-moss">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-ink">
                Estimated arrival: {result.estimate.formattedDeliveryWindow}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Delivering to {result.city}, {result.state} ({result.pinCode})
              </p>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-stone pt-2.5 text-ink-muted sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase">Studio dispatch</dt>
              <dd className="mt-0.5 font-mono text-xs font-medium text-ink">
                {result.estimate.formattedDispatchDate} (
                {result.estimate.processingDays}d)
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase">Courier transit</dt>
              <dd className="mt-0.5 font-mono text-xs font-medium text-ink">
                {result.estimate.transitDays} business days
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase">Cash on Delivery</dt>
              <dd className="mt-0.5 font-mono text-xs font-medium text-ink">
                {result.codAvailable
                  ? `Available (${
                      result.shippingFeePaise === 0
                        ? "Free shipping"
                        : `${formatInrFromPaise(result.shippingFeePaise ?? 0)} shipping`
                    })`
                  : "Prepaid only"}
              </dd>
            </div>
          </dl>
        </div>
      ) : pinError ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-brick">
          <AlertCircle
            className="h-4 w-4 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{pinError}</span>
        </div>
      ) : null}
    </div>
  );
}
