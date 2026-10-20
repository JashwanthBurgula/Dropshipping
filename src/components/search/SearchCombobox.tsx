"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight } from "lucide-react";
import { PhotoSlot } from "@/components/ui/PhotoSlot";
import { HighlightText } from "@/components/search/HighlightText";
import { formatInrFromPaise } from "@/lib/cn";
import type { SearchSuggestionItem } from "@/lib/search/service";

export interface SearchComboboxProps {
  initialQuery?: string;
  placeholder?: string;
  compact?: boolean;
  onNavigate?: () => void;
}

/**
 * Accessible WAI-ARIA 1.2 Combobox with:
 * - 175ms (150-200ms) debounce
 * - AbortController cancelling stale in-flight requests
 * - Full keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
 * - Thumbnail image preview + safe highlighted terms (no dangerouslySetInnerHTML)
 * - Subtle fade-in under the input
 */
export function SearchCombobox({
  initialQuery = "",
  placeholder = "Search stoneware, kansa, linen...",
  compact = false,
  onNavigate,
}: SearchComboboxProps) {
  const router = useRouter();
  const comboboxId = React.useId();
  const listboxId = `${comboboxId}-listbox`;

  const [query, setQuery] = React.useState(initialQuery);
  const [suggestions, setSuggestions] = React.useState<SearchSuggestionItem[]>(
    []
  );
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      abortControllerRef.current?.abort();
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsLoading(true);

      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed.slice(0, 80))}`,
          {
            method: "GET",
            signal: controller.signal,
          }
        );
        if (!res.ok) {
          setIsLoading(false);
          return;
        }
        const data = (await res.json()) as {
          ok?: boolean;
          suggestions?: SearchSuggestionItem[];
        };
        if (!controller.signal.aborted && data.ok && data.suggestions) {
          setSuggestions(data.suggestions);
          setActiveIndex(-1);
          setIsLoading(false);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setIsLoading(false);
        }
      }
    }, 175);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigateToSearchPage = (targetQuery: string) => {
    const cleaned = targetQuery.trim().slice(0, 80);
    setIsOpen(false);
    setActiveIndex(-1);
    onNavigate?.();
    if (cleaned) {
      router.push(`/search?q=${encodeURIComponent(cleaned)}`);
    } else {
      router.push("/search");
    }
  };

  const navigateToProduct = (slug: string) => {
    setIsOpen(false);
    setActiveIndex(-1);
    onNavigate?.();
    router.push(`/catalogue/${slug}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      if (suggestions.length > 0) {
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (suggestions.length > 0) {
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected =
        activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      if (selected) {
        navigateToProduct(selected.slug);
      } else {
        navigateToSearchPage(query);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const showDropdown = isOpen && query.trim().length >= 2;
  const activeOptionId =
    activeIndex >= 0 && suggestions[activeIndex]
      ? `${comboboxId}-option-${suggestions[activeIndex].id}`
      : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigateToSearchPage(query);
        }}
        className="relative flex items-center"
      >
        <Search
          className="pointer-events-none absolute left-3 h-4 w-4 text-ink-muted"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          id={comboboxId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-label="Search studio catalogue"
          maxLength={80}
          value={query}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-control border border-stone bg-paper pl-9 pr-8 text-sm text-ink placeholder:text-ink-muted/75 focus:border-clay focus:outline-none ${
            compact ? "min-h-[40px] py-1.5" : "min-h-[44px] py-2"
          }`}
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setActiveIndex(-1);
            }}
            aria-label="Clear search query"
            className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded-control text-ink-muted hover:bg-sand hover:text-ink"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : null}
      </form>

      {/* Subtle fade-in suggestion listbox */}
      <div
        id={listboxId}
        role="listbox"
        aria-label="Product suggestions"
        className={`absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-card border border-stone bg-paper transition-opacity duration-150 ${
          showDropdown
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none invisible opacity-0"
        }`}
      >
        {isLoading ? (
          <div className="p-3.5 text-xs text-ink-muted">
            Searching workshop catalogue...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="p-3.5 text-xs text-ink-muted">
            No instant matches for &ldquo;{query.trim()}&rdquo;. Press Enter to
            view in-stock alternatives.
          </div>
        ) : (
          <ul className="divide-y divide-stone">
            {suggestions.map((item, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <li
                  key={item.id}
                  id={`${comboboxId}-option-${item.id}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    navigateToProduct(item.slug);
                  }}
                  className={`flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors ${
                    isSelected ? "bg-sand" : "bg-paper hover:bg-sand/70"
                  }`}
                >
                  <div className="h-11 w-9 shrink-0 overflow-hidden border border-stone bg-sand">
                    <PhotoSlot
                      url={item.thumbnailUrl}
                      aspectRatio={item.thumbnailAspectRatio}
                      altText={item.thumbnailAlt || item.name}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      <HighlightText text={item.name} query={query} />
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                      <span>
                        <HighlightText text={item.category} query={query} />
                      </span>
                      <span>·</span>
                      <span
                        className={
                          item.isPurchasable ? "text-moss" : "text-brick"
                        }
                      >
                        {item.stockLabel}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right font-sans text-sm font-semibold text-ink tabular-nums">
                    {formatInrFromPaise(item.pricePaise)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-stone bg-sand px-3.5 py-2">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              navigateToSearchPage(query);
            }}
            className="flex w-full items-center justify-between text-xs font-medium text-clay-text hover:underline"
          >
            <span>See all results for &ldquo;{query.trim()}&rdquo;</span>
            <ArrowRight
              className="h-3.5 w-3.5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
