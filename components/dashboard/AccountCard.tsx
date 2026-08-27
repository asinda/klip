'use client'

import type { SocialAccount } from '@/lib/types'
import { toast } from 'sonner'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'

interface Props { account: SocialAccount }

export default function AccountCard({ account }: Props) {
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    if (!confirm(`Déconnecter @${account.username} ?`)) return
    setRemoving(true)
    const res = await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Compte déconnecté')
      window.location.reload()
    } else {
      toast.error('Erreur lors de la déconnexion')
      setRemoving(false)
    }
  }

  const isPlatformTikTok = account.platform === 'tiktok'
  const tokenExpired = account.token_expires_at
    ? new Date(account.token_expires_at) < new Date()
    : false

  return (
    <div className="bg-slate-900 border border-white/5 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {account.avatar_url ? (
            <img src={account.avatar_url} alt={account.username} className="w-11 h-11 rounded-full" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-lg">
              {account.username[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-white">@{account.username}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isPlatformTikTok ? 'bg-black text-white' : 'bg-red-600/20 text-red-400'}`}>
              {isPlatformTikTok ? 'TikTok' : 'YouTube'}
            </span>
          </div>
        </div>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {tokenExpired && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-400">⚠️ Token expiré — reconnecte ce compte</p>
        </div>
      )}

      <div className="text-xs text-slate-500">
        Connecté le {new Date(account.created_at).toLocaleDateString('fr-FR')}
      </div>
    </div>
  )
}
