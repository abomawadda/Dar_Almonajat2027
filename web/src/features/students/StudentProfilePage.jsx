// Student file: academic data plus live hifz, attendance and behavior history.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useData } from '@/context/DataProvider'
import { useAuth } from '@/context/AuthProvider'
import { recordScope } from '@/services/scope'
import { Page } from '@/components/layout/AppShell'
import { Avatar, Badge, Card, Chips, EmptyState, Icon, KV, ListItem, Section, Skeleton } from '@/components/ui'
import { db } from '@/lib/backend'
import { COL, ATTENDANCE, BEHAVIOR_TYPES, MASTERY } from '@/config/constants'
import { TOTAL_AYAHS } from '@/config/quran'
import { ageFrom, ageLabel, fmtDate, relTime } from '@/lib/format'

export default function StudentProfilePage() {
  const { id } = useParams()
  const { students } = useData()
  const { actor } = useAuth()
  const [tab, setTab] = useState('hifz')
  const [hist, setHist] = useState(null)
  const s = students?.find((x) => x.id === id)

  useEffect(() => {
    if (!s) return
    // parent/student queries must include the field the security rules check
    const base = recordScope(actor, { teacherField: null }).where || []
    const q = { where: [...base.filter((w) => w[0] !== 'studentId'), ['studentId', '==', id]] }
    Promise.all([db().list(COL.HIFZ_RECORDS, q), db().list(COL.ATTENDANCE, q), db().list(COL.BEHAVIOR, q)])
      .then(([hifz, att, beh]) => setHist({
        hifz: hifz.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1)),
        att: att.sort((a, b) => (a.date < b.date ? 1 : -1)),
        beh: beh.sort((a, b) => ((b.createdAt || '') > (a.createdAt || '') ? 1 : -1))
      }))
      .catch(() => setHist({ hifz: [], att: [], beh: [] }))
  }, [id, !!s]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!students) return <Page title="ملف الطالب"><Skeleton rows={5} /></Page>
  if (!s) return <Page title="ملف الطالب"><EmptyState icon="users-group-rounded-bold">الطالب غير موجود أو خارج صلاحيتك</EmptyState></Page>
  const ac = s.academicInfo || {}
  const pct = Math.min(100, Math.round(((ac.totalMemorized || 0) / TOTAL_AYAHS) * 100))
  const present = hist ? hist.att.filter((a) => a.status === 'present' || a.status === 'late').length : 0
  const points = hist ? hist.beh.reduce((n, b) => n + (Number(b.points) || 0), 0) : 0

  return (
    <Page title="ملف الطالب">
      <Section>
        <Card className="p-4">
          <div className="flex items-center gap-3.5 mb-4">
            <Avatar name={s.personalInfo.fullName} size={60} />
            <div><div className="text-lg font-extrabold">{s.personalInfo.fullName}</div><div className="text-xs text-gold-500 font-bold mt-0.5">{ac.groupName} • {ac.teacherName}</div></div>
          </div>
          <div className="grid grid-cols-3 text-center bg-field rounded-2xl py-3 mb-4">
            <div><div className="text-xl font-extrabold text-gold-600">{ac.currentJuz || 0}</div><div className="text-[11px] text-ink-muted">جزء</div></div>
            <div><div className="text-xl font-extrabold text-ok">{hist?.att.length ? Math.round((present / hist.att.length) * 100) + '%' : '—'}</div><div className="text-[11px] text-ink-muted">حضور</div></div>
            <div><div className={`text-xl font-extrabold ${points >= 0 ? 'text-info' : 'text-bad'}`}>{hist ? points : '—'}</div><div className="text-[11px] text-ink-muted">نقاط السلوك</div></div>
          </div>
          <div className="text-xs text-ink-muted mb-1.5 flex justify-between"><span>التقدم في حفظ القرآن</span><b className="text-gold-600">{pct}%</b></div>
          <div className="h-2 rounded-full bg-field overflow-hidden"><div className="h-full bg-gold-grad rounded-full" style={{ width: `${pct}%` }} /></div>
          <Link to={`/hifz-map?student=${s.id}`} className="inline-block mt-2 text-xs font-bold text-info">خريطة الحفظ والخطة ←</Link>
          <Link to={`/student-report/${s.id}`} className="inline-block mt-2 mr-4 text-xs font-bold text-info">التقرير الشهري ←</Link>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <KV label="العمر">{ageLabel(ageFrom(s.personalInfo.birthDate))}</KV>
            <KV label="تاريخ الالتحاق">{fmtDate(s.joinedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</KV>
            <KV label="آيات محفوظة">{(ac.totalMemorized || 0).toLocaleString('ar-EG')}</KV>
            <KV label="آخر تسميع">{ac.lastSession ? fmtDate(ac.lastSession, { day: 'numeric', month: 'short' }) : ''}</KV>
          </div>
        </Card>
      </Section>
      <Chips value={tab} onChange={setTab} options={[['hifz', 'التسميع'], ['att', 'الحضور'], ['beh', 'السلوك']]} />
      {!hist ? <Skeleton /> : (
        <Section>
          {tab === 'hifz' && (
            <div className="space-y-3">
              {ac.lastHomework && (
                <div className="p-3.5 rounded-2xl bg-gold-50 border border-gold-400/35">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-gold-600 mb-1">
                    <Icon name="book-bookmark-bold" />
                    <span>الواجب الحالي</span>
                  </div>
                  <div className="text-[13px] font-bold text-ink leading-6">{ac.lastHomework}</div>
                </div>
              )}
              {hist.hifz.length ? (
                <Card className="px-4">
                  {hist.hifz.map((r) => {
                    const nm = r.newMemorization
                    const rv = r.revision
                    const title = nm && rv
                      ? `حفظ ${nm.surahName} ${nm.fromAyah}–${nm.toAyah} • مراجعة ${rv.surahName} ${rv.fromAyah}–${rv.toAyah}`
                      : nm
                        ? `حفظ ${nm.surahName} ${nm.fromAyah}–${nm.toAyah}`
                        : `مراجعة ${rv?.surahName || ''} ${rv?.fromAyah || ''}–${rv?.toAyah || ''}`
                    const count = (nm?.ayahCount || 0) + (rv?.ayahCount || 0)
                    return (
                      <div key={r.id} className="py-3 border-b last:border-b-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold">{title}</div>
                            <div className="text-xs text-ink-muted mt-0.5">
                              {count} آية • {fmtDate(r.date, { day: 'numeric', month: 'short' })}
                              {r.homework ? ` • الواجب: ${r.homework}` : ''}
                            </div>
                          </div>
                          <Badge tone={r.masteryLevel === 'excellent' ? 'ok' : r.masteryLevel === 'weak' ? 'bad' : 'gold'}>
                            {MASTERY[r.masteryLevel]}
                          </Badge>
                        </div>
                        {(r.hifzMistakes > 0 || r.tajweedMistakes > 0 || r.teacherNotes) && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {r.hifzMistakes > 0 && <Badge tone="warn">أخطاء حفظ: {r.hifzMistakes}</Badge>}
                            {r.tajweedMistakes > 0 && <Badge tone="bad">أخطاء تجويد: {r.tajweedMistakes}</Badge>}
                            {r.teacherNotes && <span className="text-[11px] text-ink-soft">{r.teacherNotes}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              ) : <EmptyState icon="book-bookmark-bold">لا يوجد سجل تسميع</EmptyState>}
            </div>
          )}
          {tab === 'att' && (hist.att.length ? <Card className="px-4">{hist.att.map((r) => <ListItem key={r.id} title={fmtDate(r.date)} subtitle={r.groupName} trailing={<Badge tone={ATTENDANCE[r.status]?.tone}>{ATTENDANCE[r.status]?.label}</Badge>} />)}</Card> : <EmptyState icon="checklist-minimalistic-bold">لا يوجد سجل حضور</EmptyState>)}
          {tab === 'beh' && (hist.beh.length ? <Card className="px-4">{hist.beh.map((r) => <ListItem key={r.id} title={r.description} subtitle={`${r.category} • ${relTime(r.createdAt)}`} trailing={<Badge tone={BEHAVIOR_TYPES[r.type]?.tone}>{r.points > 0 ? '+' : ''}{r.points}</Badge>} />)}</Card> : <EmptyState icon="star-bold">لا توجد سجلات سلوك</EmptyState>)}
        </Section>
      )}
    </Page>
  )
}
