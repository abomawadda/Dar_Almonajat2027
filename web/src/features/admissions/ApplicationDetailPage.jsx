import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Badge, Button, Card, EmptyState, Icon, KV, Section, Skeleton, cx } from '@/components/ui'
import { APP_STATUS, ENROLL_TYPES, FINAL_APP_STATUSES } from '@/config/constants'
import { can } from '@/config/permissions'
import { ageFrom, ageLabel, fmtDate, relTime, waPhone } from '@/lib/format'
import { useAction } from '@/hooks/useAction'
import { startReview } from '@/services/admissions'
import { ApproveSheet, DeferSheet, InterviewSheet, RejectSheet } from './DecisionSheets'

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const { actor } = useAuth()
  const { applications } = useData()
  const [sheet, setSheet] = useState(null)
  const [review, reviewing] = useAction(startReview, { success: 'الطلب الآن قيد المراجعة' })

  if (!applications) return <Page title="تفاصيل الطلب"><Skeleton rows={5} /></Page>
  const a = applications.find((x) => x.id === id)
  if (!a) return <Page title="تفاصيل الطلب"><EmptyState icon="clipboard-list-bold">الطلب غير موجود</EmptyState></Page>

  const st = APP_STATUS[a.status] || APP_STATUS.pending
  const p = a.personalInfo || {}, g = a.guardianInfo || {}, ac = a.academicInfo || {}, pr = a.preferences || {}, h = a.healthInfo
  const final = FINAL_APP_STATUSES.includes(a.status)
  const canDecide = can(actor.role, 'applications.decide')
  const canReview = can(actor.role, 'applications.review')
  const steps = [
    { t: 'تقديم الطلب', d: relTime(a.submittedAt), done: true },
    { t: 'المراجعة', done: final || ['reviewing', 'interview_scheduled'].includes(a.status), cur: a.status === 'pending' },
    { t: 'المقابلة', d: a.interviewData?.scheduledAt ? fmtDate(a.interviewData.scheduledAt, { day: 'numeric', month: 'short' }) : '', done: final, cur: ['reviewing', 'interview_scheduled'].includes(a.status) },
    { t: 'القرار', d: final ? st.label : '', done: final, bad: a.status === 'rejected' }
  ]

  return (
    <Page title="تفاصيل الطلب">
      <div className="flex px-4 mb-5">
        {steps.map((s, i) => (
          <div key={s.t} className="flex-1 text-center relative">
            {i < steps.length - 1 && <div className={cx('absolute top-[6px] right-1/2 w-full h-0.5', steps[i + 1].done || steps[i + 1].cur ? 'bg-ok' : 'bg-black/10')} />}
            <i className={cx('relative block w-3.5 h-3.5 mx-auto rounded-full border-2 mb-1.5', s.bad ? 'bg-bad border-bad' : s.done ? 'bg-ok border-ok' : s.cur ? 'bg-gold-50 border-gold-500 ring-4 ring-gold-400/20' : 'bg-field border-black/20')} />
            <div className="text-[11.5px] font-bold">{s.t}</div>
            <div className="text-[10px] text-ink-muted min-h-[14px]">{s.d}</div>
          </div>
        ))}
      </div>

      <Section>
        <Card className="p-4">
          <div className="flex items-center gap-3.5 mb-4">
            <Avatar name={p.fullName} size={56} />
            <div className="min-w-0">
              <div className="text-[17px] font-extrabold">{p.fullName}</div>
              <div className="flex gap-1.5 mt-1.5 flex-wrap"><Badge tone={st.tone}>{st.label}</Badge><Badge><span dir="ltr">{a.id.slice(-8).toUpperCase()}</span></Badge></div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KV label="تاريخ الميلاد">{p.birthDate}</KV><KV label="العمر">{ageLabel(ageFrom(p.birthDate))}</KV>
            <KV label="الجنس">{p.gender}</KV><KV label="الجنسية">{p.nationality}</KV>
            <KV label="رقم الهوية">{p.nationalId}</KV><KV label="نوع الالتحاق">{ENROLL_TYPES[a.type]}</KV>
          </div>
        </Card>
      </Section>

      <Section title="ولي الأمر">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <KV label="الاسم">{g.name}</KV><KV label="صلة القرابة">{g.relation}</KV>
            <KV label="الجوال"><span dir="ltr">{g.phone}</span></KV><KV label="البريد"><span dir="ltr" className="text-xs">{g.email}</span></KV>
          </div>
          {g.phone && (
            <div className="flex gap-2 mt-4">
              <a href={`tel:${g.phone}`} className="flex-1 h-9 rounded-xl border flex items-center justify-center gap-1.5 text-[13px] font-bold"><Icon name="phone-bold" />اتصال</a>
              <a href={`https://wa.me/${waPhone(g.phone)}`} target="_blank" rel="noreferrer" className="flex-1 h-9 rounded-xl border flex items-center justify-center gap-1.5 text-[13px] font-bold"><Icon name="chat-round-dots-bold" />واتساب</a>
            </div>
          )}
        </Card>
      </Section>

      <Section title="المستوى العلمي">
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <KV label="المستوى">{ac.level}</KV><KV label="الأجزاء المحفوظة">{ac.juzCount != null ? `${ac.juzCount} جزء` : ''}</KV>
            <KV label="آخر ما حفظه">{ac.lastMemorized}</KV><KV label="المرحلة الدراسية">{ac.schoolStage}</KV>
          </div>
          {[...(pr.periods || []), ...(pr.days || [])].length > 0 && <div className="flex flex-wrap gap-1.5 mt-4">{[...(pr.periods || []), ...(pr.days || [])].map((x) => <Badge key={x} tone="gold">{x}</Badge>)}</div>}
          {pr.notes && <div className="mt-3 p-3 bg-field rounded-xl text-xs text-ink-soft leading-6">{pr.notes}</div>}
        </Card>
      </Section>

      {h && (
        <Section title="البيانات الصحية">
          <Card className="p-4 grid grid-cols-2 gap-3">
            <KV label="أمراض مزمنة">{h.chronic}</KV><KV label="أدوية دائمة">{h.meds}</KV>
            <KV label="حساسية"><span className={h.allergy && h.allergy !== 'لا يوجد' ? 'text-bad' : ''}>{h.allergy}</span></KV><KV label="إعاقة">{h.disability}</KV>
          </Card>
        </Section>
      )}

      {!final && canReview && (
        <Section title="سير الطلب">
          <div className="flex gap-2">
            {a.status === 'pending' && <Button variant="secondary" size="sm" className="flex-1" icon="eye-bold" busy={reviewing} onClick={() => review(a.id, actor)}>بدء المراجعة</Button>}
            <Button variant="secondary" size="sm" className="flex-1" icon="calendar-add-bold" onClick={() => setSheet('interview')}>{a.status === 'interview_scheduled' ? 'تعديل المقابلة' : 'تحديد مقابلة'}</Button>
          </div>
        </Section>
      )}

      {(final || canDecide) && (
        <Section title="قرار المدير">
          {final ? <DecisionResult a={a} canReopen={canDecide} onReopen={() => review(a.id, actor)} /> : (
            <>
              <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                <Button icon="check-circle-bold" onClick={() => setSheet('approve')}>موافقة</Button>
                <Button variant="info" icon="clock-circle-bold" onClick={() => setSheet('defer')}>تأجيل</Button>
                <Button variant="danger" icon="close-circle-bold" onClick={() => setSheet('reject')}>رفض</Button>
              </div>
              <p className="flex gap-1.5 text-[11.5px] text-ink-muted mt-3 leading-6"><Icon name="info-circle-bold" className="mt-1" />عند الموافقة يُوزَّع الطالب على محفظ ويُربط بحساب ولي الأمر ويُفعَّل في الحضور والمتابعة والماليات تلقائيًا.</p>
            </>
          )}
        </Section>
      )}

      <ApproveSheet open={sheet === 'approve'} app={a} onClose={() => setSheet(null)} />
      <DeferSheet open={sheet === 'defer'} app={a} onClose={() => setSheet(null)} />
      <RejectSheet open={sheet === 'reject'} app={a} onClose={() => setSheet(null)} />
      <InterviewSheet open={sheet === 'interview'} app={a} onClose={() => setSheet(null)} />
    </Page>
  )
}

