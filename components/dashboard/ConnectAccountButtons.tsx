'use client'

import { useRouter } from 'next/navigation'

export default function ConnectAccountButtons() {
  return (
    <div className="flex gap-3 flex-wrap">
      <a
        href="/api/auth/tiktok"
        className="flex items-center gap-2 bg-black hover:bg-zinc-900 border border-white/10 transition-colors px-4 py-2.5 rounded-lg text-sm font-medium text-white"
      >
        <TikTokIcon />
        Connecter TikTok
      </a>
      <a
        href="/api/auth/youtube"
        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 transition-colors px-4 py-2.5 rounded-lg text-sm font-medium text-white"
      >
        <YouTubeIcon />
        Connecter YouTube
      </a>
    </div>
  )
}

function TikTokIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.82a8.18 8.18 0 004.79 1.53V6.9a4.85 4.85 0 01-1.02-.21z" />
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 00.5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 002.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 002.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.5V8.5L16.5 12l-6.75 3.5z" />
    </svg>
  )
}
