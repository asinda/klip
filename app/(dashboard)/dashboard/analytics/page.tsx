import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { calculateSuccessRate } from '@/lib/analytics'
import { getJobStatusBadge } from '@/lib/status'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Clapperboard, Video, TrendingUp, AlertTriangle } from 'lucide-react'
import type { JobStatus } from '@/lib/types'

const JOB_STATUSES: JobStatus[] = ['pending', 'processing', 'published', 'failed']

export default async function AnalyticsPage() {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  const [{ count: totalVideos }, { count: shortVideos }, { count: longVideos }] = await Promise.all([
    supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('format', 'short'),
    supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('format', 'long'),
  ])

  const statusCountResults = await Promise.all(
    JOB_STATUSES.map((status) =>
      supabase
        .from('publish_jobs')
        .select('*, video:videos!inner(org_id)', { count: 'exact', head: true })
        .eq('status', status)
        .eq('video.org_id', orgId)
    )
  )
  const counts = Object.fromEntries(
    JOB_STATUSES.map((status, i) => [status, statusCountResults[i].count ?? 0])
  ) as Record<JobStatus, number>
  const totalJobs = JOB_STATUSES.reduce((sum, status) => sum + counts[status], 0)
  const successRate = calculateSuccessRate(counts.published, counts.failed)

  const { data: failedJobs } = await supabase
    .from('publish_jobs')
    .select('id, error_message, scheduled_at, video:videos!inner(title, org_id)')
    .eq('status', 'failed')
    .eq('video.org_id', orgId)
    .order('scheduled_at', { ascending: false })
    .limit(5)

  const stats = [
    { label: 'Vidéos uploadées', value: totalVideos ?? 0, icon: Clapperboard },
    { label: 'Shorts', value: shortVideos ?? 0, icon: Video },
    { label: 'Longues', value: longVideos ?? 0, icon: Video },
    { label: 'Taux de succès', value: `${successRate}%`, icon: TrendingUp },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">Vue d'ensemble de tes publications</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 bg-primary/10">
              <Icon size={20} className="text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5 mb-8">
        <h2 className="font-semibold text-foreground mb-4">Publications par statut</h2>
        <div className="flex flex-col gap-3">
          {JOB_STATUSES.map((status) => {
            const badge = getJobStatusBadge(status)
            const count = counts[status]
            const widthPct = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0
            return (
              <div key={status} className="flex items-center gap-3">
                <Badge className={cn('w-24 justify-center', badge.className)}>{badge.label}</Badge>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${widthPct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {failedJobs && failedJobs.length > 0 ? (
        <Card>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Dernières erreurs</h2>
          </div>
          <div className="divide-y divide-border">
            {failedJobs.map((job: any) => (
              <div key={job.id} className="px-5 py-4">
                <p className="text-sm text-foreground font-medium">{job.video?.title}</p>
                <p className="text-xs text-red-500 mt-0.5">{job.error_message ?? 'Erreur inconnue'}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={AlertTriangle}
          title="Aucune erreur récente"
          description="Les publications échouées apparaîtront ici avec leur raison."
        />
      )}
    </div>
  )
}
