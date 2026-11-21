import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Avatar, Card, Chips, ListItem, SearchInput } from '@/components/ui'

export default function StudentsPage() {
  const { students, groups } = useData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')
  const rows = (students || []).filter((s) =>
    (group === 'all' || s.academicInfo?.groupId === group) &&
    (!q || `${s.personalInfo.fullName} ${s.academicInfo?.groupName} ${s.academicInfo?.teacherName}`.includes(q.trim())))
  const usedGroups = (groups || []).filter((g) => (students || []).some((s) => s.academicInfo?.groupId === g.id))

  return (
    <Page title={`الطلبة${students ? ` (${students.length})` : ''}`}>
      {usedGroups.length > 1 && <Chips value={group} onChange={setGroup} options={[['all', 'كل الحلقات'], ...usedGroups.map((g) => [g.id, g.name])]} />}
      <SearchInput value={q} onChange={setQ} placeholder="بحث بالاسم أو الحلقة أو المحفظ…" />
      <Async data={students && rows} empty={q ? 'لا توجد نتائج' : 'لا يوجد طلبة بعد — يُضاف الطالب تلقائيًا عند قبول طلبه'} emptyIcon="users-group-rounded-bold">
        <Card className="mx-4 px-4">
          {rows.map((s) => (
            <ListItem key={s.id} onClick={() => nav(`/students/${s.id}`)} leading={<Avatar name={s.personalInfo.fullName} />}
              title={s.personalInfo.fullName} subtitle={`${s.academicInfo?.groupName || ''} • ${s.academicInfo?.teacherName || ''}`}
              trailing={<div className="text-center"><div className="text-sm font-extrabold text-gold-600">{s.academicInfo?.currentJuz || 0} جزء</div><div className="text-[10px] text-ink-muted">محفوظ</div></div>} />
          ))}
        </Card>
      </Async>
    </Page>
  )
}
