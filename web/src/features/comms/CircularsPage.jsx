import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page, TileIcon } from '@/components/layout/AppShell'
import { Async, Badge, Button, Card, Chips, Field, Icon, Input, Select, Sheet, Textarea, ToggleRow } from '@/components/ui'
import { AUDIENCES } from '@/config/constants'
import { can } from '@/config/permissions'
import { isStaffRole } from '@/config/roles'
import { useAction } from '@/hooks/useAction'
import { acknowledgeCircular, deleteCircular, sendCircular } from '@/services/comms'
import { relTime } from '@/lib/format'

export default function CircularsPage() {
  const { actor } = useAuth()
  const { circulars } = useData()
  const [aud, setAud] = useState('all')
  const [viewId, setViewId] = useState(null)
  const [params, setParams] = useSearchParams()
  const staff = isStaffRole(actor.role)
  const list = (circulars || []).filter((c) => aud === 'all' || c.audience === aud)
  const view = (circulars || []).find((c) => c.id === viewId)
  const read = (c) => (c.acks || []).includes(actor.uid)
  const [ack, acking] = useAction((id) => acknowledgeCircular(id, actor), { success: 'تم تأكيد الاطلاع' })
  const [remove, removing] = useAction(deleteCircular, { success: 'تم الحذف' })

  return (
    <Page title="التعميمات" actions={can(actor.role, 'circulars.publish') && <Button size="sm" icon="add-square-bold" onClick={() => setParams({ new: '1' })}>جديد</Button>}>
      {staff && <Chips value={aud} onChange={setAud} options={[['all', 'الكل'], ['teachers', 'للمحفظين'], ['students', 'للطلبة'], ['parents', 'لأولياء الأمور']]} />}
      <Async data={circulars && list} empty="لا توجد تعميمات" emptyIcon="document-text-bold">
        <Card className="mx-4 px-4">
          {list.map((c) => (
            <button key={c.id} onClick={() => setViewId(c.id)} className="w-full flex gap-3.5 py-3.5 border-b last:border-0 text-right">
              <TileIcon icon="document-text-bold" tone="violet" size={44} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{c.title}</div>
                <div className="text-[11px] text-ink-muted mt-0.5">إلى: {AUDIENCES[c.audience]}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  {!staff && c.requiresAck && !read(c) && <span className="w-2 h-2 rounded-full bg-gold-500" />}
                  <span className="text-[10px] text-ink-muted">{relTime(c.createdAt)}</span>
                  {staff && c.requiresAck && <Badge>اطّلع {(c.acks || []).length}</Badge>}
                  {!staff && read(c) && <Badge tone="ok">تم الاطلاع</Badge>}
                </div>
              </div>
              <Icon name="alt-arrow-left-linear" className="text-ink-muted mt-3" />
            </button>
          ))}
        </Card>
      </Async>
      <Sheet open={!!view} title="تعميم" onClose={() => setViewId(null)}>
        {view && <>
          <div className="text-[17px] font-extrabold mb-1.5">{view.title}</div>
          <div className="text-xs text-ink-muted mb-4">{view.authorName} • {relTime(view.createdAt)}</div>
          <p className="text-sm leading-8 text-ink-soft whitespace-pre-wrap">{view.body}</p>
          {staff ? (
            <>
              <div className="mt-4 text-xs text-ink-muted">اطّلع على التعميم {(view.acks || []).length} مستخدم</div>
              {actor.role === 'admin' && <Button block variant="danger" className="mt-4" icon="trash-bin-trash-bold" busy={removing} onClick={async () => { if (confirm('حذف التعميم؟') && (await remove(view.id))) setViewId(null) }}>حذف التعميم</Button>}
            </>
          ) : view.requiresAck && (read(view)
            ? <div className="mt-5 px-3 py-2.5 rounded-xl bg-ok-soft text-ok text-xs font-bold flex items-center gap-1.5"><Icon name="check-circle-bold" />أكّدت الاطلاع على هذا التعميم</div>
            : <Button block className="mt-5" icon="check-circle-bold" busy={acking} onClick={() => ack(view.id)}>تأكيد الاطلاع</Button>)}
        </>}
      </Sheet>
      <NewCircularSheet open={params.get('new') === '1' && can(actor.role, 'circulars.publish')} onClose={() => setParams({})} />
    </Page>
  )
}

function NewCircularSheet({ open, onClose }) {
  const { actor } = useAuth()
  const [f, setF] = useState({ title: '', body: '', audience: 'all', requiresAck: true })
  const [save, busy] = useAction(() => sendCircular(f, actor), { success: 'تم إرسال التعميم' })
  return (
    <Sheet open={open} title="تعميم جديد" onClose={onClose}>
      <Field label="العنوان" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="الجهة المستهدفة"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="النص" required><Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <ToggleRow title="يتطلب تأكيد الاطلاع" subtitle="تتابع من اطّلع ومن لم يطّلع" checked={f.requiresAck} onChange={(requiresAck) => setF({ ...f, requiresAck })} />
      <Button block className="mt-2" icon="plain-bold" busy={busy} disabled={!f.title.trim() || !f.body.trim()}
        onClick={async () => { if (await save()) { setF({ title: '', body: '', audience: 'all', requiresAck: true }); onClose() } }}>إرسال</Button>
    </Sheet>
  )
}
