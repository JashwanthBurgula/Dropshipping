import { Skeleton } from "@/components/ui/Skeleton";

export default function CatalogueLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="border-b border-stone pb-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <div className="hidden lg:block lg:w-64 lg:shrink-0">
          <div className="rounded-card border border-stone bg-sand p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-4 h-10 w-full" />
            <Skeleton className="mt-6 h-4 w-24" />
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          </div>
        </div>

        <div className="flex-1">
          <div
            aria-busy="true"
            aria-label="Loading catalogue pieces"
            className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 xl:grid-cols-4"
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col overflow-hidden rounded-card border border-stone bg-sand"
              >
                <Skeleton className="aspect-[4/5] w-full rounded-none" />
                <div className="flex flex-col gap-2.5 p-3.5 sm:p-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-2 h-5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
