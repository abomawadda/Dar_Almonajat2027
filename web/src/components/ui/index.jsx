// UI kit — the v7 visual language as reusable React components.
import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { avatarGradient, initials } from '@/lib/format'

export { Icon }
export const cx = (...a) => a.filter(Boolean).join(' ')

export const TONES = {
  gold:   'bg-gold-50 text-gold-500',
  ok:     'bg-ok-soft text-ok',
  warn:   'bg-warn-soft text-warn',
  bad:    'bg-bad-soft text-bad',
  info:   'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  muted:  'bg-field text-ink-soft'
}

export function Button({ variant = 'primary', size = 'md', icon, busy, block, className, children, ...rest }) {
  const v = {
    primary:   'bg-gold-grad text-white shadow-lift active:brightness-95',
    secondary: 'bg-card text-ink border border-black/10 active:bg-field',
    outline:   'bg-transparent text-gold-500 border border-gold-400/40 active:bg-gold-50',
    danger:    'bg-bad-soft text-bad border border-bad/15 active:brightness-95',
    info:      'bg-info-soft text-info border border-info/15 active:brightness-95',
    ghost:     'bg-transparent text-ink-soft active:bg-field'
  }[variant]
  const s = { sm: 'h-9 px-3 text-[13px] rounded-xl gap-1.5', md: 'h-12 px-4 text-[15px] rounded-2xl gap-2', xs: 'h-7 px-2.5 text-xs rounded-lg gap-1' }[size]
  return (
    <button
      type="button"
      disabled={busy || rest.disabled}
      className={cx('inline-flex items-center justify-center font-bold transition disabled:opacity-60 disabled:pointer-events-none select-none', v, s, block && 'w-full', className)}
      {...rest}
    >
      {busy ? <Spinner /> : icon && <Icon name={icon} className="text-[1.15em]" />}
      {children}
    </button>
  )
}

export const Spinner = () => <span className="inline-block w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin" />

export function Card({ className, children, ...rest }) {
  return <div className={cx('bg-card border rounded-[18px] shadow-xs', className)} {...rest}>{children}</div>
}

export function Badge({ tone = 'muted', className, children }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap', TONES[tone], className)}>{children}</span>
}

export function Avatar({ name, size = 40 }) {
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ width: size, height: size, fontSize: Math.round(size / 3), background: avatarGradient(name) }}>
      {initials(name)}
    </div>
  )
}

export function Section({ title, action, children, className }) {
  return (
    <section className={cx('px-4 mb-5', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-[15px] font-extrabold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function ListItem({ leading, title, subtitle, trailing, onClick, className }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('w-full flex items-center gap-3 py-3 text-right border-b last:border-b-0', onClick && 'active:bg-field/60', className)}>
      {leading}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{title}</div>
        {subtitle && <div className="text-xs text-ink-muted mt-0.5 truncate">{subtitle}</div>}
      </div>
      {trailing}
    </Tag>
  )
}

export function EmptyState({ icon = 'info-circle-bold', children }) {
  return (
    <div className="text-center text-ink-muted text-[13px] py-10 px-4">
      <Icon name={icon} className="text-4xl mx-auto mb-2 opacity-50 block" />
      {children}
    </div>
  )
}

export function Skeleton({ rows = 3 }) {
  return (
    <div className="px-4 space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 rounded-2xl animate-shimmer" style={{ background: 'linear-gradient(90deg,#F3F2EF,#F9F8F5,#F3F2EF)', backgroundSize: '200% 100%' }} />
      ))}
    </div>
  )
}

/** Loading → empty → content, the three states every live list goes through. */
export function Async({ data, empty, emptyIcon, children }) {
  if (data == null) return <Skeleton />
  if (Array.isArray(data) && !data.length) return <EmptyState icon={emptyIcon}>{empty}</EmptyState>
  return children
}

export function Chips({ value, onChange, options }) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-3 -mb-1 no-scrollbar">
      {options.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={cx('shrink-0 h-8 px-3.5 rounded-full text-[12.5px] font-bold border transition',
            value === k ? 'bg-gold-500 text-white border-gold-500' : 'bg-card text-ink-soft border-black/10')}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative px-4 mb-3">
      <Icon name="magnifer-linear" className="absolute top-1/2 -translate-y-1/2 right-7 text-ink-muted text-lg" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-11 pr-10 pl-3 rounded-xl bg-card border text-sm outline-none focus:border-gold-400" />
    </div>
  )
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex bg-field rounded-xl p-[3px] gap-[3px]">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={cx('flex-1 h-9 rounded-[9px] text-[13px] font-bold transition', value === k ? 'bg-card text-gold-600 shadow-card' : 'text-ink-muted')}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative w-[46px] h-[26px] rounded-full transition shrink-0 disabled:opacity-40', checked ? 'bg-gold-400' : 'bg-black/10')}>
      <span className={cx('absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all', checked ? 'right-[23px]' : 'right-[3px]')} />
    </button>
  )
}

