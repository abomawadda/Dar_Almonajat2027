import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataProvider'
import { Page } from '@/components/layout/AppShell'
import { Async, Avatar, Badge, Button, Card, Chips, ListItem, SearchInput } from '@/components/ui'
import { APP_STATUS, ENROLL_TYPES } from '@/config/constants'
import { ageFrom, ageLabel, relTime } from '@/lib/format'

export default function ApplicationsPage() {
  const { applications } = useData()
  const nav = useNavigate()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')

  const options = useMemo(() => {
    const count = (k) => (applications || []).filter((a) => k === 'all' || a.status === k).length
    return [['all', `الكل (${count('all')})`], ...Object.entries(APP_STATUS).map(([k, v]) => [k, `${v.label} (${count(k)})`])]
  }, [applications])

  const rows = (applications || []).filter((a) =>
    (filter === 'all' || a.status === filter) &&
    (!q || `${a.personalInfo?.fullName} ${a.guardianInfo?.phone}`.includes(q.trim())))

  return (
    <Page title="طلبات الالتحاق" actions={<Button size="sm" variant="outline" icon="user-plus-rounded-bold" onClick={() => nav('/apply')}>طلب</Button>}>
      <Chips value={filter} onChange={setFilter} options={options} />
      <SearchInput value={q} onChange={setQ} placeholder="بحث بالاسم أو رقم الجوال…" />
      <Async data={applications && rows} empty={q ? 'لا توجد نتائج' : 'لا توجد طلبات في هذا التصنيف'} emptyIcon="clipboard-list-bold">
        <Card className="mx-4 px-4">
          {rows.map((a) => {
            const st = APP_STATUS[a.status] || APP_STATUS.pending
            return (
              <ListItem key={a.id} onClick={() => nav(`/applications/${a.id}`)}
                leading={<Avatar name={a.personalInfo?.fullName} />}
                title={a.personalInfo?.fullName}
                subtitle={[ENROLL_TYPES[a.type], ageLabel(ageFrom(a.personalInfo?.birthDate)), relTime(a.submittedAt)].filter(Boolean).join(' • ')}
                trailing={<Badge tone={st.tone}>{st.label}</Badge>} />
            )
          })}
        </Card>
      </Async>
    </Page>
  )
}
