import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-border p-16 text-center">
      <Icon className="mx-auto mb-4 text-muted-foreground" size={40} />
      <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}
