/**
 * Tests for the querySeq stale-result prevention pattern used in ScanView.
 *
 * ScanView uses a monotonic `querySeq` counter to ensure that a slow or
 * out-of-order extraction does not overwrite state from a newer operation.
 * The pattern:
 *   const seq = ++querySeq
 *   const result = await slowOperation()
 *   if (seq !== querySeq) return   // ← stale check
 *   applyResult(result)
 */
import { describe, it, expect } from 'vitest'

describe('querySeq stale-result prevention pattern', () => {
  it('a scan from a previous tab is correctly identified as stale', () => {
    let querySeq = 0
    const captureSeq = (): number => ++querySeq

    // User is on Tab A, starts a scan.
    const seqA = captureSeq()

    // User switches to Tab B — refreshTabState() increments querySeq.
    const _seqB = captureSeq()

    // Tab A scan resolves: stale check detects it is outdated.
    expect(seqA !== querySeq).toBe(true)
  })

  it('the most recently started scan is never stale when it resolves last', () => {
    let querySeq = 0
    const captureSeq = (): number => ++querySeq

    captureSeq() // first scan (older, will be stale)
    const seq2 = captureSeq() // second scan (most recent)

    // seq2 is still current when it resolves.
    expect(seq2 !== querySeq).toBe(false)
  })

  it('no scan can be stale if only one has ever been started', () => {
    let querySeq = 0
    const captureSeq = (): number => ++querySeq

    const seq = captureSeq()

    // Only one scan — it must be current when it resolves.
    expect(seq !== querySeq).toBe(false)
  })

  it('rapid tab switches invalidate all prior scans', () => {
    let querySeq = 0
    const captureSeq = (): number => ++querySeq

    const seqs = [captureSeq(), captureSeq(), captureSeq(), captureSeq()]
    const latestSeq = captureSeq()

    // All earlier seqs are stale.
    for (const seq of seqs) {
      expect(seq !== querySeq).toBe(true)
    }

    // Only the latest is current.
    expect(latestSeq !== querySeq).toBe(false)
  })
})