export function ToggleRow({ title, subtitle, checked, onChange, disabled }) {
  return (
    <div className={cx('flex items-center gap-3 p-3 border rounded-2xl mb-2 bg-card', disabled && 'opacity-55')}>
      <div className="flex-1"><div className="text-[13.5px] font-bold">{title}</div>{subtitle && <div className="text-[11.5px] text-ink-muted mt-0.5">{subtitle}</div>}</div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export function Field({ label, error, required, children }) {
  return (
    <label className="block mb-3.5">
      {label && <span className="block text-[13px] font-bold text-ink-soft mb-1.5">{label}{required && <span className="text-bad"> *</span>}</span>}
      {children}
      {error && <span className="block text-xs text-bad mt-1">{error}</span>}
    </label>
  )
}
const inputCls = 'w-full h-12 px-3.5 rounded-xl bg-field border border-transparent text-[14.5px] outline-none focus:border-gold-400 focus:bg-card transition'
export const Input = (p) => <input {...p} className={cx(inputCls, p.className)} />
export const Select = ({ children, ...p }) => <select {...p} className={cx(inputCls, 'appearance-none', p.className)}>{children}</select>
export const Textarea = (p) => <textarea rows={3} {...p} className={cx(inputCls, 'h-auto py-3 resize-none', p.className)} />

export function KV({ label, children }) {
  return (
    <div>
      <div className="text-[11px] text-ink-muted mb-0.5">{label}</div>
      <div className="text-[13.5px] font-bold break-words">{children === '' || children == null ? '—' : children}</div>
    </div>
  )
}

export function StatRow({ items }) {
  return (
    <Card className="flex py-3 mx-4 mb-4">
      {items.map(([value, label, tone], i) => (
        <div key={i} className={cx('flex-1 text-center', i && 'border-r')}>
          <div className={cx('text-xl font-extrabold', tone && { ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', info: 'text-info', gold: 'text-gold-500' }[tone])}>{value}</div>
          <div className="text-[11px] text-ink-muted mt-0.5">{label}</div>
        </div>
      ))}
    </Card>
  )
}

/** Bottom sheet modal with swipe-down to close. */
export function Sheet({ open, title, onClose, children }) {
  const [drag, setDrag] = useState(0)
  const [start, setStart] = useState(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 animate-fade" onClick={onClose} />
      <div role="dialog" aria-label={title}
        className="absolute bottom-0 inset-x-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[520px] max-h-[88vh] bg-card rounded-t-[22px] flex flex-col animate-up shadow-2xl"
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}>
        <div className="pt-2.5 pb-1 cursor-grab touch-none"
          onTouchStart={(e) => setStart(e.touches[0].clientY)}
          onTouchMove={(e) => start != null && setDrag(Math.max(0, e.touches[0].clientY - start))}
          onTouchEnd={() => { if (drag > 90) onClose(); setDrag(0); setStart(null) }}>
          <div className="w-9 h-1 rounded-full bg-black/15 mx-auto" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-base font-extrabold">{title}</h3>
          <button onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-full bg-field flex items-center justify-center text-ink-soft"><Icon name="close-circle-bold" className="text-xl" /></button>
        </div>
        <div className="overflow-y-auto p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">{children}</div>
      </div>
    </div>
  )
}

export function PickRow({ checked, disabled, onSelect, title, subtitle, children }) {
  return (
    <button type="button" disabled={disabled} onClick={onSelect}
      className={cx('w-full flex items-center gap-3 p-3 border rounded-2xl mb-2 text-right transition', checked ? 'border-gold-400/50 bg-gold-50' : 'bg-card', disabled && 'opacity-50')}>
      <span className={cx('w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center', checked ? 'border-gold-500' : 'border-black/25')}>
        {checked && <span className="w-2.5 h-2.5 rounded-full bg-gold-500" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold">{title}</div>
        {subtitle && <div className="text-[11.5px] text-ink-muted mt-0.5">{subtitle}</div>}
        {children}
      </div>
    </button>
  )
}

export function Progress({ value, tone = 'gold' }) {
  return (
    <div className="h-1.5 rounded-full bg-field overflow-hidden">
      <div className={cx('h-full rounded-full', tone === 'bad' ? 'bg-bad' : 'bg-gold-grad')} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  )
}
