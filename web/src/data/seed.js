// Demo data — same records as dar-erp v7 so both versions show the same picture.
import { addDays, todayKey } from '@/lib/format'

import BASE from './base.json'
import { countAyahs, lastJuzRanges } from '@/lib/hifz'

/** Base records (also used by functions/scripts/seed-base.mjs — single source in base.json). */
export function baseSeed() {
  const now = new Date().toISOString()
  return {
    teachers: BASE.teachers.map((t) => ({ ...t, joinDate: now })),
    groups: BASE.groups.map((g) => ({ ...g })),
    settings: { ...BASE.settings, updatedAt: now }
  }
}

const strip = ({ id, ...rest }) => rest

export async function seedDemo(db) {
  const base = baseSeed()
  const t = Date.now()
  const ago = (h) => new Date(t - h * 3600e3).toISOString()
  const groups = Object.fromEntries(base.groups.map((g) => [g.id, { ...g }]))
  const b = db.batch()

  const students = [
    ['S1', 'محمد طارق الشناوي', 'G1', 18, 'P1', '2015-04-02'],
    ['S2', 'إبراهيم عادل الزيات', 'G1', 22, 'P2', '2013-01-11'],
    ['S3', 'يوسف محمود الجندي', 'G2', 10, 'P3', '2014-07-20'],
    ['S4', 'عبدالرحمن سلطان الشرقاوي', 'G3', 3, 'P4', '2016-09-05'],
    ['S5', 'زياد ناصر الدسوقي', 'G2', 7, 'P5', '2014-03-15'],
    ['S6', 'عبدالرحمن طارق الشناوي', 'G3', 3, 'P1', '2018-06-01']
  ]
  const yesterday = todayKey(addDays(-1))
  const twoDaysAgo = todayKey(addDays(-2))
  const studentExtras = {
    S1: {
      lastSession: yesterday,
      lastMastery: 'excellent',
      lastHomework: 'حفظ سورة هود ٧١–٩٥ + مراجعة يونس ١–٥٠',
      lastHomeworkDate: yesterday,
      lastHifz: { surahName: 'هود', fromAyah: 40, toAyah: 70, date: yesterday, masteryLevel: 'excellent' }
    },
    S2: {
      lastSession: yesterday,
      lastMastery: 'good',
      lastHomework: 'حفظ سورة يوسف ٣١–٦٠',
      lastHomeworkDate: yesterday,
      lastHifz: { surahName: 'يوسف', fromAyah: 1, toAyah: 30, date: yesterday, masteryLevel: 'good' }
    },
    S6: {
      lastSession: yesterday,
      lastMastery: 'excellent',
      lastHomework: 'حفظ سورة النبأ ٢١–٤٠',
      lastHomeworkDate: yesterday,
      lastHifz: { surahName: 'النبأ', fromAyah: 1, toAyah: 20, date: yesterday, masteryLevel: 'excellent' }
    }
  }
  students.forEach(([id, name, gid, juz, parentId, birth]) => {
    const g = groups[gid]
    g.studentCount++
    b.set('students', id, {
      status: 'active', parentId, enrollType: 'quran', joinedAt: ago(2000),
      personalInfo: { fullName: name, birthDate: birth, gender: 'ذكر' },
      academicInfo: { groupId: gid, groupName: g.name, teacherId: g.teacherId, teacherName: g.teacherName, currentJuz: juz, totalMemorized: countAyahs(lastJuzRanges(juz)), level: g.level, ...(studentExtras[id] || {}) }
    })
    const pts = 40 + juz * 12 + id.charCodeAt(1) * 3
    const ym = todayKey().slice(0, 7)
    b.set('pointsBalance', id, { studentId: id, studentName: name, parentId, groupId: gid, groupName: g.name, balance: pts, earned: pts, months: { [ym]: Math.round(pts / 3) } })
    b.set('hifzProgress', id, { studentId: id, parentId, totalMemorized: countAyahs(lastJuzRanges(juz)), ranges: lastJuzRanges(juz), lastUpdated: ago(24) })
  })
  ;[['مصحف التجويد الملوّن', 150, '📖', 5], ['حقيبة الدار', 120, '🎒', 10], ['قلم ومفكرة', 40, '🖊️', null], ['رحلة الأوائل', 400, '🎟️', 3]]
    .forEach(([name, cost, icon, stock], i) => b.set('rewards', `R${i + 1}`, { name, cost, icon, stock, active: true }))
  base.teachers.forEach((x) => b.set('teachers', x.id, strip(x)))
  Object.values(groups).forEach((g) => b.set('groups', g.id, strip(g)))
  ;[
    ['P1', 'طارق الشناوي', '01000000001', ['S1', 'S6']],
    ['P2', 'عادل الزيات', '01000000002', ['S2']],
    ['P3', 'محمود الجندي', '01000000003', ['S3']],
    ['P4', 'سلطان الشرقاوي', '01000000004', ['S4']],
    ['P5', 'ناصر الدسوقي', '01000000005', ['S5']]
  ].forEach(([id, name, phone, childrenIds]) => b.set('parents', id, { name, phone, childrenIds, relation: 'الأب', email: '', hasAccount: id === 'P1', createdAt: ago(2000) }))
  b.set('settings', 'general', base.settings)

  const apps = [
    ['أحمد خالد المنوفي', 'pending', 'quran', '2014-03-15', 'خالد محمد المنوفي', '01011122233', 2, 'متوسط', 2,
      { healthInfo: { chronic: 'لا يوجد', meds: 'لا يوجد', allergy: 'حساسية من الفول السوداني', disability: 'لا يوجد' }, academicInfo: { lastMemorized: 'الفاتحة إلى المائدة', schoolStage: 'ابتدائي', school: 'مدرسة الإمام الشعراوي' } }],
    ['سعد فهد البنا', 'pending', 'nursery', '2021-05-10', 'فهد البنا', '01122233344', 6, 'مبتدئ', 0],
    ['عمر ناصر السعيد', 'reviewing', 'both', '2019-02-01', 'ناصر السعيد', '01233344455', 30, 'مبتدئ', 0],
    ['فيصل سلطان الشرقاوي', 'interview_scheduled', 'quran', '2012-08-22', 'سلطان الشرقاوي', '01000000004', 72, 'متقدم', 5,
      { interviewData: { scheduledAt: new Date(t + 864e5).toISOString() } }],
    ['محمد طارق الشناوي', 'approved', 'quran', '2015-04-02', 'طارق الشناوي', '01000000001', 2000, 'متوسط', 10,
      { decisionData: { decision: 'approved', studentId: 'S1', groupId: 'G1', note: 'وُزّع على الشيخ سعد المنشاوي (حلقة المتقدمين)' } }],
    ['يحيى سالم البرعي', 'rejected', 'quran', '2013-11-11', 'سالم البرعي', '01566677788', 400, 'مبتدئ', 0,
      { decisionData: { decision: 'rejected', decisionReason: 'عدم استيفاء شروط السن' } }]
  ]
  apps.forEach(([name, status, type, birth, gName, phone, h, level, juz, extra], i) => {
    const doc = {
      status, type, source: 'public', submittedAt: ago(h), createdAt: ago(h),
      personalInfo: { fullName: name, birthDate: birth, gender: 'ذكر', nationality: 'مصري', nationalId: '' },
      guardianInfo: { name: gName, relation: 'الأب', phone, email: '' },
      academicInfo: { level, juzCount: juz, lastMemorized: '', schoolStage: '' },
      preferences: { periods: ['الصباح'], days: ['السبت', 'الاثنين', 'الأربعاء'], notes: '' }
    }
    if (extra) Object.entries(extra).forEach(([k, v]) => { doc[k] = { ...(doc[k] || {}), ...v } })
    b.set('applications', `APP-${1001 + i}`, doc)
  })

  ;[
    ['S1', 'positive', 'حفظ وتسميع', 'تميّز في التسميع — حفظ سورة هود كاملة بدرجة ممتاز', 10, 3],
    ['S2', 'positive', 'أدب وسلوك', 'حسن الأدب والمثابرة مع زملائه وأستاذه', 5, 26],
    ['S3', 'warning', 'حضور وانضباط', 'تأخر عن الحصة ٢٠ دقيقة دون إشعار', -3, 28],
    ['S5', 'negative', 'حضور وانضباط', 'غياب ٣ أيام متتالية دون عذر', -10, 60],
    ['S4', 'positive', 'حفظ وتسميع', 'أتم حفظ الجزء الثالث', 15, 90]
  ].forEach(([sid, type, category, description, points, h]) => {
    const s = students.find((x) => x[0] === sid)
    const g = groups[s[2]]
    b.add('behavior', { studentId: sid, studentName: s[1], parentId: s[4], type, category, description, points, teacherId: g.teacherId, teacherName: g.teacherName, groupId: g.id, notifyParent: true, createdAt: ago(h) })
  })
  ;[
    ['حفل التكريم السنوي للمتفوقين', 'event', 'all', 'يسعدنا دعوتكم لحضور حفل التكريم السنوي لطلبة الدار المتفوقين في الحفظ والتجويد يوم الأحد بعد صلاة المغرب.', true, 2],
    ['تعديل مواعيد الحلقات خلال رمضان', 'academic', 'students_parents', 'تبدأ جميع الحلقات خلال شهر رمضان المبارك الساعة التاسعة مساءً بدلًا من موعدها المعتاد.', false, 26],
    ['إجازة منتصف العام الدراسي', 'admin', 'all', 'إجازة منتصف الفصل الدراسي الثاني من ٢٠ إلى ٢٥، وتُستأنف الدراسة يوم الأحد التالي.', false, 80]
  ].forEach(([title, type, audience, body, pinned, h]) => b.add('announcements', { title, type, audience, body, pinned, authorId: 'demo-admin', authorName: 'إدارة الدار', createdAt: ago(h) }))
  ;[
    ['تعليمات الامتحانات الشهرية', 'students_parents', 'الرجاء الالتزام بالمواعيد المحددة للاختبارات وإحضار المصحف والالتزام بالهدوء.', 3],
    ['ضوابط الحضور والانصراف للمحفظين', 'teachers', 'يُلزم كل محفظ بتسجيل حضوره قبل ١٥ دقيقة من موعد الحلقة وتقديم تقرير أسبوعي للإدارة.', 75],
    ['تنظيم برنامج رمضان المبارك', 'all', 'تكون الحلقات خلال رمضان بعد صلاة التراويح مع اشتراطات موحدة للزي والمصحف.', 120]
  ].forEach(([title, audience, body, h]) => b.add('circulars', { title, audience, body, requiresAck: true, acks: [], authorName: 'إدارة الدار', createdAt: ago(h) }))
  ;[
    ['اختبار حفظ الجزء الحادي عشر', 'G1', 3, '10:00', 'سورة هود كاملة + مراجعة يونس'],
    ['اختبار شهري — المتوسطين', 'G2', 5, '08:00', 'الأجزاء ٦–١٠ • تجويد + حفظ'],
    ['اختبار جزء عم — المبتدئين', 'G3', -6, '09:00', 'جزء عم كاملًا']
  ].forEach(([title, gid, days, time, scope]) => {
    const g = groups[gid]
    b.add('exams', { title, groupId: gid, groupName: g.name, teacherId: g.teacherId, teacherName: g.teacherName, date: todayKey(new Date(t + days * 864e5)), time, duration: 60, scope, kind: 'periodic', rubric: [{ key: 'hifz', label: 'الحفظ', max: 60 }, { key: 'tajweed', label: 'أحكام التجويد', max: 20 }, { key: 'makharij', label: 'المخارج والأداء', max: 10 }, { key: 'waqf', label: 'الوقف والابتداء', max: 10 }], totalMarks: 100, passPercent: 60, passMark: 60, status: 'scheduled', studentCount: g.studentCount, createdAt: ago(10) })
  })
  b.add('certificates', { studentId: 'S2', studentName: 'إبراهيم عادل الزيات', parentId: 'P2', groupName: 'حلقة المتقدمين', type: 'حفظ ٢٠ جزءًا', serial: `DAR-${new Date(t).getFullYear()}-0001`, verifyCode: 'DEMO2026', status: 'valid', issuedByName: 'أ. محمود العراقي', issuedAt: ago(200) })
  b.add('certificates', { studentId: 'S1', studentName: 'محمد طارق الشناوي', parentId: 'P1', groupName: 'حلقة المتقدمين', type: 'حفظ ١٥ جزءًا', issuedByName: 'أ. محمود العراقي', issuedAt: ago(900) })
  b.set('counters', `certificates_${new Date(t).getFullYear()}`, { value: 1 })
  b.set('certVerify', 'DEMO2026', { serial: `DAR-${new Date(t).getFullYear()}-0001`, studentName: 'إبراهيم عادل الزيات', type: 'حفظ ٢٠ جزءًا', grade: 'ممتاز', issuedOn: todayKey(new Date(t - 200 * 36e5)), status: 'valid' })
  b.add('competitions', { title: 'مسابقة الشهر — حفظ جزء عم', startDate: todayKey(new Date(t - 10 * 864e5)), endDate: todayKey(new Date(t + 10 * 864e5)), condition: 'حفظ جزء عم بتقدير جيد جدًا فأعلى', prizes: 'الأول: ١٠٠٠ ج.م + مصحف • الثاني: ٦٠٠ ج.م • الثالث: ٣٠٠ ج.م', createdAt: ago(240) })
  b.add('notifications', { userId: 'P1', type: 'hifz', title: 'تسميع محمد — ممتاز', body: 'حفظ سورة هود ٤٠–٧٠ بدرجة ممتاز', isRead: false, createdAt: ago(3) })
  b.add('notifications', { userId: 'T1', type: 'exam', title: 'اختبار قادم', body: 'اختبار حفظ الجزء الحادي عشر بعد ٣ أيام', isRead: false, createdAt: ago(10) })

  b.add('hifzRecords', {
    studentId: 'S1', studentName: 'محمد طارق الشناوي', parentId: 'P1', groupId: 'G1', teacherId: 'T1', teacherName: 'الشيخ سعد المنشاوي',
    date: yesterday, type: 'both', masteryLevel: 'excellent', hifzMistakes: 1, tajweedMistakes: 0,
    newMemorization: { surahName: 'هود', fromAyah: 40, toAyah: 70, ayahCount: 31, masteryLevel: 'excellent', repetitions: 5 },
    revision: { surahName: 'يونس', fromAyah: 1, toAyah: 30, ayahCount: 30, masteryLevel: 'excellent' },
    homework: 'حفظ سورة هود ٧١–٩٥ + مراجعة يونس ١–٥٠', teacherNotes: 'أداء متميز وتلاوة منضبطة', createdAt: ago(24)
  })
  b.add('hifzRecords', {
    studentId: 'S2', studentName: 'إبراهيم عادل الزيات', parentId: 'P2', groupId: 'G1', teacherId: 'T1', teacherName: 'الشيخ سعد المنشاوي',
    date: yesterday, type: 'new', masteryLevel: 'good', hifzMistakes: 2, tajweedMistakes: 1,
    newMemorization: { surahName: 'يوسف', fromAyah: 1, toAyah: 30, ayahCount: 30, masteryLevel: 'good', repetitions: 4 },
    homework: 'حفظ سورة يوسف ٣١–٦٠', teacherNotes: 'يرجى الانتباه لأحكام المد', createdAt: ago(25)
  })
  b.add('hifzRecords', {
    studentId: 'S6', studentName: 'عبدالرحمن طارق الشناوي', parentId: 'P1', groupId: 'G3', teacherId: 'T3', teacherName: 'الشيخ يوسف عبدالباسط',
    date: yesterday, type: 'new', masteryLevel: 'excellent', hifzMistakes: 0, tajweedMistakes: 0,
    newMemorization: { surahName: 'النبأ', fromAyah: 1, toAyah: 20, ayahCount: 20, masteryLevel: 'excellent', repetitions: 6 },
    homework: 'حفظ سورة النبأ ٢١–٤٠', teacherNotes: 'ما شاء الله حفظ متقن', createdAt: ago(26)
  })

  b.set('attendance', `${yesterday}_S1`, {
    date: yesterday, groupId: 'G1', groupName: 'حلقة المتقدمين', teacherId: 'T1',
    studentId: 'S1', studentName: 'محمد طارق الشناوي', parentId: 'P1', status: 'present', updatedAt: ago(24)
  })
  b.set('attendance', `${twoDaysAgo}_S1`, {
    date: twoDaysAgo, groupId: 'G1', groupName: 'حلقة المتقدمين', teacherId: 'T1',
    studentId: 'S1', studentName: 'محمد طارق الشناوي', parentId: 'P1', status: 'present', updatedAt: ago(48)
  })
  b.set('attendance', `${yesterday}_S6`, {
    date: yesterday, groupId: 'G3', groupName: 'حلقة المبتدئين', teacherId: 'T3',
    studentId: 'S6', studentName: 'عبدالرحمن طارق الشناوي', parentId: 'P1',
    status: 'excused', excuseReason: 'ظرف عائلي', excuseNote: 'زيارة عائلية', excusedByParent: true, updatedAt: ago(24)
  })
  b.set('attendance', `${twoDaysAgo}_S6`, {
    date: twoDaysAgo, groupId: 'G3', groupName: 'حلقة المبتدئين', teacherId: 'T3',
    studentId: 'S6', studentName: 'عبدالرحمن طارق الشناوي', parentId: 'P1', status: 'present', updatedAt: ago(48)
  })
  await b.commit()
}
