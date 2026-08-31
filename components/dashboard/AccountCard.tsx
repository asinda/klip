'use client'

import type { SocialAccount } from '@/lib/types'
import { toast } from 'sonner'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformBadge } from '@/lib/status'
import { Card } from '@/components/ui/card'
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

interface Props { account: SocialAccount }

export default function AccountCard({ account }: Props) {
  const [removing, setRemoving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleRemove() {
    setRemoving(true)
    const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Compte déconnecté')
      window.location.reload()
    } else {
      toast.error('Erreur lors de la déconnexion')
      setRemoving(false)
      setConfirmOpen(false)
    }
  }

  const platform = getPlatformBadge(account.platform)
  const tokenExpired = account.token_expires_at
    ? new Date(account.token_expires_at) < new Date()
    : false

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {account.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.avatar_url} alt={account.username} className="w-11 h-11 rounded-full" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-lg text-foreground">
              {account.username[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-foreground">@{account.username}</p>
            <span className={cn('flex items-center gap-1.5 text-xs', platform.className)}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {platform.label}
            </span>
          </div>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Déconnecter ce compte ?</DialogTitle>
              <DialogDescription>
                @{account.username} ne sera plus utilisé pour publier automatiquement. Cette action est réversible en reconnectant le compte.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
              <Button variant="destructive" onClick={handleRemove} disabled={removing}>
                Déconnecter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tokenExpired && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-400">⚠️ Token expiré — reconnecte ce compte</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Connecté le {new Date(account.created_at).toLocaleDateString('fr-FR')}
      </div>
    </Card>
  )
}
