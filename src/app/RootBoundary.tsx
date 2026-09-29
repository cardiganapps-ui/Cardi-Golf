/**
 * The last line: anything that throws outside the router (or in the router
 * itself) lands here instead of leaving the page white. It also marks that
 * React mounted, so the fallback in index.html stands down.
 */
import { Component, type ReactNode } from 'react'
import { BootProblem } from '../components/BootProblem'

declare global {
  interface Window {
    __poloMounted?: boolean
  }
}

export class RootBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidMount() {
    window.__poloMounted = true
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    return this.state.error ? <BootProblem kind="crash" detail={this.state.error.message} /> : this.props.children
  }
}
