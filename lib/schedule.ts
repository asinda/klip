export function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay() // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(referenceDate)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() + diffToMonday)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

export function groupJobsByDate<T extends { scheduled_at: string }>(jobs: T[]): Record<string, T[]> {
  return jobs.reduce((acc, job) => {
    const key = job.scheduled_at.slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(job)
    return acc
  }, {} as Record<string, T[]>)
}
