import Link from 'next/link'

export const metadata = {
  title: 'Politique de confidentialité — KLIP',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white">
      <nav className="flex items-center justify-between px-8 py-5 max-w-3xl mx-auto">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          KLIP<span className="text-purple-400">.</span>
        </Link>
        <Link href="/login" className="text-sm text-slate-300 hover:text-white transition-colors">
          Connexion
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pb-24 pt-8">
        <h1 className="text-3xl md:text-4xl font-extrabold mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-slate-400 mb-12">Dernière mise à jour : 8 septembre 2026</p>

        <div className="flex flex-col gap-10 text-slate-200 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Qui nous sommes</h2>
            <p>
              KLIP est un projet édité par Alice Sindayigaya, à titre individuel — le projet n'est pas
              encore constitué en société. Pour toute question sur cette politique ou sur tes données,
              écris à{' '}
              <a href="mailto:alicesindayigaya@gmail.com" className="text-purple-300 hover:text-purple-200 underline">
                alicesindayigaya@gmail.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Ce que KLIP collecte</h2>
            <ul className="list-disc list-inside flex flex-col gap-2">
              <li>Ton adresse email et les informations de ton organisation, pour créer et gérer ton compte.</li>
              <li>Les vidéos que tu uploades, stockées pour être publiées sur les plateformes que tu connectes.</li>
              <li>
                Les jetons d'accès (access token / refresh token) de tes comptes TikTok et YouTube, une fois
                que tu les connectes via leur écran de consentement officiel — uniquement pour publier en ton
                nom les vidéos que tu programmes.
              </li>
              <li>Les informations publiques de ton compte créateur (nom, avatar) renvoyées par TikTok, affichées dans l'outil de planification.</li>
              <li>L'historique de tes planifications et leur statut (en attente, publiée, échouée) et le message d'erreur le cas échéant.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Pourquoi on collecte ça</h2>
            <p>
              Uniquement pour faire fonctionner le service tel que décrit sur la page d'accueil : te permettre
              de connecter tes comptes, uploader des vidéos, les programmer, et les publier automatiquement à
              l'heure prévue. KLIP ne vend ni ne partage tes données à des fins publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Avec qui ces données sont partagées</h2>
            <p className="mb-3">
              KLIP s'appuie sur les prestataires suivants pour fonctionner. Chacun ne reçoit que ce qui est
              nécessaire à son rôle :
            </p>
            <ul className="list-disc list-inside flex flex-col gap-2">
              <li><strong className="text-white">Supabase</strong> — authentification et base de données.</li>
              <li><strong className="text-white">Cloudflare (R2)</strong> — stockage des fichiers vidéo.</li>
              <li><strong className="text-white">Upstash</strong> — file d'attente des publications programmées.</li>
              <li><strong className="text-white">Railway</strong> — hébergement de l'application.</li>
              <li>
                <strong className="text-white">TikTok</strong> et <strong className="text-white">YouTube (Google)</strong> — reçoivent la vidéo et les
                réglages de publication que tu choisis, uniquement au moment de publier un post que tu as
                planifié toi-même.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Combien de temps on garde tes données</h2>
            <p>
              Tes vidéos, comptes connectés et historique de publication sont conservés tant que ton compte
              est actif. Si tu supprimes ton compte ou déconnectes un compte social, les données associées
              (jetons d'accès, vidéos, planifications) sont supprimées.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Cookies</h2>
            <p>
              KLIP utilise un cookie de session strictement nécessaire à l'authentification (pour te garder
              connecté entre deux visites). Aucun cookie publicitaire ou de suivi tiers n'est utilisé.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Tes droits</h2>
            <p>
              Tu peux demander l'accès, la rectification ou la suppression de tes données à tout moment en
              écrivant à{' '}
              <a href="mailto:alicesindayigaya@gmail.com" className="text-purple-300 hover:text-purple-200 underline">
                alicesindayigaya@gmail.com
              </a>
              . On y répond dans un délai raisonnable.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
