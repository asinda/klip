'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Video,
  CalendarClock,
  BarChart3,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  MoreVertical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/accounts', label: 'Comptes', icon: Users },
  { href: '/dashboard/videos', label: 'Vidéos', icon: Video },
  { href: '/dashboard/schedule', label: 'Planning', icon: CalendarClock },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
]

interface Props {
  user: {
    email: string
    organizations?: { name: string }
  } | null
}

export default function Sidebar({ user }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50"
      >
        <Menu size={20} />
      </Button>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:relative inset-y-0 left-0 z-50 w-60 flex flex-col bg-card border-r border-border transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-border">
          <span className="text-xl font-bold text-foreground">
            KLIP<span className="text-primary">.</span>
          </span>
          <button onClick={() => setOpen(false)} className="md:hidden text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Org name */}
        {user?.organizations?.name && (
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Organisation</p>
            <p className="text-sm text-foreground font-medium mt-0.5 truncate">
              {user.organizations.name}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: theme toggle + user menu */}
        <div className="px-3 pb-4 border-t border-border pt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Changer de thème"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </Button>

          {user?.email && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex-1 justify-start gap-2 px-3">
                  <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                  <MoreVertical size={14} className="ml-auto text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <form action="/api/auth/logout" method="POST" className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2 text-destructive">
                      <LogOut size={16} />
                      Déconnexion
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </aside>
    </>
  )
}
