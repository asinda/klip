const API_BASE = 'https://api.linkedin.com/rest'
const LINKEDIN_VERSION = '202601'

const POLL_INTERVAL_MS = 5000
const MAX_POLL_ATTEMPTS = 24 // ~2 minutes, même borne que le poll TikTok existant

function linkedInHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Linkedin-Version': LINKEDIN_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

interface UploadInstruction {
  uploadUrl: string
  firstByte: number
  lastByte: number
}

export async function uploadVideoToLinkedIn(
  accessToken: string,
  organizationUrn: string,
  videoUrl: string,
  fileSizeBytes: number
): Promise<{ videoUrn: string }> {
  const sourceRes = await fetch(videoUrl)
  if (!sourceRes.ok) throw new Error(`Failed to download source video from ${videoUrl}`)
  const videoBytes = new Uint8Array(await sourceRes.arrayBuffer())

  const initRes = await fetch(`${API_BASE}/videos?action=initializeUpload`, {
    method: 'POST',
    headers: { ...linkedInHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initializeUploadRequest: { owner: organizationUrn, fileSizeBytes },
    }),
  })
  if (!initRes.ok) throw new Error(`LinkedIn upload initialization failed: ${initRes.statusText}`)
  const initJson = await initRes.json()
  const videoUrn: string = initJson.value.video
  const uploadToken: string = initJson.value.uploadToken
  const instructions: UploadInstruction[] = initJson.value.uploadInstructions

  const uploadedPartIds: string[] = []
  for (const instruction of instructions) {
    const chunk = videoBytes.slice(instruction.firstByte, instruction.lastByte + 1)
    const partRes = await fetch(instruction.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: chunk,
    })
    if (!partRes.ok) throw new Error(`LinkedIn chunk upload failed for range ${instruction.firstByte}-${instruction.lastByte}`)
    const etag = partRes.headers.get('etag')
    if (!etag) throw new Error(`LinkedIn chunk upload did not return an ETag for range ${instruction.firstByte}-${instruction.lastByte}`)
    uploadedPartIds.push(etag)
  }

  const finalizeRes = await fetch(`${API_BASE}/videos?action=finalizeUpload`, {
    method: 'POST',
    headers: { ...linkedInHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds },
    }),
  })
  if (!finalizeRes.ok) throw new Error(`LinkedIn upload finalization failed: ${finalizeRes.statusText}`)

  let status = 'WAITING_UPLOAD'
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    const statusRes = await fetch(`${API_BASE}/videos/${encodeURIComponent(videoUrn)}`, {
      headers: linkedInHeaders(accessToken),
    })
    if (!statusRes.ok) throw new Error(`Failed to poll LinkedIn video status: ${statusRes.statusText}`)
    const statusJson = await statusRes.json()
    status = statusJson.status
    if (status === 'AVAILABLE' || status === 'PROCESSING_FAILED') break
  }

  if (status !== 'AVAILABLE') {
    throw new Error(`LinkedIn video processing failed (last status: ${status})`)
  }

  return { videoUrn }
}

export async function createLinkedInPost(
  accessToken: string,
  organizationUrn: string,
  videoUrn: string,
  caption: string
): Promise<{ postUrn: string }> {
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: { ...linkedInHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: organizationUrn,
      commentary: caption,
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
      content: { media: { id: videoUrn } },
    }),
  })

  if (!res.ok) throw new Error(`LinkedIn post creation failed with status ${res.status}`)
  const postUrn = res.headers.get('x-restli-id')
  if (!postUrn) throw new Error('LinkedIn post creation did not return a post id')

  return { postUrn }
}
