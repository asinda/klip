import { createClient } from '@/lib/supabase/server'
import VideoUploader from '@/components/dashboard/VideoUploader'
import VideoCard from '@/components/dashboard/VideoCard'
import type { Video } from '@/lib/types'

export default async function VideosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: userData } = await supabase
    .from('users').select('org_id').eq('id', user!.id).single()

  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('org_id', userData?.org_id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Vidéos</h1>
        <p className="text-slate-400 mt-1">Upload et gère tes vidéos avant publication</p>
      </div>

      <div className="mb-8">
        <VideoUploader />
      </div>

      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video: Video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-dashed border-white/10 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🎬</div>
          <p className="text-slate-400">Aucune vidéo pour le moment.</p>
        </div>
      )}
    </div>
  )
}
