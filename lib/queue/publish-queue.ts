import { Queue } from 'bullmq'
import { getRedisConnection } from './connection'

export const PUBLISH_QUEUE_NAME = 'publish-jobs'

let queue: Queue | null = null

export function getPublishQueue(): Queue {
  if (queue) return queue
  queue = new Queue(PUBLISH_QUEUE_NAME, { connection: getRedisConnection() })
  return queue
}

export function computeDelayMs(scheduledAt: string | Date): number {
  const target = new Date(scheduledAt).getTime()
  const delay = target - Date.now()
  return delay > 0 ? delay : 0
}

export async function enqueuePublishJob(publishJobId: string, scheduledAt: string): Promise<void> {
  const publishQueue = getPublishQueue()
  await publishQueue.add('publish', { publishJobId }, { delay: computeDelayMs(scheduledAt) })
}
