import { createClient } from '@/lib/supabase/server'
import ConnectAccountButtons from '@/components/dashboard/ConnectAccountButtons'
import AccountCard from '@/components/dashboard/AccountCard'
import type { SocialAccount } from '@/lib/types'

export default async function AccountsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user!.id).single()

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('org_id', userData?.org_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Comptes connectés</h1>
          <p className="text-slate-400 mt-1">Gérez vos comptes TikTok et YouTube</p>
        </div>
        <ConnectAccountButtons />
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account: SocialAccount) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-dashed border-white/10 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🔌</div>
          <h2 className="text-white font-semibold text-lg mb-2">Aucun compte connecté</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
            Connecte ton premier compte TikTok ou YouTube pour commencer à publier automatiquement.
          </p>
          <ConnectAccountButtons />
        </div>
      )}
    </div>
  )
}
