// Roles, their home screen, and which content audiences each one receives.

export const ROLES = {
  admin:      { label: 'مدير النظام', home: '/dashboard' },
  supervisor: { label: 'مشرف',        home: '/dashboard' },
  accountant: { label: 'محاسب',       home: '/dashboard' },
  secretary:  { label: 'سكرتارية',    home: '/dashboard' },
  examiner:   { label: 'لجنة اختبار', home: '/dashboard' },
  teacher:    { label: 'محفظ',        home: '/dashboard' },
  student:    { label: 'طالب',        home: '/dashboard' },
  parent:     { label: 'ولي أمر',     home: '/dashboard' }
}

export const isStaffRole = (role) => role === 'admin' || role === 'supervisor'

/** Content audiences a role may read (announcements, circulars). Mirrors firestore.rules → audiences(). */
export function audiencesFor(role) {
  if (isStaffRole(role)) return null // all
  return {
    teacher: ['all', 'teachers'],
    accountant: ['all'], secretary: ['all'], examiner: ['all', 'teachers'],
    student: ['all', 'students', 'students_parents'],
    parent:  ['all', 'parents', 'students_parents']
  }[role] || ['all']
}

/** Demo identities — mirror the demo seed so scoping behaves exactly like production. */
export const DEMO_USERS = {
  admin:      { uid: 'demo-admin',      displayName: 'أ. محمود العراقي',     role: 'admin' },
  supervisor: { uid: 'demo-supervisor', displayName: 'الأستاذ خالد الشافعي',  role: 'supervisor' },
  accountant: { uid: 'demo-accountant', displayName: 'أ. هشام عبدالحميد',    role: 'accountant' },
  teacher:    { uid: 'T1', displayName: 'الشيخ سعد المنشاوي',  role: 'teacher', teacherId: 'T1' },
  student:    { uid: 'S1', displayName: 'محمد طارق الشناوي',   role: 'student', studentId: 'S1' },
  parent:     { uid: 'P1', displayName: 'طارق الشناوي',        role: 'parent',  parentId: 'P1' }
}
