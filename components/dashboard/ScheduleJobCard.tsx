'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformBadge } from '@/lib/status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { Platform, ApiResponse } from '@/lib/types'

export interface ScheduleJobCardJob {
  id: string
  scheduled_at: string
  video: { title: string }
  account: { platform: Platform; username: string }
}

export default function ScheduleJobCard({ job }: { job: ScheduleJobCardJob }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const platform = getPlatformBadge(job.account.platform)

  async function handleCancel() {
    setCancelling(true)
    const res = await fetch(`/api/schedule/${job.id}`, { method: 'DELETE' })
    const json: ApiResponse<null> = await res.json()
    setCancelling(false)
    setConfirmOpen(false)
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Planification annulée')
    router.refresh()
  }

  return (
    <div className="rounded-lg bg-muted p-2 text-xs flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <span className={cn('flex items-center gap-1', platform.className)}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {new Date(job.scheduled_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive">
              <Trash2 size={12} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Annuler cette planification ?</DialogTitle>
              <DialogDescription>
                « {job.video.title} » ne sera plus publiée sur @{job.account.username} à l'heure prévue.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Retour</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                Annuler la planification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="truncate text-foreground">{job.video.title}</p>
    </div>
  )
}
