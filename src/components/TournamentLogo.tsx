/**
 * Every <img> of a tournament's logo (PERF-01). A rendition carries its size
 * in its URL, so the image gets width and height: a slot sized by its height
 * (the TV, the ceremony, the printed card) has its width before the file
 * arrives, and nothing beside it moves. A logo stored before renditions is
 * shown as it is, its slot's CSS box holding it. On the dark sheet it sits on a
 * paper plate (`.tournament-logo`, global.css): a logo drawn for paper, dark on
 * transparent, vanished on it (VIS-11).
 */
import { logoSize } from '../lib/logo'

export function TournamentLogo({
  url,
  className,
  crossOrigin,
}: {
  url: string
  className?: string
  crossOrigin?: 'anonymous'
}) {
  const size = logoSize(url)
  return (
    <img
      src={url}
      alt=""
      className={className ? `tournament-logo ${className}` : 'tournament-logo'}
      width={size?.width}
      height={size?.height}
      decoding="async"
      crossOrigin={crossOrigin}
    />
  )
}
