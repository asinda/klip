import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'
import { getCurrentUserRow, DEV_BYPASS_AUTH } from '@/lib/supabase/dev-org'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // TEMPORARY dev-only auth bypass — see lib/supabase/dev-org.ts
  if (!user && !DEV_BYPASS_AUTH) redirect('/login')

  const { data: userData } = await getCurrentUserRow(supabase, '*, organizations(*)')

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar user={userData} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
