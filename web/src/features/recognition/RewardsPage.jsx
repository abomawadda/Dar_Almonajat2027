// متجر الجوائز: students/parents spend points on rewards; staff manage the catalog and requests.
import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Badge, Button, Card, Chips, EmptyState, Field, Input, Section, Select, Sheet, Skeleton, cx } from '@/components/ui'
import { REDEMPTION_STATUS } from '@/config/constants'
import { isStaffRole } from '@/config/roles'
import { useAction } from '@/hooks/useAction'
import { decideRedemption, requestReward, saveReward, subscribeRedemptions, subscribeRewards, toggleReward } from '@/services/rewards'
import { getBalance } from '@/services/points'

const ICONS = ['🎁', '📖', '🏆', '🎒', '🖊️', '🧸', '⚽', '🍫', '🎟️', '📿']

export default function RewardsPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const staff = isStaffRole(actor.role)
  const shopper = actor.role === 'student' || actor.role === 'parent'
  const [rewards, setRewards] = useState(null)
  const [reds, setReds] = useState(null)
  const [tab, setTab] = useState(staff ? 'requests' : 'store')
  const [edit, setEdit] = useState(null)
  const [sid, setSid] = useState('')
  const [balance, setBalance] = useState(null)
  const student = (students || []).find((s) => s.id === (sid || students?.[0]?.id))

  useEffect(() => subscribeRewards(setRewards), [])
  useEffect(() => subscribeRedemptions(actor, setReds), [actor])
  useEffect(() => {
    if (!shopper || !student) return
    getBalance(student.id).then((b) => setBalance(Number(b?.balance) || 0)).catch(() => setBalance(0))
  }, [shopper, student?.id, reds]) // eslint-disable-line react-hooks/exhaustive-deps

  const [request, requesting] = useAction((r) => requestReward(r, student, actor), { success: 'أُرسل الطلب للإدارة' })
  const [decide, deciding] = useAction((r, d) => decideRedemption(r, d, actor), { success: 'تم' })
  const [toggle] = useAction((r) => toggleReward(r))

  if (!rewards || !reds || !students) return <Page title="متجر الجوائز"><Skeleton rows={5} /></Page>
  const visible = staff ? rewards : rewards.filter((r) => r.active)
  const pendingCount = reds.filter((r) => r.status === 'pending').length

  return (
    <Page title="متجر الجوائز" actions={staff && <Button size="sm" icon="gift-bold" onClick={() => setEdit({ name: '', cost: 50, stock: '', icon: '🎁' })}>جائزة جديدة</Button>}>
      {shopper && (
        <Section>
          {students.length > 1 && (
            <Select value={student?.id} onChange={(e) => setSid(e.target.value)} className="mb-2">
              {students.map((s) => <option key={s.id} value={s.id}>{s.personalInfo.fullName}</option>)}
            </Select>
          )}
          <Card className="p-4 flex items-center justify-between">
            <span className="text-sm font-bold text-ink-soft">رصيد {student?.personalInfo.fullName.split(' ')[0]}</span>
            <span className="text-2xl font-extrabold text-gold-600">{balance ?? '…'} <span className="text-xs">نقطة</span></span>
          </Card>
        </Section>
      )}

      <Chips value={tab} onChange={setTab} options={[['store', 'الجوائز'], ['requests', `الطلبات${pendingCount ? ` (${pendingCount})` : ''}`]]} />

      {tab === 'store' ? (
        <Section>
          {!visible.length ? <EmptyState icon="gift-bold">لا توجد جوائز بعد</EmptyState> : (
            <div className="grid grid-cols-2 gap-2.5">
              {visible.map((r) => {
                const affordable = balance != null && balance >= r.cost
                return (
                  <Card key={r.id} className={cx('p-3 text-center', !r.active && 'opacity-50')}>
                    <div className="text-4xl mb-1">{r.icon || '🎁'}</div>
                    <div className="text-sm font-extrabold leading-5 min-h-[40px]">{r.name}</div>
                    <div className="text-gold-600 font-extrabold mt-1">{r.cost} نقطة</div>
                    <div className="text-[11px] text-ink-muted mb-2">{r.stock == null ? 'متاح' : r.stock > 0 ? `المتبقي ${r.stock}` : 'نفدت الكمية'}</div>
                    {shopper && <Button size="sm" block disabled={!affordable || r.stock === 0} busy={requesting} onClick={() => request(r)}>{affordable ? 'استبدال' : 'رصيد غير كافٍ'}</Button>}
                    {staff && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button size="xs" variant="secondary" onClick={() => setEdit(r)}>تعديل</Button>
                        <Button size="xs" variant="secondary" onClick={() => toggle(r)}>{r.active ? 'إخفاء' : 'إظهار'}</Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </Section>
      ) : (
        <Section>
          {!reds.length ? <EmptyState icon="gift-bold">لا توجد طلبات</EmptyState> : (
            <Card className="px-3">
              {reds.map((r) => {
                const st = REDEMPTION_STATUS[r.status] || {}
                return (
                  <div key={r.id} className="py-3 border-b last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{r.rewardName} <span className="text-gold-600">• {r.cost}</span></span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5">{r.studentName}</div>
                    {staff && r.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Button size="sm" busy={deciding} onClick={() => decide(r, 'approve')}>موافقة وخصم النقاط</Button>
                        <Button size="sm" variant="secondary" busy={deciding} onClick={() => decide(r, 'reject')}>رفض</Button>
                      </div>
                    )}
                    {staff && r.status === 'approved' && <Button size="sm" block className="mt-2" busy={deciding} onClick={() => decide(r, 'deliver')}>تم التسليم</Button>}
                  </div>
                )
              })}
            </Card>
          )}
        </Section>
      )}

      {staff && <RewardSheet value={edit} onClose={() => setEdit(null)} actor={actor} />}
    </Page>
  )
}

function RewardSheet({ value, onClose, actor }) {
  const [f, setF] = useState(value)
  useEffect(() => setF(value), [value])
  const [save, busy] = useAction(() => saveReward(f, actor), { success: 'حُفظت الجائزة' })
  return (
    <Sheet open={!!value} title={value?.id ? 'تعديل جائزة' : 'جائزة جديدة'} onClose={onClose}>
      {f && (
        <>
          <Field label="الرمز">
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((i) => <button key={i} type="button" onClick={() => setF({ ...f, icon: i })} className={cx('w-10 h-10 rounded-xl text-xl', f.icon === i ? 'bg-gold-50 border border-gold-400' : 'bg-field')}>{i}</button>)}
            </div>
          </Field>
          <Field label="اسم الجائزة" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثال: مصحف التجويد" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="التكلفة (نقطة)" required><Input type="number" min="1" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
            <Field label="الكمية (فارغ = غير محدود)"><Input type="number" min="0" value={f.stock ?? ''} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field>
          </div>
          <Button block icon="check-circle-bold" busy={busy} onClick={async () => { if (await save()) onClose() }}>حفظ</Button>
        </>
      )}
    </Sheet>
  )
}
