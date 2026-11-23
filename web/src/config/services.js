// Module registry. Adding a module = one entry here + its feature folder + one route.
// `roles` drives the services hub, sidebar and route guard; `ready:false` marks modules
// still being ported (they open a "coming in the next phase" page).
const ALL = ['admin', 'supervisor', 'teacher', 'student', 'parent']
const STAFF = ['admin', 'supervisor']

export const SERVICE_GROUPS = [
  { id: 'admission',  label: 'القبول والتسجيل',          icon: 'user-plus-rounded-bold' },
  { id: 'learning',   label: 'التعليم والمتابعة',         icon: 'book-2-bold' },
  { id: 'discipline', label: 'الحضور والانضباط',          icon: 'shield-check-bold' },
  { id: 'motivation', label: 'التحفيز والتكريم',          icon: 'cup-first-bold' },
  { id: 'comms',      label: 'التواصل',                   icon: 'chat-square-like-bold' },
  { id: 'admin',      label: 'الماليات والشئون الإدارية', icon: 'buildings-2-bold' }
]

export const SERVICES = [
  { id: 'applications', path: '/applications',     label: 'طلبات الالتحاق', icon: 'clipboard-list-bold',          tone: 'warn',   group: 'admission',  roles: STAFF, badge: 'applications' },
  { id: 'students',     path: '/students',         label: 'الطلبة',          icon: 'users-group-rounded-bold',     tone: 'info',   group: 'admission',  roles: ['admin', 'supervisor', 'teacher', 'accountant'] },
  { id: 'record',       path: '/hifz/record',      label: 'تسجيل تسميع',     icon: 'microphone-3-bold',            tone: 'gold',   group: 'learning',   roles: ['admin', 'supervisor', 'teacher'] },
  { id: 'exams',        path: '/exams',            label: 'الامتحانات',      icon: 'document-add-bold',            tone: 'info',   group: 'learning',   roles: ALL },
  { id: 'hifzmap',      path: '/hifz-map',         label: 'خريطة الحفظ',     icon: 'map-bold',                     tone: 'gold',   group: 'learning',   roles: ALL },
  { id: 'schedule',     path: '/schedule',         label: 'الجدول',          icon: 'calendar-bold',                tone: 'info',   group: 'learning',   roles: ALL, ready: false },
  { id: 'attendance',   path: '/attendance',       label: 'حضور الطلبة',     icon: 'checklist-minimalistic-bold',  tone: 'ok',     group: 'discipline', roles: ALL },
  { id: 'staff',        path: '/staff-attendance', label: 'حضور العاملين',   icon: 'user-check-rounded-bold',      tone: 'ok',     group: 'discipline', roles: ['admin', 'supervisor', 'teacher'] },
  { id: 'behavior',     path: '/behavior',         label: 'السلوك',          icon: 'star-bold',                    tone: 'ok',     group: 'discipline', roles: ALL },
  { id: 'honor',        path: '/honor-board',      label: 'لوحة الشرف والنقاط', icon: 'medal-ribbons-star-bold',  tone: 'gold',   group: 'motivation', roles: ALL },
  { id: 'rewards',      path: '/rewards',          label: 'متجر الجوائز',    icon: 'gift-bold',                    tone: 'gold',   group: 'motivation', roles: ['admin', 'supervisor', 'student', 'parent'] },
  { id: 'certificates', path: '/certificates',     label: 'الشهادات',        icon: 'diploma-verified-bold',        tone: 'gold',   group: 'motivation', roles: ALL },
  { id: 'competitions', path: '/competitions',     label: 'المسابقات',       icon: 'cup-star-bold',                tone: 'warn',   group: 'motivation', roles: ALL },
  { id: 'announcements',path: '/announcements',    label: 'الإعلانات',       icon: 'bell-bold',                    tone: 'info',   group: 'comms',      roles: ALL },
  { id: 'circulars',    path: '/circulars',        label: 'التعميمات',       icon: 'document-text-bold',           tone: 'violet', group: 'comms',      roles: ALL, badge: 'circulars' },
  { id: 'notifications',path: '/notifications',    label: 'الإشعارات',       icon: 'bell-bing-bold',               tone: 'bad',    group: 'comms',      roles: ALL, badge: 'notifications' },
  { id: 'messages',     path: '/messages',         label: 'الرسائل',         icon: 'chat-round-dots-bold',         tone: 'info',   group: 'comms',      roles: ['admin', 'supervisor', 'teacher', 'parent'], badge: 'messages' },
  { id: 'finance',      path: '/finance',          label: 'الماليات والخزينة', icon: 'wallet-money-bold',          tone: 'violet', group: 'admin',      roles: ['admin', 'accountant'] },
  { id: 'payments',     path: '/payments',         label: 'الرسوم والمدفوعات', icon: 'card-bold',                  tone: 'violet', group: 'admin',      roles: ['parent'] },
  { id: 'reports',      path: '/reports',          label: 'التقارير',        icon: 'chart-2-bold',                 tone: 'bad',    group: 'admin',      roles: ['admin', 'supervisor', 'teacher', 'accountant'] },
  { id: 'settings',     path: '/settings',         label: 'الإعدادات',       icon: 'settings-bold',                tone: 'muted',  group: 'admin',      roles: ALL }
]

