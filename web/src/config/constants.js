// Single source of truth for collection names, statuses and their Arabic labels.
// Matches dar_react_firebase.md so the database stays compatible with v7.

export const COL = {
  USERS: 'users',
  APPLICATIONS: 'applications',
  STUDENTS: 'students',
  PARENTS: 'parents',
  TEACHERS: 'teachers',
  GROUPS: 'groups',
  ATTENDANCE: 'attendance',
  STAFF_ATTENDANCE: 'staffAttendance',
  HIFZ_RECORDS: 'hifzRecords',
  HIFZ_PROGRESS: 'hifzProgress',
  BEHAVIOR: 'behavior',
  EXAMS: 'exams',
  EXAM_RESULTS: 'examResults',
  CERT_VERIFY: 'certVerify',
  COUNTERS: 'counters',
  CERTIFICATES: 'certificates',
  COMPETITIONS: 'competitions',
  ANNOUNCEMENTS: 'announcements',
  CIRCULARS: 'circulars',
  NOTIFICATIONS: 'notifications',
  EXCUSES: 'excuses',
  CONVERSATIONS: 'conversations',
  CHAT_MESSAGES: 'chatMessages',
  REWARDS: 'rewards',
  REDEMPTIONS: 'redemptions',
  POINTS_LEDGER: 'pointsLedger',
  POINTS_BALANCE: 'pointsBalance',
  PAYMENTS: 'payments',
  FEE_PLANS: 'feePlans',
  INVOICES: 'invoices',
  DONATIONS: 'donations',
  PAYROLL: 'payroll',
  CASH_ENTRIES: 'cashEntries',
  CASH_CLOSINGS: 'cashClosings',
  EXPENSES: 'expenses',
  SETTINGS: 'settings'
}

export const APP_STATUS = {
  pending:             { label: 'جديد',         tone: 'warn' },
  reviewing:           { label: 'قيد المراجعة', tone: 'info' },
  interview_scheduled: { label: 'مقابلة',       tone: 'gold' },
  waitlisted:          { label: 'مؤجل',         tone: 'info' },
  approved:            { label: 'مقبول',        tone: 'ok' },
  rejected:            { label: 'مرفوض',        tone: 'bad' }
}
export const FINAL_APP_STATUSES = ['approved', 'rejected', 'waitlisted']

export const ENROLL_TYPES = { quran: 'تحفيظ قرآن', nursery: 'حضانة', both: 'تحفيظ + حضانة' }

export const ATTENDANCE = {
  present: { label: 'حاضر',  tone: 'ok' },
  absent:  { label: 'غائب',  tone: 'bad' },
  late:    { label: 'متأخر', tone: 'warn' },
  excused: { label: 'معذور', tone: 'info' },
  early_leave: { label: 'انصراف', tone: 'warn' }
}
export const EXCUSE_STATUS = {
  pending:  { label: 'بانتظار الموافقة', tone: 'warn' },
  approved: { label: 'مقبول', tone: 'ok' },
  rejected: { label: 'مرفوض', tone: 'bad' }
}
export const REDEMPTION_STATUS = {
  pending:   { label: 'بانتظار الموافقة', tone: 'warn' },
  approved:  { label: 'تمت الموافقة', tone: 'info' },
  delivered: { label: 'تم التسليم', tone: 'ok' },
  rejected:  { label: 'مرفوض', tone: 'bad' }
}

export const MASTERY = {
  excellent: 'ممتاز',
  good: 'جيد',
  average: 'متوسط',
  weak: 'ضعيف'
}

export const BEHAVIOR_TYPES = {
  positive: { label: 'إيجابي', tone: 'ok' },
  warning:  { label: 'تنبيه',  tone: 'warn' },
  negative: { label: 'سلبي',   tone: 'bad' }
}
export const BEHAVIOR_CATEGORIES = ['حفظ وتسميع', 'أدب وسلوك', 'حضور وانضباط', 'تعاون وتميّز']

export const AUDIENCES = {
  all: 'الجميع',
  students_parents: 'الطلبة وأولياء الأمور',
  teachers: 'المحفظون',
  parents: 'أولياء الأمور',
  students: 'الطلبة'
}

export const ANNOUNCEMENT_TYPES = { general: 'عام', academic: 'أكاديمي', admin: 'إداري', event: 'فعاليات' }

export const CERTIFICATE_TYPES = ['حفظ جزء كامل', 'حفظ ٥ أجزاء', 'حفظ ١٠ أجزاء', 'حفظ ١٥ جزءًا', 'ختمة كاملة', 'تميّز في التجويد', 'طالب الشهر']

export const DEFER_REASONS = ['اكتمال الطاقة الاستيعابية للحلقات', 'استكمال المستندات المطلوبة', 'إعادة المقابلة لاحقًا', 'سبب آخر']
export const REJECT_REASONS = ['عدم استيفاء شروط السن', 'عدم اجتياز المقابلة', 'بيانات غير مكتملة', 'سبب آخر']
export const EXCUSE_REASONS = ['ظرف صحي / مرض', 'سفر', 'ظرف عائلي', 'امتحان مدرسي', 'سبب آخر']
