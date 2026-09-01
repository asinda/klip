// components/dashboard/ScheduleDialog.tsx
'use client'

import { useEffect, useState } from 'react'
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
import type { TikTokCreatorInfo } from '@/lib/tiktok/creator-info'

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

  const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null)
  const [loadingCreatorInfo, setLoadingCreatorInfo] = useState(false)
  const [privacyLevel, setPrivacyLevel] = useState('')
  const [allowDuet, setAllowDuet] = useState(false)
  const [allowStitch, setAllowStitch] = useState(false)
  const [allowComments, setAllowComments] = useState(false)
  const [brandedContent, setBrandedContent] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedVideo = videos.find((v) => v.id === videoId)
  const isTikTok = selectedAccount?.platform === 'tiktok'

  useEffect(() => {
    setCreatorInfo(null)
    setPrivacyLevel('')
    setAllowDuet(false)
    setAllowStitch(false)
    setAllowComments(false)
    setBrandedContent(false)
    setConfirmed(false)

    if (!selectedAccount || selectedAccount.platform !== 'tiktok') return

    setLoadingCreatorInfo(true)
    fetch(`/api/tiktok/creator-info?account_id=${selectedAccount.id}`)
      .then((res) => res.json())
      .then((json: ApiResponse<TikTokCreatorInfo>) => {
        if (json.error) {
          toast.error(json.error)
          return
        }
        setCreatorInfo(json.data)
      })
      .finally(() => setLoadingCreatorInfo(false))
  }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const durationTooLong =
    isTikTok &&
    creatorInfo &&
    selectedVideo?.duration != null &&
    selectedVideo.duration > creatorInfo.maxVideoPostDurationSec

  const canSubmit =
    videoId &&
    accountId &&
    scheduledAt &&
    !durationTooLong &&
    (!isTikTok || (creatorInfo && privacyLevel && confirmed))

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error('Remplis tous les champs requis')
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
        ...(isTikTok
          ? {
              privacy_level: privacyLevel,
              disable_duet: !allowDuet,
              disable_stitch: !allowStitch,
              disable_comment: !allowComments,
              is_branded_content: brandedContent,
            }
          : {}),
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

          {isTikTok && loadingCreatorInfo && (
            <p className="text-xs text-muted-foreground">Chargement des réglages TikTok...</p>
          )}

          {isTikTok && creatorInfo && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                {creatorInfo.creatorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creatorInfo.creatorAvatarUrl} alt={creatorInfo.creatorNickname} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-sm text-foreground">
                    {creatorInfo.creatorNickname[0]?.toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-foreground">
                  Publication en tant que <strong>{creatorInfo.creatorNickname}</strong> (@{creatorInfo.creatorUsername})
                </span>
              </div>

              <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir la confidentialité (requis)" />
                </SelectTrigger>
                <SelectContent>
                  {creatorInfo.privacyLevelOptions.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!creatorInfo.duetDisabled && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={allowDuet} onChange={(e) => setAllowDuet(e.target.checked)} />
                  Autoriser les duos
                </label>
              )}
              {!creatorInfo.stitchDisabled && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={allowStitch} onChange={(e) => setAllowStitch(e.target.checked)} />
                  Autoriser les stitchs
                </label>
              )}
              {!creatorInfo.commentDisabled && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={allowComments} onChange={(e) => setAllowComments(e.target.checked)} />
                  Autoriser les commentaires
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={brandedContent} onChange={(e) => setBrandedContent(e.target.checked)} />
                Contenu de marque (Branded Content)
              </label>

              {durationTooLong && (
                <p className="text-xs text-destructive">
                  Cette vidéo dépasse la durée maximale autorisée par TikTok pour ce compte
                  ({creatorInfo.maxVideoPostDurationSec}s).
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                Je confirme les réglages de publication ci-dessus
              </label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || !canSubmit}>
            {submitting ? 'Planification...' : 'Planifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
