import { formatBytes, formatDuration } from '@/lib/utils'
import { getVideoStatusBadge } from '@/lib/status'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Video } from '@/lib/types'

export default function VideoCard({ video }: { video: Video }) {
  const status = getVideoStatusBadge(video.status)

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted relative">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-3xl">🎬</div>
        )}
        {video.duration !== null && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {video.file_size !== null ? formatBytes(video.file_size) : '—'} · {video.format === 'short' ? 'Short' : 'Long'}
          </span>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
      </div>
    </Card>
  )
}
