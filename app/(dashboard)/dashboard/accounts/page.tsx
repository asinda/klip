import { createClient } from '@/lib/supabase/server'
import ConnectAccountButtons from '@/components/dashboard/ConnectAccountButtons'
import AccountCard from '@/components/dashboard/AccountCard'
import { EmptyState } from '@/components/ui/empty-state'
import { Plug } from 'lucide-react'
import type { SocialAccount } from '@/lib/types'
import { getCurrentUserRow } from '@/lib/supabase/dev-org'

export default async function AccountsPage() {
  const supabase = createClient()
  const { data: userData } = await getCurrentUserRow(supabase, 'org_id')

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
          <h1 className="text-2xl font-bold text-foreground">Comptes connectés</h1>
          <p className="text-muted-foreground mt-1">Gérez vos comptes TikTok et YouTube</p>
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
        <EmptyState
          icon={Plug}
          title="Aucun compte connecté"
          description="Connecte ton premier compte TikTok ou YouTube pour commencer à publier automatiquement."
          action={<ConnectAccountButtons />}
        />
      )}
    </div>
  )
}