export const servicesFor = (role) => SERVICES.filter((s) => s.roles.includes(role))
export const serviceByPath = (path) => SERVICES.find((s) => path === s.path || path.startsWith(s.path + '/'))

/** Bottom navigation (mobile): 4 tabs + the centre quick-action button. */
export const BOTTOM_NAV = {
  admin:      [['/dashboard', 'الرئيسية', 'home-smile-bold-duotone'], ['/students', 'الطلبة', 'users-group-rounded-bold'], ['/applications', 'الطلبات', 'clipboard-list-bold'], ['/services', 'الخدمات', 'widget-5-bold']],
  supervisor: [['/dashboard', 'الرئيسية', 'home-smile-bold-duotone'], ['/students', 'الطلبة', 'users-group-rounded-bold'], ['/attendance', 'الحضور', 'checklist-minimalistic-bold'], ['/services', 'الخدمات', 'widget-5-bold']],
  teacher:    [['/dashboard', 'الرئيسية', 'home-smile-bold-duotone'], ['/students', 'طلابي', 'users-group-rounded-bold'], ['/attendance', 'الحضور', 'checklist-minimalistic-bold'], ['/services', 'الخدمات', 'widget-5-bold']],
  student:    [['/dashboard', 'الرئيسية', 'home-smile-bold-duotone'], ['/exams', 'امتحاناتي', 'document-add-bold'], ['/attendance', 'حضوري', 'checklist-minimalistic-bold'], ['/services', 'الخدمات', 'widget-5-bold']],
  accountant: [['/dashboard', 'الرئيسية', 'home-smile-bold-duotone'], ['/finance', 'الماليات', 'wallet-money-bold'], ['/students', 'الطلبة', 'users-group-rounded-bold'], ['/services', 'الخدمات', 'widget-5-bold']],
  parent:     [['/dashboard', 'الرئيسية', 'home-smile-bold-duotone'], ['/behavior', 'السلوك', 'star-bold'], ['/notifications', 'الإشعارات', 'bell-bing-bold'], ['/services', 'الخدمات', 'widget-5-bold']]
}

/** Centre-button quick actions. `to` navigates; `sheet` opens a named sheet on the target page. */
export const QUICK_ACTIONS = {
  staff: [
    { label: 'تسجيل تسميع', icon: 'microphone-3-bold', tone: 'gold', to: '/hifz/record' },
    { label: 'حضور الطلبة', icon: 'checklist-minimalistic-bold', tone: 'ok', to: '/attendance' },
    { label: 'تسجيل سلوك', icon: 'star-bold', tone: 'ok', to: '/behavior?new=1' },
    { label: 'اختبار جديد', icon: 'document-add-bold', tone: 'info', to: '/exams/new' },
    { label: 'إعلان جديد', icon: 'bell-bold', tone: 'info', to: '/announcements?new=1' },
    { label: 'تعميم', icon: 'document-text-bold', tone: 'violet', to: '/circulars?new=1' },
    { label: 'إصدار شهادة', icon: 'diploma-verified-bold', tone: 'gold', to: '/certificates?new=1' },
    { label: 'طلب التحاق', icon: 'user-plus-rounded-bold', tone: 'warn', to: '/apply' }
  ],
  teacher: [
    { label: 'تسجيل تسميع', icon: 'microphone-3-bold', tone: 'gold', to: '/hifz/record' },
    { label: 'حضور الحلقة', icon: 'checklist-minimalistic-bold', tone: 'ok', to: '/attendance' },
    { label: 'تسجيل سلوك', icon: 'star-bold', tone: 'ok', to: '/behavior?new=1' },
    { label: 'اختبار جديد', icon: 'document-add-bold', tone: 'info', to: '/exams/new' }
  ]
}
