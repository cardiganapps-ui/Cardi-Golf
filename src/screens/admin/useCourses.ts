import { useCallback, useEffect, useState } from 'react'
import { listCourses } from '../../data/api'

export function useCourses() {
  const [courses, setCourses] = useState<Awaited<ReturnType<typeof listCourses>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    listCourses()
      .then(setCourses)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => refresh(), [refresh])
  return { courses, loading, error, refresh }
}
