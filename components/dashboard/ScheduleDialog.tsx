// components/dashboard/ScheduleDialog.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { ApiResponse, PublishJob, Video, SocialAccount } from '@/lib/types'

interface Props {
  videos: Video[]
  accounts: SocialAccount[]
}

export default function ScheduleDialog({ videos, accounts }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [videoId, setVideoId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!videoId || !accountId || !scheduledAt) {
      toast.error('Remplis tous les champs')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        account_id: accountId,
        scheduled_at: new Date(scheduledAt).toISOString(),
      }),
    })
    const json: ApiResponse<PublishJob> = await res.json()
    setSubmitting(false)
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Vidéo planifiée')
    setOpen(false)
    setVideoId('')
    setAccountId('')
    setScheduledAt('')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus size={16} />
          Planifier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planifier une publication</DialogTitle>
          <DialogDescription>Choisis une vidéo, un compte et une date.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une vidéo" />
            </SelectTrigger>
            <SelectContent>
              {videos.map((video) => (
                <SelectItem key={video.id} value={video.id}>
                  {video.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un compte" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  @{account.username} ({account.platform})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Planification...' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
