import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { DataProvider } from '@/context/DataProvider'
import AppShell from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui'
import { serviceByPath } from '@/config/services'
import ComingSoon from '@/features/common/ComingSoon'
import Forbidden from '@/features/common/Forbidden'

// Each feature is its own chunk, loaded on first visit.
const Login = lazy(() => import('@/features/auth/LoginPage'))
const PublicApply = lazy(() => import('@/features/admissions/PublicApplyPage'))
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const Services = lazy(() => import('@/features/hub/ServicesPage'))
const Applications = lazy(() => import('@/features/admissions/ApplicationsPage'))
const ApplicationDetail = lazy(() => import('@/features/admissions/ApplicationDetailPage'))
const Students = lazy(() => import('@/features/students/StudentsPage'))
const StudentProfile = lazy(() => import('@/features/students/StudentProfilePage'))
const Attendance = lazy(() => import('@/features/attendance/AttendancePage'))
const StaffAttendance = lazy(() => import('@/features/attendance/StaffAttendancePage'))
const RecordHifz = lazy(() => import('@/features/hifz/RecordHifzPage'))
const HifzMap = lazy(() => import('@/features/hifz/HifzMapPage'))
const Behavior = lazy(() => import('@/features/behavior/BehaviorPage'))
const Exams = lazy(() => import('@/features/exams/ExamsPage'))
const NewExam = lazy(() => import('@/features/exams/NewExamPage'))
const ExamDetail = lazy(() => import('@/features/exams/ExamDetailPage'))
const VerifyCertificate = lazy(() => import('@/features/recognition/VerifyCertificatePage'))
const Announcements = lazy(() => import('@/features/comms/AnnouncementsPage'))
const Circulars = lazy(() => import('@/features/comms/CircularsPage'))
const Notifications = lazy(() => import('@/features/comms/NotificationsPage'))
const Messages = lazy(() => import('@/features/comms/MessagesPage'))
const Certificates = lazy(() => import('@/features/recognition/CertificatesPage'))
const Competitions = lazy(() => import('@/features/recognition/CompetitionsPage'))
const HonorBoard = lazy(() => import('@/features/recognition/HonorBoardPage'))
const Rewards = lazy(() => import('@/features/recognition/RewardsPage'))
const Settings = lazy(() => import('@/features/settings/SettingsPage'))

const Loading = () => <div className="pt-20"><Skeleton rows={4} /></div>

/** Route guard driven by the services registry (roles + readiness). */
function Guard({ children }) {
  const { actor } = useAuth()
  const { pathname } = useLocation()
  const svc = serviceByPath(pathname)
  if (svc && !svc.roles.includes(actor.role)) return <Forbidden />
  if (svc && svc.ready === false) return <ComingSoon service={svc} />
  return children
}

function Private() {
  const { actor, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <Loading />
  if (!actor) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <DataProvider><AppShell /></DataProvider>
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/apply" element={<PublicApply />} />
        <Route path="/verify" element={<VerifyCertificate />} />
        <Route path="/verify/:code" element={<VerifyCertificate />} />
        <Route element={<Private />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/services" element={<Services />} />
          <Route path="/applications" element={<Guard><Applications /></Guard>} />
          <Route path="/applications/:id" element={<Guard><ApplicationDetail /></Guard>} />
          <Route path="/students" element={<Guard><Students /></Guard>} />
          <Route path="/students/:id" element={<StudentProfile />} />
          <Route path="/attendance" element={<Guard><Attendance /></Guard>} />
          <Route path="/staff-attendance" element={<Guard><StaffAttendance /></Guard>} />
          <Route path="/hifz/record" element={<Guard><RecordHifz /></Guard>} />
          <Route path="/hifz-map" element={<Guard><HifzMap /></Guard>} />
          <Route path="/behavior" element={<Guard><Behavior /></Guard>} />
          <Route path="/exams" element={<Guard><Exams /></Guard>} />
          <Route path="/exams/new" element={<Guard><NewExam /></Guard>} />
          <Route path="/exams/:id" element={<Guard><ExamDetail /></Guard>} />
          <Route path="/announcements" element={<Guard><Announcements /></Guard>} />
          <Route path="/circulars" element={<Guard><Circulars /></Guard>} />
          <Route path="/notifications" element={<Guard><Notifications /></Guard>} />
          <Route path="/messages" element={<Guard><Messages /></Guard>} />
          <Route path="/certificates" element={<Guard><Certificates /></Guard>} />
          <Route path="/honor-board" element={<Guard><HonorBoard /></Guard>} />
          <Route path="/rewards" element={<Guard><Rewards /></Guard>} />
          <Route path="/competitions" element={<Guard><Competitions /></Guard>} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Guard><ComingSoon /></Guard>} />
        </Route>
      </Routes>
    </Suspense>
  )
}
