import { useCallback, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/format'

/**
 * Wrap a write: tracks busy state, shows an Arabic error toast on failure,
 * and an optional success toast. Returns [run, busy].
 * run() resolves to the result (or true when the action returns nothing) on success, and null on failure.
 */
export function useAction(fn, { success } = {}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const run = useCallback(async (...args) => {
    setBusy(true)
    try {
      const r = await fn(...args)
      if (success) toast(typeof success === 'function' ? success(r) : success, 'success')
      return r === undefined ? true : r
    } catch (e) {
      console.error(e)
      toast(errorMessage(e), 'error')
      return null
    } finally {
      setBusy(false)
    }
  }, [fn, success, toast])
  return [run, busy]
}
