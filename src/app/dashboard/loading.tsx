import { PanelSkeleton, Skeleton } from "@/components/ui";

export default function DashboardLoading() {
  return (
    <div className="container-page pb-10 pt-24" aria-busy="true" aria-label="Loading practice history">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-64" />
      <Skeleton className="mt-2 h-3 w-52" />

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="panel p-4">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-6 w-16" />
            <Skeleton className="mt-2 h-2.5 w-24" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <PanelSkeleton rows={6} />
        <PanelSkeleton rows={5} />
      </div>
    </div>
  );
}
