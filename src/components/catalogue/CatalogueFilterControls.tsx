"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { brandConfig } from "@/config/brand";
import type { CatalogueSortOption } from "@/lib/validation/product";

export interface CatalogueFilterControlsProps {
  currentCategory: string;
  currentMinPrice: string;
  currentMaxPrice: string;
  currentSort: CatalogueSortOption;
  totalItems: number;
}

export function CatalogueFilterControls({
  currentCategory,
  currentMinPrice,
  currentMaxPrice,
  currentSort,
  totalItems,
}: CatalogueFilterControlsProps) {
  const router = useRouter();
  const [mobileSheetOpen, setMobileSheetOpen] = React.useState(false);

  const [category, setCategory] = React.useState(currentCategory);
  const [minPrice, setMinPrice] = React.useState(currentMinPrice);
  const [maxPrice, setMaxPrice] = React.useState(currentMaxPrice);
  const [sort, setSort] = React.useState<CatalogueSortOption>(currentSort);

  React.useEffect(() => {
    setCategory(currentCategory);
    setMinPrice(currentMinPrice);
    setMaxPrice(currentMaxPrice);
    setSort(currentSort);
  }, [currentCategory, currentMinPrice, currentMaxPrice, currentSort]);

  const buildCatalogueUrl = (overrides?: {
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: CatalogueSortOption;
  }) => {
    const params = new URLSearchParams();
    const nextCat = overrides?.category ?? category;
    const nextMin = overrides?.minPrice ?? minPrice;
    const nextMax = overrides?.maxPrice ?? maxPrice;
    const nextSort = overrides?.sort ?? sort;

    if (nextCat.trim()) params.set("category", nextCat.trim());
    if (nextMin.trim()) params.set("minPrice", nextMin.trim());
    if (nextMax.trim()) params.set("maxPrice", nextMax.trim());
    if (nextSort && nextSort !== "newest") params.set("sort", nextSort);
    params.set("page", "1");

    const qs = params.toString();
    return qs ? `/catalogue?${qs}` : "/catalogue";
  };

  const handleApplyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setMobileSheetOpen(false);
    router.push(buildCatalogueUrl());
  };

  const handleResetFilters = () => {
    setCategory("");
    setMinPrice("");
    setMaxPrice("");
    setSort("newest");
    setMobileSheetOpen(false);
    router.push("/catalogue");
  };

  const handleSortChange = (nextSort: CatalogueSortOption) => {
    setSort(nextSort);
    router.push(buildCatalogueUrl({ sort: nextSort }));
  };

  const hasActiveFilters =
    Boolean(category) || Boolean(minPrice) || Boolean(maxPrice);

  const renderFilterFormContent = (idPrefix: string) => (
    <form onSubmit={handleApplyFilters} className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-bold uppercase text-[#475467]">
          Categories
        </p>
        <div className="mt-2.5 flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-sm text-[#101828] hover:bg-[#F5F6F7]">
            <input
              type="radio"
              name={`${idPrefix}-category`}
              checked={category === ""}
              onChange={() => setCategory("")}
              className="h-4 w-4 accent-[#1D4ED8]"
            />
            <span>All categories</span>
          </label>
          {brandConfig.categories.map((cat) => (
            <label
              key={cat.slug}
              className="flex cursor-pointer items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-sm text-[#101828] hover:bg-[#F5F6F7]"
            >
              <input
                type="radio"
                name={`${idPrefix}-category`}
                checked={category === cat.name}
                onChange={() => setCategory(cat.name)}
                className="h-4 w-4 accent-[#1D4ED8]"
              />
              <span>{cat.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-[#DDE1E6] pt-4">
        <p className="text-xs font-bold uppercase text-[#475467]">
          Price range (INR)
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Input
            id={`${idPrefix}-min-price`}
            name="minPrice"
            type="number"
            inputMode="numeric"
            min={0}
            label="Min (₹)"
            placeholder="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
          <Input
            id={`${idPrefix}-max-price`}
            name="maxPrice"
            type="number"
            inputMode="numeric"
            min={0}
            label="Max (₹)"
            placeholder="10000"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-[#DDE1E6] pt-4">
        <Button type="submit" variant="primary" fullWidth>
          Apply filters
        </Button>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={handleResetFilters}
          >
            <RotateCcw
              className="h-4 w-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Clear filters</span>
          </Button>
        ) : null}
      </div>
    </form>
  );

  return (
    <>
      {/* Mobile filter button */}
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setMobileSheetOpen(true)}
        >
          <SlidersHorizontal
            className="h-4 w-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            Filter{hasActiveFilters ? " (Active)" : ""} · {totalItems} items
          </span>
        </Button>

        <div className="flex items-center gap-2">
          <label
            htmlFor="mobile-catalogue-sort"
            className="text-xs font-medium text-[#475467]"
          >
            Sort by:
          </label>
          <select
            id="mobile-catalogue-sort"
            value={sort}
            onChange={(e) =>
              handleSortChange(e.target.value as CatalogueSortOption)
            }
            className="min-h-[44px] rounded-[4px] border border-[#DDE1E6] bg-[#FFFFFF] px-3 py-2 text-xs font-medium text-[#101828]"
          >
            <option value="newest">Newest arrivals</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside
        aria-label="Catalogue filters"
        className="hidden lg:block lg:w-64 lg:shrink-0"
      >
        <div className="sticky top-24 rounded-[8px] border border-[#DDE1E6] bg-[#FFFFFF] p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-[#DDE1E6] pb-3">
            <h2 className="text-base font-bold text-[#101828]">
              Filters
            </h2>
            <span className="text-xs text-[#475467]">
              {totalItems} items
            </span>
          </div>

          {renderFilterFormContent("desktop")}
        </div>
      </aside>

      {/* Mobile Drawer */}
      <Drawer
        isOpen={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        title="Filter Products"
        position="bottom"
      >
        <div className="p-4">{renderFilterFormContent("mobile")}</div>
      </Drawer>
    </>
  );
}
