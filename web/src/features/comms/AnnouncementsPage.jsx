import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Badge, Button, Chips, Field, Input, Segmented, Select, Sheet, Textarea, ToggleRow, cx } from '@/components/ui'
import { ANNOUNCEMENT_TYPES, AUDIENCES } from '@/config/constants'
import { can } from '@/config/permissions'
import { useAction } from '@/hooks/useAction'
import { deleteAnnouncement, publishAnnouncement } from '@/services/comms'
import { relTime } from '@/lib/format'

const STRIPE = { general: 'from-info to-blue-400', academic: 'from-gold-600 to-gold-400', admin: 'from-violet to-purple-400', event: 'from-ok to-emerald-400' }

export default function AnnouncementsPage() {
  const { actor } = useAuth()
  const { announcements } = useData()
  const [type, setType] = useState('all')
  const [view, setView] = useState(null)
  const [params, setParams] = useSearchParams()
  const canPublish = can(actor.role, 'announcements.publish')
  const list = (announcements || []).filter((a) => type === 'all' || a.type === type)
  const [remove, removing] = useAction(deleteAnnouncement, { success: 'تم الحذف' })

  return (
    <Page title="الإعلانات" actions={canPublish && <Button size="sm" icon="add-square-bold" onClick={() => setParams({ new: '1' })}>جديد</Button>}>
      <Chips value={type} onChange={setType} options={[['all', 'الكل'], ...Object.entries(ANNOUNCEMENT_TYPES)]} />
      <Async data={announcements && list} empty="لا توجد إعلانات" emptyIcon="bell-bold">
        <div className="px-4 space-y-3">
          {list.map((a) => (
            <button key={a.id} onClick={() => setView(a)} className="w-full text-right bg-card border rounded-[18px] overflow-hidden shadow-xs">
              <div className={cx('h-1 bg-gradient-to-l', STRIPE[a.type] || STRIPE.general)} />
              <div className="p-4">
                <div className="flex justify-between items-center mb-2"><Badge tone="gold">{ANNOUNCEMENT_TYPES[a.type] || 'عام'}</Badge><span className="text-[11px] text-ink-muted">{relTime(a.createdAt)}</span></div>
                <div className="font-extrabold text-[15px] mb-1">{a.title}</div>
                <p className="text-[13px] text-ink-soft leading-7 clamp-3">{a.body}</p>
                <div className="flex justify-between items-center mt-3 pt-3 border-t text-[11px] text-ink-muted"><span>{AUDIENCES[a.audience]}</span>{a.pinned && <Badge tone="gold">مثبّت</Badge>}</div>
              </div>
            </button>
          ))}
        </div>
      </Async>
      <Sheet open={!!view} title={ANNOUNCEMENT_TYPES[view?.type] || 'إعلان'} onClose={() => setView(null)}>
        {view && <>
          <div className="text-[17px] font-extrabold mb-1.5">{view.title}</div>
          <div className="text-xs text-ink-muted mb-4">{view.authorName} • {relTime(view.createdAt)} • {AUDIENCES[view.audience]}</div>
          <p className="text-sm leading-8 text-ink-soft whitespace-pre-wrap">{view.body}</p>
          {can(actor.role, 'announcements.delete') && <Button block variant="danger" className="mt-5" icon="trash-bin-trash-bold" busy={removing} onClick={async () => { if (confirm('حذف الإعلان؟') && (await remove(view.id))) setView(null) }}>حذف الإعلان</Button>}
        </>}
      </Sheet>
      {canPublish && <NewAnnouncementSheet open={params.get('new') === '1'} onClose={() => setParams({})} />}
    </Page>
  )
}

function NewAnnouncementSheet({ open, onClose }) {
  const { actor } = useAuth()
  const [f, setF] = useState({ title: '', body: '', type: 'general', audience: 'all', pinned: false })
  const [save, busy] = useAction(() => publishAnnouncement(f, actor), { success: 'تم نشر الإعلان' })
  return (
    <Sheet open={open} title="إعلان جديد" onClose={onClose}>
      <Field label="العنوان" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="النوع"><Segmented value={f.type} onChange={(type) => setF({ ...f, type })} options={Object.entries(ANNOUNCEMENT_TYPES)} /></Field>
      <Field label="المستهدفون"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{Object.entries(AUDIENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="النص" required><Textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <ToggleRow title="تثبيت أعلى القائمة" checked={f.pinned} onChange={(pinned) => setF({ ...f, pinned })} />
      <Button block className="mt-2" icon="plain-bold" busy={busy} disabled={!f.title.trim() || !f.body.trim()}
        onClick={async () => { if (await save()) { setF({ title: '', body: '', type: 'general', audience: 'all', pinned: false }); onClose() } }}>نشر</Button>
    </Sheet>
  )
}
