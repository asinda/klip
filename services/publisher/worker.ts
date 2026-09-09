import { config } from 'dotenv'
config({ path: '.env.local' })

import { Worker, type Job } from 'bullmq'
import { getRedisConnection } from '../../lib/queue/connection'
import { PUBLISH_QUEUE_NAME } from '../../lib/queue/publish-queue'
import { createServiceClient } from '../../lib/supabase/server'
import { refreshTikTokToken } from '../../lib/tiktok/oauth'
import { uploadVideoToTikTok, getTikTokPublishStatus } from '../../lib/tiktok/publish'
import { refreshLinkedInToken } from '../../lib/linkedin/oauth'
import { uploadVideoToLinkedIn, createLinkedInPost } from '../../lib/linkedin/publish'

interface PublishJobData {
  publishJobId: string
}

const POLL_INTERVAL_MS = 5000
const MAX_POLL_ATTEMPTS = 24 // ~2 minutes total

async function processJob(job: Job<PublishJobData>): Promise<void> {
  const supabase = createServiceClient()
  const { publishJobId } = job.data

  const { data: publishJob, error: fetchError } = await supabase
    .from('publish_jobs')
    .select(
      '*, video:videos(id, r2_url, title, file_size), account:social_accounts(access_token, refresh_token, token_expires_at, platform, account_id)'
    )
    .eq('id', publishJobId)
    .single()

  if (fetchError || !publishJob) {
    console.error(`[worker] publish job ${publishJobId} not found:`, fetchError)
    return
  }

  if (publishJob.account.platform !== 'tiktok' && publishJob.account.platform !== 'linkedin') {
    console.log(`[worker] skipping job ${publishJobId} (platform: ${publishJob.account.platform} not yet supported by the worker)`)
    return
  }

  await supabase.from('publish_jobs').update({ status: 'processing' }).eq('id', publishJobId)

  try {
    let accessToken: string = publishJob.account.access_token
    const tokenExpired = publishJob.account.token_expires_at
      ? new Date(publishJob.account.token_expires_at) < new Date()
      : false

    if (tokenExpired && publishJob.account.refresh_token) {
      if (publishJob.account.platform === 'tiktok') {
        const refreshed = await refreshTikTokToken(publishJob.account.refresh_token)
        accessToken = refreshed.access_token
        // Persist immediately: if TikTok rotates the refresh_token (single-use),
        // failing to save it here breaks every future refresh for this account.
        await supabase
          .from('social_accounts')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq('id', publishJob.account_id)
      } else {
        const refreshed = await refreshLinkedInToken(publishJob.account.refresh_token)
        accessToken = refreshed.access_token
        await supabase
          .from('social_accounts')
          .update({
            access_token: refreshed.access_token,
            token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          })
          .eq('id', publishJob.account_id)
      }
    }

    let platformPostId: string

    if (publishJob.account.platform === 'tiktok') {
      const { publishId } = await uploadVideoToTikTok(accessToken, publishJob.video.r2_url, publishJob.video.title, {
        privacyLevel: publishJob.tiktok_privacy_level,
        disableDuet: publishJob.tiktok_disable_duet,
        disableStitch: publishJob.tiktok_disable_stitch,
        disableComment: publishJob.tiktok_disable_comment,
        isBrandedContent: publishJob.tiktok_branded_content,
      })

      let finalStatus = 'PROCESSING_UPLOAD'
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        finalStatus = await getTikTokPublishStatus(accessToken, publishId)
        if (finalStatus === 'PUBLISH_COMPLETE' || finalStatus === 'FAILED') break
      }

      if (finalStatus !== 'PUBLISH_COMPLETE') {
        throw new Error(`TikTok publish did not complete in time (last status: ${finalStatus})`)
      }

      platformPostId = publishId
    } else {
      if (publishJob.video.file_size == null) {
        throw new Error('Cannot publish to LinkedIn: video file_size is unknown')
      }
      const organizationUrn = `urn:li:organization:${publishJob.account.account_id}`
      const { videoUrn } = await uploadVideoToLinkedIn(
        accessToken,
        organizationUrn,
        publishJob.video.r2_url,
        publishJob.video.file_size
      )
      const { postUrn } = await createLinkedInPost(accessToken, organizationUrn, videoUrn, publishJob.video.title)
      platformPostId = postUrn
    }

    await supabase
      .from('publish_jobs')
      .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId })
      .eq('id', publishJobId)
    await supabase.from('videos').update({ status: 'published' }).eq('id', publishJob.video.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error(`[worker] publish job ${publishJobId} failed:`, message)
    const { error: jobUpdateError } = await supabase
      .from('publish_jobs')
      .update({
        status: 'failed',
        error_message: message,
        retry_count: (publishJob.retry_count ?? 0) + 1,
      })
      .eq('id', publishJobId)
    if (jobUpdateError) {
      console.error(`[worker] publish job ${publishJobId} failed to persist failure status:`, jobUpdateError)
    }
    await supabase.from('videos').update({ status: 'failed' }).eq('id', publishJob.video.id)
  }
}

const worker = new Worker<PublishJobData>(PUBLISH_QUEUE_NAME, processJob, {
  connection: getRedisConnection(),
})

worker.on('completed', (job) => console.log(`[worker] job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err.message))

console.log('[worker] publish worker started, waiting for jobs...')
