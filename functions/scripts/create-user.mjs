// Create a staff login (admin / supervisor / teacher) and its users/{uid} profile.
//   node scripts/create-user.mjs --role admin --email a@b.com --password Secret123 --name "أبو محمد"
//   node scripts/create-user.mjs --role teacher --email t@b.com --password Secret123 --name "الشيخ سعد" --teacher-id T1
import { admin, args } from './_admin.mjs'

const ROLES = ['admin', 'supervisor', 'teacher', 'accountant']
const a = args()
if (!ROLES.includes(a.role) || !a.email || !a.name || (!a.password && !a['existing'])) {
  console.log('الاستخدام: --role admin|supervisor|teacher|accountant --email … --password … --name "…" [--teacher-id T1] [--existing]')
  process.exit(1)
}
if (a.role === 'teacher' && !a['teacher-id']) { console.error('✗ المحفظ يحتاج --teacher-id (معرّف مستنده في teachers)'); process.exit(1) }

const { db, auth, FieldValue, projectId } = admin()
let uid
try {
  uid = (await auth.getUserByEmail(a.email)).uid
  console.log('• الحساب موجود في Authentication، سيُحدَّث ملفه فقط')
} catch {
  uid = (await auth.createUser({ email: a.email, password: a.password, displayName: a.name })).uid
  console.log('• أُنشئ حساب الدخول')
}
const profile = { displayName: a.name, email: a.email, role: a.role, isActive: true, updatedAt: FieldValue.serverTimestamp() }
if (a.role === 'teacher') {
  const t = await db.collection('teachers').doc(a['teacher-id']).get()
  if (!t.exists) { console.error(`✗ لا يوجد محفظ بالمعرّف ${a['teacher-id']} — شغّل seed-base أو أنشئه أولًا`); process.exit(1) }
  profile.teacherId = a['teacher-id']
}
await db.collection('users').doc(uid).set(profile, { merge: true })
console.log(`✓ ${a.role} جاهز في المشروع ${projectId}: ${a.email} (uid ${uid})`)
process.exit(0)
