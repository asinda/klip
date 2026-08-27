'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from 'lucide-react'
import { useState } from 'react'

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

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-800"
      >
        <Menu size={20} />
      </button>

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
          'fixed md:relative inset-y-0 left-0 z-50 w-60 flex flex-col bg-slate-900 border-r border-white/5 transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/5">
          <span className="text-xl font-bold">
            KLIP<span className="text-purple-400">.</span>
          </span>
          <button onClick={() => setOpen(false)} className="md:hidden">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Org name */}
        {user?.organizations?.name && (
          <div className="px-5 py-3 border-b border-white/5">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Organisation</p>
            <p className="text-sm text-slate-300 font-medium mt-0.5 truncate">
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
                    ? 'bg-purple-600/20 text-purple-300'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Bottom: user + logout */}
        <div className="px-3 pb-4 border-t border-white/5 pt-4">
          {user?.email && (
            <p className="text-xs text-slate-500 truncate px-3 mb-2">{user.email}</p>
          )}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 w-full transition-colors"
            >
              <LogOut size={18} />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
