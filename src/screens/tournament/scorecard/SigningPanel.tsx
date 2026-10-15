import { motion } from 'motion/react'
import { memo } from 'react'
import { IconLock } from '../../../components/icons'
import { Sheet } from '../../../components/ui'
import { easeSlow } from '../../../design/motion'
import type { CardSignature, Pair, Player } from '../../../engine/types'
import { t } from '../../../i18n/es-MX'
import { cardSignedFor } from '../../../engine/core/cardSigning'
import { pairNameIn } from './cardRules'
import styles from '../ScorecardScreen.module.css'

const S = t.card

/**
 * «Firmar tarjeta» after the last hole (§9.3): each pair of the group, signed or not. Each pair signs the other
 * pair's card (tarjeta cruzada); the Comité may sign either. Memoized on the boards' own lists (PERF-09).
 */
export const SigningPanel = memo(function SigningPanel(p: {
  roundId: string
  groupPlayerIds: readonly string[]
  pairs: readonly Pair[]
  signatures: readonly CardSignature[]
  players: readonly Player[]
  myPairId: string | null
  isAdmin: boolean
  onSign: (pairId: string) => void
}) {
  const pairName = pairNameIn(p.players)
  return (
    <div>
      {p.pairs
        .filter((pair) => [pair.player1Id, pair.player2Id].every((id) => p.groupPlayerIds.includes(id)))
        .map((pair) => {
          const isSigned = p.signatures.some((s) => s.roundId === p.roundId && s.pairId === pair.id)
          const mine = p.myPairId === pair.id
          return (
            <div key={pair.id} className={styles.signRow}>
              <span className={styles.signText}>
                <strong>{pairName(pair)}</strong>
                <span className={`${styles.signState} ${isSigned ? styles.signLocked : ''}`}>
                  {isSigned && <IconLock size={14} />}
                  {isSigned ? S.cardSigned : S.cardUnsigned}
                </span>
              </span>
              {/* A signed card is the one irreversible thing a player
                  does all day. It should feel like it: the stamp a
                  referee's desk would put on it. */}
              {isSigned && (
                <motion.span className={styles.stamp} aria-hidden="true" initial={{ scale: 1.25, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={easeSlow}>
                  {S.stamp}
                </motion.span>
              )}
              {!isSigned && (!mine || p.isAdmin) && (
                <button className="btn btn--primary btn--sm" type="button" onClick={() => p.onSign(pair.id)}>
                  {S.sign}
                </button>
              )}
            </div>
          )
        })}
    </div>
  )
})

/**
 * «Firmar la tarjeta de …» under a marker's rule (UX-23): each player of the group whose card is complete, signed
 * or not. Another player of the group signs it, never the player himself; the Comité may sign any, his own too
 * (as under the pairs' rule). A phone outside the group sees the state and no button: the server would refuse it.
 */
export const MarkerSigningPanel = memo(function MarkerSigningPanel(p: {
  roundId: string
  /** The group's players with complete cards, in the card's order, with the name the card shows. */
  players: ReadonlyArray<{ id: string; name: string }>
  signatures: readonly CardSignature[]
  /** The tournament's pairs: a card its pair signed under the pairs' rule stays signed. */
  pairs: readonly Pair[]
  myPlayerId: string | null
  /** Whether this phone's player plays in the group. */
  inGroup: boolean
  isAdmin: boolean
  onSign: (playerId: string) => void
}) {
  if (!p.players.length) return null
  return (
    <div>
      <p className="help">{S.signMarkerHint}</p>
      {p.players.map(({ id, name }) => {
        const isSigned = cardSignedFor({ cardSignatures: p.signatures, pairs: p.pairs }, p.roundId, id)
        const canSign = p.isAdmin || (p.inGroup && id !== p.myPlayerId)
        return (
          <div key={id} className={styles.signRow}>
            <span className={styles.signText}>
              <strong>{name}</strong>
              <span className={`${styles.signState} ${isSigned ? styles.signLocked : ''}`}>
                {isSigned && <IconLock size={14} />}
                {isSigned ? S.cardSigned : S.cardUnsigned}
              </span>
            </span>
            {isSigned && (
              <motion.span className={styles.stamp} aria-hidden="true" initial={{ scale: 1.25, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={easeSlow}>
                {S.stamp}
              </motion.span>
            )}
            {!isSigned && canSign && (
              <button className="btn btn--primary btn--sm" type="button" aria-label={S.signPlayer(name)} onClick={() => p.onSign(id)}>
                {S.signShort}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
})

/** The question before a card is signed: it locks the card (a pair's, or one player's under a marker's rule). */
export const SignSheet = memo(function SignSheet(p: { open: boolean; title: string | undefined; confirm?: string; onClose: () => void; onSign: () => void }) {
  return (
    <Sheet open={p.open} onClose={p.onClose} title={p.title}>
      <div className="stack">
        <p className="help">{p.confirm ?? S.signConfirm}</p>
        <div className="row">
          <button className="btn btn--secondary" type="button" onClick={p.onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn--primary grow" type="button" onClick={p.onSign}>
            {S.sign}
          </button>
        </div>
      </div>
    </Sheet>
  )
})
