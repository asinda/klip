import { createClient } from '@/lib/supabase/server'
import { Video, Users, CalendarClock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { getJobStatusBadge } from '@/lib/status'
import { EmptyState } from '@/components/ui/empty-state'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')

  const orgId = userData?.org_id

  const [{ count: videoCount }, { count: accountCount }, { count: pendingCount }, { count: publishedCount }] =
    await Promise.all([
      supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('social_accounts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      supabase.from('publish_jobs').select('*, video:videos!inner(org_id)', { count: 'exact', head: true }).eq('status', 'pending').eq('video.org_id', orgId),
      supabase.from('publish_jobs').select('*, video:videos!inner(org_id)', { count: 'exact', head: true }).eq('status', 'published').eq('video.org_id', orgId),
    ])

  const stats = [
    { label: 'Vidéos uploadées', value: videoCount ?? 0, icon: Video, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Comptes connectés', value: accountCount ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Publications planifiées', value: pendingCount ?? 0, icon: CalendarClock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Publiées avec succès', value: publishedCount ?? 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ]

  // Recent jobs — joined video is filtered by org_id via the same relation used above
  const { data: recentJobs } = await supabase
    .from('publish_jobs')
    .select('*, video:videos!inner(title, org_id), account:social_accounts(username, platform)')
    .eq('video.org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Vue d'ensemble de ton activité</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="p-5">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', bg)}>
              <Icon size={20} className={color} />
            </div>
            <div className="text-2xl font-bold text-foreground">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href="/dashboard/videos"
          className="group bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Video size={24} className="text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">Uploader une vidéo</div>
            <div className="text-sm text-muted-foreground">Drag & drop vers Cloudflare R2</div>
          </div>
        </Link>
        <Link
          href="/dashboard/accounts"
          className="group bg-blue-600/5 border border-blue-500/20 hover:bg-blue-600/10 transition-colors rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-600/10 flex items-center justify-center">
            <Users size={24} className="text-blue-400" />
          </div>
          <div>
            <div className="font-medium text-foreground">Connecter un compte</div>
            <div className="text-sm text-muted-foreground">TikTok ou YouTube via OAuth</div>
          </div>
        </Link>
      </div>

      {/* Recent activity */}
      {recentJobs && recentJobs.length > 0 ? (
        <Card>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Activité récente</h2>
          </div>
          <div className="divide-y divide-border">
            {recentJobs.map((job: any) => {
              const status = getJobStatusBadge(job.status)
              const badge = <Badge className={status.className}>{status.label}</Badge>
              return (
                <div key={job.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground font-medium">{job.video?.title ?? 'Vidéo supprimée'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {job.account?.platform === 'tiktok' ? '🎵' : '▶️'} @{job.account?.username}
                    </p>
                  </div>
                  {job.status === 'failed' && job.error_message ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{badge}</TooltipTrigger>
                      <TooltipContent>{job.error_message}</TooltipContent>
                    </Tooltip>
                  ) : (
                    badge
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Video}
          title="Aucune publication pour le moment."
          description="Uploade une vidéo puis planifie sa publication pour la voir apparaître ici."
          action={
            <Link href="/dashboard/videos" className="text-primary text-sm hover:underline">
              Uploader ta première vidéo →
            </Link>
          }
        />
      )}
    </div>
  )
}
