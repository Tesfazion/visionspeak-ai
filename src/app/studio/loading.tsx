import { Skeleton } from "@/components/ui";

export default function StudioLoading() {
  return (
    <div className="container-wide pb-14 pt-24" aria-busy="true" aria-label="Loading studio">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-8 w-72" />
      <Skeleton className="mt-2 h-3 w-full max-w-xl" />

      <div className="panel mt-5 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-8 w-56" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] 3xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="panel p-2.5">
            <Skeleton className="aspect-video w-full rounded-xl" />
          </div>
          <div className="panel px-4 py-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-9 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="panel p-5">
            <Skeleton className="h-3 w-24" />
            <div className="mt-4 flex items-center gap-5">
              <Skeleton className="size-28 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-3" />
                <Skeleton className="h-3" />
                <Skeleton className="h-3" />
              </div>
            </div>
          </div>
          <div className="panel p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