function DecisionResult({ a, canReopen, onReopen }) {
  const d = a.decisionData || {}
  const map = {
    approved:   ['check-circle-bold', 'bg-ok-soft text-ok border-ok/20', d.note || 'تم القبول'],
    waitlisted: ['clock-circle-bold', 'bg-info-soft text-info border-info/20', `${d.reason || ''}${d.reviewAt ? ' • يُعاد النظر في ' + fmtDate(d.reviewAt) : ''}`],
    rejected:   ['close-circle-bold', 'bg-bad-soft text-bad border-bad/20', d.decisionReason || '']
  }
  const [icon, cls, note] = map[a.status]
  return (
    <div className={cx('flex items-center gap-3 p-4 rounded-2xl border', cls)}>
      <Icon name={icon} className="text-3xl" />
      <div className="flex-1">
        <div className="text-sm font-extrabold">{APP_STATUS[a.status].label}{d.decisionAt && <span className="font-medium opacity-70 text-xs"> • {relTime(d.decisionAt)}</span>}</div>
        <div className="text-xs text-ink-soft mt-1 leading-6">{note}</div>
      </div>
      {a.status === 'approved' && d.studentId
        ? <Link to={`/students/${d.studentId}`} className="text-xs font-bold border border-current rounded-lg px-2.5 py-1.5">ملف الطالب</Link>
        : canReopen && <button onClick={onReopen} className="text-xs font-bold border border-current rounded-lg px-2.5 py-1.5">إعادة فتح</button>}
    </div>
  )
}
