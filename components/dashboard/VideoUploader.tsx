'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UploadCloud, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deriveFormat, deriveTitleFromFilename } from '@/lib/video'
import type { ApiResponse, Video } from '@/lib/types'

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024

interface PresignResult {
  uploadUrl: string
  key: string
  publicUrl: string
}

function captureThumbnail(file: File): Promise<{ blob: Blob; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = URL.createObjectURL(file)
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2)
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas non supporté'))
        return
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const duration = Math.round(video.duration)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(video.src)
        if (blob) resolve({ blob, duration })
        else reject(new Error('Échec de la capture de la miniature'))
      }, 'image/jpeg', 0.8)
    }
    video.onerror = () => reject(new Error('Impossible de lire la vidéo'))
  })
}

async function presignAndUpload(
  file: File | Blob,
  filename: string,
  contentType: string,
  kind: 'video' | 'thumbnail'
): Promise<PresignResult> {
  const presignRes = await fetch('/api/videos/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, fileSize: file.size, kind }),
  })
  const presignJson: ApiResponse<PresignResult> = await presignRes.json()
  if (presignJson.error || !presignJson.data) {
    throw new Error(presignJson.error ?? "Échec de la préparation de l'upload")
  }

  const putRes = await fetch(presignJson.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!putRes.ok) {
    throw new Error("Échec de l'envoi du fichier")
  }

  return presignJson.data
}

export default function VideoUploader() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error('Vidéo trop volumineuse (max 500 Mo)')
      return
    }

    setUploading(true)
    try {
      const { blob: thumbnailBlob, duration } = await captureThumbnail(file)

      const videoUpload = await presignAndUpload(file, file.name, file.type || 'video/mp4', 'video')
      const thumbnailUpload = await presignAndUpload(
        thumbnailBlob,
        `${file.name}.jpg`,
        'image/jpeg',
        'thumbnail'
      )

      const createRes = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: deriveTitleFromFilename(file.name),
          r2_key: videoUpload.key,
          r2_url: videoUpload.publicUrl,
          thumbnail_url: thumbnailUpload.publicUrl,
          file_size: file.size,
          duration,
          format: deriveFormat(duration),
        }),
      })
      const createJson: ApiResponse<Video> = await createRes.json()
      if (createJson.error) {
        throw new Error(createJson.error)
      }

      toast.success('Vidéo uploadée avec succès')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'upload")
    } finally {
      setUploading(false)
    }
  }, [router])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'] },
    maxFiles: 1,
    disabled: uploading,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
        isDragActive ? 'border-purple-500 bg-purple-500/5' : 'border-white/10 hover:border-white/20',
        uploading && 'opacity-60 cursor-not-allowed'
      )}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Upload en cours...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <UploadCloud size={28} />
          <p className="text-sm">Glisse une vidéo ici ou clique pour choisir un fichier</p>
          <p className="text-xs text-slate-500">MP4 ou MOV, 500 Mo max</p>
        </div>
      )}
    </div>
  )
}
