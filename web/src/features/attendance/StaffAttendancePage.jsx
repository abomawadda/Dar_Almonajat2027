import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Badge, Button, Card, Input, Skeleton, StatRow } from '@/components/ui'
import { isStaffRole } from '@/config/roles'
import { useAction } from '@/hooks/useAction'
import { listStaffDay, staffCheck } from '@/services/academic'
import { fmtTime, todayKey } from '@/lib/format'

export default function StaffAttendancePage() {
  const { actor } = useAuth()
  const { teachers } = useData()
  const [date, setDate] = useState(todayKey())
  const [rows, setRows] = useState(null)
  const staff = isStaffRole(actor.role) ? teachers : (teachers || []).filter((t) => t.id === actor.linkedId)
  const list = staff && staff.length ? staff : (actor.role === 'teacher' ? [{ id: actor.linkedId, name: actor.name }] : staff)

  const load = useCallback(() => {
    setRows(null)
    listStaffDay(date, actor).then((r) => setRows(Object.fromEntries(r.map((x) => [x.staffId, x])))).catch(() => setRows({}))
  }, [date, actor])
  useEffect(load, [load])
  const [check, busy] = useAction((t, kind) => staffCheck({ staffId: t.id, staffName: t.name, date, kind }, actor), { success: 'تم التسجيل' })

  if (!list || !rows) return <Page title="حضور العاملين"><Skeleton rows={4} /></Page>
  const isToday = date === todayKey()
  const inCount = list.filter((t) => rows[t.id]?.checkIn).length
  return (
    <Page title="حضور العاملين">
      <div className="px-4 mb-3"><Input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className="h-11 text-[13px]" /></div>
      <StatRow items={[[inCount, 'حاضر', 'ok'], [list.length - inCount, 'لم يسجّل', 'bad'], [list.length, 'الإجمالي']]} />
      <Card className="mx-4 px-4">
        {list.map((t) => {
          const r = rows[t.id] || {}
          return (
            <div key={t.id} className="flex items-center gap-3 py-3 border-b last:border-0">
              <Avatar name={t.name} size={42} />
              <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{t.name}</div><div className="text-xs text-ink-muted">دخول {fmtTime(r.checkIn)} • خروج {fmtTime(r.checkOut)}</div></div>
              {!isToday ? null : !r.checkIn ? <Button size="sm" disabled={busy} onClick={async () => (await check(t, 'in')) && load()}>دخول</Button>
                : !r.checkOut ? <Button size="sm" variant="danger" disabled={busy} onClick={async () => (await check(t, 'out')) && load()}>خروج</Button>
                : <Badge tone="ok">مكتمل</Badge>}
            </div>
          )
        })}
      </Card>
    </Page>
  )
}
