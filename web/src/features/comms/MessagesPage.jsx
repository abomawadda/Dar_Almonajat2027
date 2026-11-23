// الرسائل: conversation list + thread. Parents write to their children's teachers or the administration;
// teachers and staff answer parents.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Badge, Button, Card, EmptyState, ListItem, Section, Sheet, Skeleton, Textarea, cx } from '@/components/ui'
import { useAction } from '@/hooks/useAction'
import { MAX_MESSAGE, contactsFor, markConversationRead, myKey, otherName, sendMessage, subscribeConversations, subscribeThread } from '@/services/messages'
import { relTime } from '@/lib/format'

export default function MessagesPage() {
  const { actor } = useAuth()
  const { students } = useData()
  const [convs, setConvs] = useState(null)
  const [params, setParams] = useSearchParams()
  const [pick, setPick] = useState(false)
  const openId = params.get('c')
  useEffect(() => subscribeConversations(actor, setConvs), [actor])
  const contacts = useMemo(() => contactsFor(actor, students || []), [actor, students])
  const me = myKey(actor)

  if (!me) return <Page title="الرسائل"><EmptyState icon="chat-round-dots-bold">الرسائل متاحة لأولياء الأمور والمحفظين والإدارة</EmptyState></Page>
  if (!convs || !students) return <Page title="الرسائل"><Skeleton rows={5} /></Page>

  const conv = convs.find((c) => c.id === openId)
  const pending = !conv && openId ? contacts.find((c) => `${c.parentId}__${c.other}` === openId) : null
  if (conv || pending) {
    const contact = conv ? { parentId: conv.parentId, other: conv.other, name: otherName(conv, actor), students: conv.students } : pending
    return <Thread conv={conv} contact={contact} actor={actor} />
  }

  return (
    <Page title="الرسائل" actions={contacts.length > 0 && <Button size="sm" icon="add-square-bold" onClick={() => setPick(true)}>رسالة جديدة</Button>}>
      <Section>
        {!convs.length ? <EmptyState icon="chat-round-dots-bold">لا توجد محادثات بعد</EmptyState> : (
          <Card>
            {convs.map((c) => {
              const unread = c.unread?.[me] || 0
              return (
                <ListItem key={c.id} onClick={() => setParams({ c: c.id })}
                  leading={<Avatar name={otherName(c, actor)} size={42} />}
                  title={<span className={cx(unread && 'font-extrabold')}>{otherName(c, actor)}</span>}
                  subtitle={`${c.lastFrom === me ? 'أنت: ' : ''}${c.lastText || ''}`}
                  trailing={<div className="flex flex-col items-end gap-1"><span className="text-[10px] text-ink-muted">{relTime(c.lastAt)}</span>{unread > 0 && <Badge tone="bad">{unread}</Badge>}</div>} />
              )
            })}
          </Card>
        )}
      </Section>
      <Sheet open={pick} title="رسالة جديدة إلى" onClose={() => setPick(false)}>
        {contacts.map((c) => (
          <ListItem key={c.key} onClick={() => { setPick(false); setParams({ c: `${c.parentId}__${c.other}` }) }}
            leading={<Avatar name={c.name} size={38} />} title={c.name} subtitle={`${c.role} • ${c.students.join('، ')}`} />
        ))}
      </Sheet>
    </Page>
  )
}

function Thread({ conv, contact, actor }) {
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const end = useRef(null)
  const me = myKey(actor)
  const convId = `${contact.parentId}__${contact.other}`
  useEffect(() => subscribeThread(convId, actor, setMsgs), [convId, actor])
  useEffect(() => { if (conv) markConversationRead(conv, actor).catch(() => {}) }, [conv?.unread?.[me]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])
  const [send, busy] = useAction(() => sendMessage(contact, text, actor))

  return (
    <Page title={contact.name}>
      {contact.students?.length > 0 && <div className="px-4 -mt-1 mb-2 text-xs text-ink-muted">بخصوص: {contact.students.join('، ')}</div>}
      <div className="px-4 space-y-2 pb-40">
        {!msgs ? <Skeleton rows={3} /> : !msgs.length ? <EmptyState icon="chat-round-dots-bold">ابدأ المحادثة</EmptyState> : msgs.map((m) => {
          const mine = m.from === me
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-start' : 'justify-end')}>
              <div className={cx('max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap', mine ? 'bg-gold-50 border border-gold-400/30 rounded-br-md' : 'bg-card border rounded-bl-md')}>
                {!mine && <div className="text-[10.5px] font-bold text-info mb-0.5">{m.fromName}</div>}
                {m.text}
                <div className="text-[10px] text-ink-muted mt-1">{relTime(m.at)}</div>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <div className="fixed bottom-[76px] md:bottom-0 inset-x-0 px-4 pb-2 pt-2 bg-paper/95 backdrop-blur border-t max-w-screen-md mx-auto">
        <div className="flex gap-2 items-end">
          <Textarea rows={1} value={text} maxLength={MAX_MESSAGE} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك…" className="flex-1 min-h-[44px] max-h-32" />
          <Button icon="plain-bold" busy={busy} disabled={!text.trim()} onClick={async () => { if (await send()) setText('') }}>إرسال</Button>
        </div>
      </div>
    </Page>
  )
}
