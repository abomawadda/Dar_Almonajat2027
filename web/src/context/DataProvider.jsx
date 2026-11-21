// Live data shared across screens, subscribed once per session and scoped to the actor.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthProvider'
import { isStaffRole } from '@/config/roles'
import { subscribeStudents, subscribeGroups, subscribeTeachers } from '@/services/people'
import { subscribeNotifications, subscribeAnnouncements, subscribeCirculars } from '@/services/comms'
import { subscribeApplications } from '@/services/admissions'
import { subscribeExams } from '@/services/academic'

const DataCtx = createContext(null)
const EMPTY = { students: null, groups: null, teachers: null, notifications: [], announcements: null, circulars: null, applications: null, exams: null }

export function DataProvider({ children }) {
  const { actor } = useAuth()
  const [data, setData] = useState(EMPTY)

  useEffect(() => {
    setData(EMPTY)
    if (!actor) return
    const put = (k) => (v) => setData((d) => ({ ...d, [k]: v }))
    const subs = [
      subscribeStudents(actor, put('students')),
      subscribeGroups(put('groups')),
      subscribeNotifications(actor, put('notifications')),
      subscribeAnnouncements(actor, put('announcements')),
      subscribeCirculars(actor, put('circulars')),
      subscribeExams(actor, put('exams'))
    ]
    if (isStaffRole(actor.role) || actor.role === 'teacher') subs.push(subscribeTeachers(put('teachers')))
    if (isStaffRole(actor.role)) subs.push(subscribeApplications(put('applications')))
    return () => subs.forEach((u) => u && u())
  }, [actor])

  // Students/parents only see exams for their own groups.
  const value = useMemo(() => {
    let exams = data.exams
    if (exams && data.students && actor && (actor.role === 'student' || actor.role === 'parent')) {
      const gids = data.students.map((s) => s.academicInfo?.groupId)
      exams = exams.filter((e) => gids.includes(e.groupId))
    }
    const unread = (data.notifications || []).filter((n) => !n.isRead).length
    const pendingAck = (data.circulars || []).filter((c) => c.requiresAck && !(c.acks || []).includes(actor?.uid)).length
    const pendingApps = (data.applications || []).filter((a) => a.status === 'pending').length
    return { ...data, exams, badges: { notifications: unread, circulars: isStaffRole(actor?.role) ? 0 : pendingAck, applications: pendingApps } }
  }, [data, actor])

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

export const useData = () => useContext(DataCtx)
