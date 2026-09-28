import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../data/auth'

/** True once an account is signed in; an anonymous device goes to /entrar and comes back to `path`. */
export function useRequireAccount(path: string, skip = false): boolean {
  const navigate = useNavigate()
  const { ready, user, isAnonymous } = useAuth()
  const ok = ready && !!user && !isAnonymous
  useEffect(() => {
    if (skip || !ready || ok) return
    navigate(`/entrar?next=${encodeURIComponent(path)}`, { replace: true })
  }, [skip, ready, ok, navigate, path])
  return skip || ok
}
