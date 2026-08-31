'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <AlertTriangle className="text-destructive" size={40} />
      <div>
        <h2 className="text-lg font-semibold text-foreground">Une erreur est survenue</h2>
        <p className="mt-1 text-sm text-muted-foreground">Réessaie, ou reviens plus tard si le problème persiste.</p>
      </div>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  )
}
