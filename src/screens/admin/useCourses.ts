import { useCallback, useEffect, useState } from 'react'
import { listCourses } from '../../data/api'
import { humanError } from '../../lib/humanError'

export function useCourses() {
  const [courses, setCourses] = useState<Awaited<ReturnType<typeof listCourses>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    listCourses()
      .then(setCourses)
      .catch((e) => setError(humanError(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => refresh(), [refresh])
  return { courses, loading, error, refresh }
}
