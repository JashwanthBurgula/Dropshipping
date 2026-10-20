import { Skeleton } from "@/components/ui/Skeleton";

export default function SearchLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading search results"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
    >
      <div className="mb-8 border-b border-stone pb-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2.5 h-9 w-80 max-w-full" />
        <Skeleton className="mt-4 h-11 w-full max-w-xl" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col overflow-hidden rounded-card border border-stone bg-paper"
          >
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="flex flex-col gap-2.5 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="mt-2 h-8 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
