/**
 * The app's one button (VIS-17). Every button, and every link drawn as one, is `.btn` with one variant from
 * global.css: `Button` renders it, and `buttonClass` gives a router link or an anchor the same classes. The
 * style guide's `Button` used to be a second system (its own module classes: an ink-bordered secondary, a 40 %
 * disabled), which no screen shipped. Apart from primitives.tsx so that file exports components only (QA-15).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonLook {
  /** primary: the one action of a screen; secondary: the others; ghost: a quiet text button; danger: what destroys. */
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  /** As wide as its column. */
  block?: boolean
  /** A ghost button that starts a line hangs its padding into the margin (VIS-23). */
  flush?: boolean
}

export function buttonClass({ variant = 'secondary', size = 'md', block, flush }: ButtonLook = {}, extra?: string): string {
  return ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block', flush && 'btn--flush', extra].filter(Boolean).join(' ')
}
