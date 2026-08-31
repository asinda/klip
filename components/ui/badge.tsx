import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement>

function Badge({ className, ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', className)} {...props} />
}

export { Badge }
