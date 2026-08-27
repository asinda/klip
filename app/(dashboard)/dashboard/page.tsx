import { createClient } from '@/lib/supabase/server'
import { Video, Users, CalendarClock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user!.id)
    .single()

  const orgId = userData?.org_id

  const [{ count: videoCount }, { count: accountCount }, { count: pendingCount }, { count: publishedCount }] =
    await Promise.all([
      supabase.from('videos').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('social_accounts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      supabase.from('publish_jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('publish_jobs').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    ])

  const stats = [
    { label: 'Vidéos uploadées', value: videoCount ?? 0, icon: Video, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Comptes connectés', value: accountCount ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Publications planifiées', value: pendingCount ?? 0, icon: CalendarClock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Publiées avec succès', value: publishedCount ?? 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ]

  // Recent jobs
  const { data: recentJobs } = await supabase
    .from('publish_jobs')
    .select('*, video:videos(title), account:social_accounts(username, platform)')
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Vue d'ensemble de ton activité</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-slate-900 border border-white/5 rounded-xl p-5">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', bg)}>
              <Icon size={20} className={color} />
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Link
          href="/dashboard/videos"
          className="group bg-purple-600/10 border border-purple-500/20 hover:bg-purple-600/20 transition-colors rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-600/20 flex items-center justify-center">
            <Video size={24} className="text-purple-400" />
          </div>
          <div>
            <div className="font-medium text-white">Uploader une vidéo</div>
            <div className="text-sm text-slate-400">Drag & drop vers Cloudflare R2</div>
          </div>
        </Link>
        <Link
          href="/dashboard/accounts"
          className="group bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 transition-colors rounded-xl p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center">
            <Users size={24} className="text-blue-400" />
          </div>
          <div>
            <div className="font-medium text-white">Connecter un compte</div>
            <div className="text-sm text-slate-400">TikTok ou YouTube via OAuth</div>
          </div>
        </Link>
      </div>

      {/* Recent activity */}
      {recentJobs && recentJobs.length > 0 && (
        <div className="bg-slate-900 border border-white/5 rounded-xl">
          <div className="px-5 py-4 border-b border-white/5">
            <h2 className="font-semibold text-white">Activité récente</h2>
          </div>
          <div className="divide-y divide-white/5">
            {recentJobs.map((job: any) => (
              <div key={job.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{job.video?.title ?? 'Vidéo supprimée'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {job.account?.platform === 'tiktok' ? '🎵' : '▶️'} @{job.account?.username}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {(!recentJobs || recentJobs.length === 0) && (
        <div className="bg-slate-900 border border-dashed border-white/10 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🎬</div>
          <p className="text-slate-400">Aucune publication pour le moment.</p>
          <Link href="/dashboard/videos" className="text-purple-400 text-sm hover:underline mt-2 inline-block">
            Uploader ta première vidéo →
          </Link>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; class: string }> = {
    pending: { label: 'Planifié', class: 'bg-amber-500/10 text-amber-400' },
    processing: { label: 'En cours', class: 'bg-blue-500/10 text-blue-400' },
    published: { label: 'Publié', class: 'bg-emerald-500/10 text-emerald-400' },
    failed: { label: 'Échoué', class: 'bg-red-500/10 text-red-400' },
  }
  const s = map[status] ?? { label: status, class: 'bg-slate-500/10 text-slate-400' }
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${s.class}`}>
      {s.label}
    </span>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}
