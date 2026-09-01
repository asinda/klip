import { Skeleton } from '@/components/ui/skeleton'

export default function AnalyticsLoading() {
  return (
    <div>
      <div className="mb-8">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl mb-8" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  )
}
