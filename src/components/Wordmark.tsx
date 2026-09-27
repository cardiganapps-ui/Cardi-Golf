import { Wordmark as Mark } from './primitives'

/** The platform's own mark, typographic (§14). Tournaments bring their own logo. */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <Mark size={{ sm: 16, md: 22, lg: 32 }[size]} />
}
