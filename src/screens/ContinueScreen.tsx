/**
 * `/continuar`, `/continuar/tarjeta`: where the installed app's shortcuts open (the manifest's «En vivo» and
 * «Mi tarjeta», PWA-14). The last tournament this phone opened, on En vivo or its Tarjeta; Home when there is
 * none. The shortcut is the launch, so Home stays Home afterwards (`continueTarget`).
 */
import { useState } from 'react'
import { Navigate } from 'react-router'
import { continueTarget, type ContinueTab } from '../lib/launch'

export function ContinueScreen({ tab = '' }: { tab?: ContinueTab }) {
  const [to] = useState(() => continueTarget(tab))
  return <Navigate to={to} replace />
}
