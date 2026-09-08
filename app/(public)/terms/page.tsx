import Link from 'next/link'

export const metadata = {
  title: "Conditions d'utilisation — KLIP",
}

export default function TermsPage() {
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
        <h1 className="text-3xl md:text-4xl font-extrabold mb-2">Conditions d'utilisation</h1>
        <p className="text-sm text-slate-400 mb-12">Dernière mise à jour : 8 septembre 2026</p>

        <div className="flex flex-col gap-10 text-slate-200 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Le service</h2>
            <p>
              KLIP te permet de connecter tes comptes TikTok et YouTube, d'uploader des vidéos et de
              programmer leur publication automatique à une date et une heure choisies. En utilisant KLIP, tu
              acceptes les conditions ci-dessous.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Qui propose ce service</h2>
            <p>
              KLIP est édité par Alice Sindayigaya, à titre individuel — le projet n'est pas encore constitué
              en société. Contact :{' '}
              <a href="mailto:alicesindayigaya@gmail.com" className="text-purple-300 hover:text-purple-200 underline">
                alicesindayigaya@gmail.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Ton compte</h2>
            <p>
              Tu es responsable de la confidentialité de tes identifiants et de tout ce qui se passe sous ton
              compte. Tu dois avoir le droit d'utiliser et de publier chaque vidéo que tu uploades sur KLIP.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Comptes sociaux connectés</h2>
            <p>
              Quand tu connectes un compte TikTok ou YouTube, tu autorises KLIP à publier en ton nom les
              vidéos que tu programmes toi-même. KLIP ne publie jamais de contenu que tu n'as pas
              explicitement chargé et planifié. L'utilisation de ton compte TikTok ou YouTube via KLIP reste
              soumise aux règles et conditions propres à chacune de ces plateformes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contenu que tu publies</h2>
            <p>
              Tu restes seul responsable du contenu de tes vidéos et de sa conformité aux règles des
              plateformes sur lesquelles il est publié (TikTok, YouTube) et à la loi applicable. KLIP se
              réserve le droit de suspendre un compte en cas d'usage manifestement abusif ou illégal du
              service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Tarifs</h2>
            <p>
              Les tarifs indiqués sur la page d'accueil sont indicatifs : la facturation n'est pas encore
              activée à ce stade du service. Cette page sera mise à jour avant toute mise en place réelle de
              la facturation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Disponibilité du service</h2>
            <p>
              KLIP est en développement actif. Le service est fourni "en l'état", sans garantie de
              disponibilité continue. On s'efforce de prévenir en cas d'interruption prolongée affectant les
              publications déjà programmées.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Résiliation</h2>
            <p>
              Tu peux arrêter d'utiliser KLIP et déconnecter tes comptes sociaux à tout moment. En cas de
              violation manifeste de ces conditions, l'accès à ton compte peut être suspendu.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Droit applicable</h2>
            <p>
              Ces conditions sont régies par le droit français.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Vie privée</h2>
            <p>
              Le traitement de tes données personnelles est décrit dans notre{' '}
              <Link href="/privacy" className="text-purple-300 hover:text-purple-200 underline">
                politique de confidentialité
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
