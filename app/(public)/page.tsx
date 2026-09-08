import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <span className="text-2xl font-bold tracking-tight">
          KLIP<span className="text-purple-400">.</span>
        </span>
        <Link
          href="/login"
          className="bg-purple-600 hover:bg-purple-500 transition-colors px-5 py-2 rounded-lg text-sm font-medium"
        >
          Connexion
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex flex-col items-center justify-center text-center px-4 pt-24 pb-16 max-w-4xl mx-auto">
        <span className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-4">
          Publication automatique
        </span>
        <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
          Publie sur TikTok & YouTube
          <br />
          <span className="text-purple-400">sans lever le petit doigt</span>
        </h1>
        <p className="text-lg text-slate-300 max-w-2xl mb-10">
          Connecte tes comptes, charge tes vidéos, planifie. KLIP publie automatiquement
          selon ton calendrier. Zéro serveur à gérer.
        </p>
        <Link
          href="/login"
          className="bg-purple-600 hover:bg-purple-500 transition-colors px-8 py-4 rounded-xl text-lg font-semibold shadow-xl shadow-purple-900/40"
        >
          Commencer gratuitement →
        </Link>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 w-full text-left">
          {[
            {
              icon: '⚡',
              title: 'Upload & Oublie',
              desc: 'Drag & drop tes vidéos. KLIP gère la publication selon ton planning.',
            },
            {
              icon: '📅',
              title: 'Scheduling 30 jours',
              desc: 'Programme jusqu\'à 30 jours de contenu en quelques minutes.',
            },
            {
              icon: '📊',
              title: 'Analytics unifiées',
              desc: 'Vues, likes et performances de tous tes comptes dans un seul dashboard.',
            },
          ].map((f) => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mt-24 w-full">
          <h2 className="text-3xl font-bold mb-12">Tarifs simples</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Starter', price: '49€', desc: '2 comptes · 30 vidéos/mois', highlight: false },
              { name: 'Agency', price: '149€', desc: '10 comptes · 200 vidéos/mois', highlight: true },
              { name: 'White-label', price: '499€', desc: 'Comptes & vidéos illimités', highlight: false },
            ].map((p) => (
              <div
                key={p.name}
                className={`rounded-xl p-8 border ${
                  p.highlight
                    ? 'bg-purple-600 border-purple-500 scale-105'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="text-sm font-medium text-purple-300 mb-2">{p.name}</div>
                <div className="text-4xl font-bold mb-1">{p.price}</div>
                <div className="text-xs text-slate-400 mb-1">/mois</div>
                <p className="text-sm text-slate-300 mt-4">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-8 py-8 flex items-center justify-center gap-6 text-sm text-slate-400 border-t border-white/10">
        <Link href="/privacy" className="hover:text-white transition-colors">
          Politique de confidentialité
        </Link>
        <Link href="/terms" className="hover:text-white transition-colors">
          Conditions d'utilisation
        </Link>
      </footer>
    </div>
  )
}
