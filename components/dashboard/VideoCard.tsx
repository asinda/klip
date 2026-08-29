import { formatBytes, formatDuration } from '@/lib/utils'
import type { Video } from '@/lib/types'

const STATUS_LABELS: Record<Video['status'], { label: string; class: string }> = {
  uploaded: { label: 'Uploadée', class: 'bg-slate-500/10 text-slate-400' },
  scheduled: { label: 'Planifiée', class: 'bg-amber-500/10 text-amber-400' },
  published: { label: 'Publiée', class: 'bg-emerald-500/10 text-emerald-400' },
  failed: { label: 'Échouée', class: 'bg-red-500/10 text-red-400' },
}

export default function VideoCard({ video }: { video: Video }) {
  const status = STATUS_LABELS[video.status]

  return (
    <div className="bg-slate-900 border border-white/5 rounded-xl overflow-hidden">
      <div className="aspect-video bg-slate-800 relative">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-3xl">🎬</div>
        )}
        {video.duration !== null && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-sm font-medium text-white truncate">{video.title}</p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">
            {video.file_size !== null ? formatBytes(video.file_size) : '—'} · {video.format === 'short' ? 'Short' : 'Long'}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.class}`}>
            {status.label}
          </span>
        </div>
      </div>
    </div>
  )
}
