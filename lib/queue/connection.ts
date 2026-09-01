import IORedis from 'ioredis'

let connection: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (connection) return connection

  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error('REDIS_URL is not configured')
  }

  connection = new IORedis(url, { maxRetriesPerRequest: null })
  return connection
}
