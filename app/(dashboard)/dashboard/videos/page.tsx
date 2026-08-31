import { createClient } from '@/lib/supabase/server'
import VideoUploader from '@/components/dashboard/VideoUploader'
import VideoCard from '@/components/dashboard/VideoCard'
import { EmptyState } from '@/components/ui/empty-state'
import { Clapperboard } from 'lucide-react'
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
        <h1 className="text-2xl font-bold text-foreground">Vidéos</h1>
        <p className="text-muted-foreground mt-1">Upload et gère tes vidéos avant publication</p>
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
        <EmptyState
          icon={Clapperboard}
          title="Aucune vidéo pour le moment."
          description="Glisse une vidéo dans la zone ci-dessus pour l'uploader vers Cloudflare R2."
        />
      )}
    </div>
  )
}
