export function calculateSuccessRate(published: number, failed: number): number {
  const total = published + failed
  if (total === 0) return 0
  return Math.round((published / total) * 100)
}
