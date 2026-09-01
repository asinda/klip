import { createClient } from '@/lib/supabase/server'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'
import { getWeekDays, groupJobsByDate, formatDateKey } from '@/lib/schedule'
import ScheduleDialog from '@/components/dashboard/ScheduleDialog'
import ScheduleJobCard, { type ScheduleJobCardJob } from '@/components/dashboard/ScheduleJobCard'
import { Card } from '@/components/ui/card'
import type { Video, SocialAccount } from '@/lib/types'

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default async function SchedulePage() {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')
  const orgId = userData?.org_id

  const [{ data: videos }, { data: accounts }, { data: jobs }] = await Promise.all([
    supabase.from('videos').select('*').eq('org_id', orgId).eq('status', 'uploaded').order('created_at', { ascending: false }),
    supabase.from('social_accounts').select('*').eq('org_id', orgId).eq('is_active', true),
    supabase
      .from('publish_jobs')
      .select('id, scheduled_at, video:videos!inner(title, org_id), account:social_accounts(platform, username)')
      .eq('video.org_id', orgId)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true }),
  ])

  const weekDays = getWeekDays(new Date())
  const jobsByDate = groupJobsByDate((jobs ?? []) as { scheduled_at: string }[])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planning</h1>
          <p className="text-muted-foreground mt-1">
            Semaine du {weekDays[0].toLocaleDateString('fr-FR')} au {weekDays[6].toLocaleDateString('fr-FR')}
          </p>
        </div>
        <ScheduleDialog videos={(videos ?? []) as Video[]} accounts={(accounts ?? []) as SocialAccount[]} />
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {weekDays.map((day, i) => (
            <div
              key={i}
              className="p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground border-r border-border last:border-r-0"
            >
              {WEEKDAY_LABELS[i]} {day.getDate()}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 min-h-[240px]">
          {weekDays.map((day, i) => {
            const key = formatDateKey(day)
            const dayJobs = (jobsByDate[key] ?? []) as unknown as ScheduleJobCardJob[]
            return (
              <div key={i} className="p-2 border-r border-border last:border-r-0 flex flex-col gap-2">
                {dayJobs.map((job) => (
                  <ScheduleJobCard key={job.id} job={job} />
                ))}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
