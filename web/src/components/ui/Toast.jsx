import { createContext, useCallback, useContext, useState } from 'react'
import { Icon, cx } from './index'

const ToastCtx = createContext(() => {})

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const toast = useCallback((message, type = 'info') => {
    const id = Math.random()
    setItems((x) => [...x.slice(-2), { id, message, type }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200)
  }, [])
  const icon = { success: 'check-circle-bold', error: 'close-circle-bold', info: 'info-circle-bold' }
  const tone = { success: 'text-ok border-ok/20', error: 'text-bad border-bad/20', info: 'text-gold-600 border-gold-400/30' }
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed top-[calc(env(safe-area-inset-top)+12px)] inset-x-4 md:left-auto md:w-96 z-[60] space-y-2 pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('flex items-center gap-2.5 bg-card border rounded-2xl px-4 py-3 shadow-card text-sm font-bold animate-fade', tone[t.type])}>
            <Icon name={icon[t.type]} className="text-lg" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
