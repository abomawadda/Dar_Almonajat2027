// Certificates: sequential serial (DAR-YYYY-0001), a random verification code, and a public
// certVerify/{code} record (name, type, date, serial, status only) behind the /verify/:code page.
import { db } from '@/lib/backend'
import { op } from '@/lib/db/ops'
import { COL } from '@/config/constants'
import { recordScope } from './scope'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
export function newVerifyCode(len = 8) {
  const a = new Uint32Array(len)
  globalThis.crypto.getRandomValues(a)
  return Array.from(a, (n) => ALPHABET[n % ALPHABET.length]).join('')
}
export const verifyUrl = (code) => `${globalThis.location?.origin || ''}/verify/${code}`

/** Reserve the next serial for the year. (Moves to a server transaction with Cloud Functions.) */
async function nextSerial(b, year) {
  const id = `certificates_${year}`
  const cur = await db().get(COL.COUNTERS, id)
  const n = (Number(cur?.value) || 0) + 1 + (b.__serials?.[id] || 0)
  b.__serials = { ...(b.__serials || {}), [id]: (b.__serials?.[id] || 0) + 1 }
  b.set(COL.COUNTERS, id, { value: op.inc(1) }, { merge: true })
  return `DAR-${year}-${String(n).padStart(4, '0')}`
}

/** Add a certificate (and its public verification record) to an open batch. */
export async function issueCertificateDoc(b, { student, type, notes = '', examId = null, grade = '' }, actor) {
  if (!student) throw new Error('اختر الطالب')
  if (!type) throw new Error('اختر نوع الشهادة')
  const issuedOn = new Date().toISOString().slice(0, 10)
  const serial = await nextSerial(b, issuedOn.slice(0, 4))
  const verifyCode = newVerifyCode()
  const cert = {
    serial, verifyCode, status: 'valid',
    studentId: student.id, studentName: student.personalInfo.fullName, parentId: student.parentId || '',
    groupName: student.academicInfo?.groupName || '', teacherName: student.academicInfo?.teacherName || '',
    type, grade, notes, examId, issuedOn,
    issuedBy: actor.uid, issuedByName: actor.name || '', issuedAt: op.now()
  }
  const id = b.add(COL.CERTIFICATES, cert)
  b.set(COL.CERT_VERIFY, verifyCode, { serial, studentName: cert.studentName, type, grade, issuedOn, status: 'valid', certId: id || '' })
  if (student.parentId) {
    b.add(COL.NOTIFICATIONS, { userId: student.parentId, type: 'certificate', title: 'شهادة جديدة 🎓', body: `شهادة ${type} للطالب ${cert.studentName} — رقم ${serial}`, isRead: false, createdAt: op.now() })
  }
  return { ...cert, id }
}

export async function issueCertificate(input, actor) {
  const b = db().batch()
  const cert = await issueCertificateDoc(b, input, actor)
  await b.commit()
  return cert
}

export const subscribeCertificates = (actor, cb) =>
  db().subscribe(COL.CERTIFICATES, recordScope(actor, { teacherField: null }), (rows) =>
    cb(rows.sort((a, b) => ((b.issuedAt || '') > (a.issuedAt || '') ? 1 : -1))))

export async function revokeCertificate(cert, reason, actor) {
  if (!reason?.trim()) throw new Error('اكتب سبب الإلغاء')
  const b = db().batch()
  b.update(COL.CERTIFICATES, cert.id, { status: 'revoked', revokeReason: reason.trim(), revokedBy: actor.uid, revokedAt: op.now() })
  if (cert.verifyCode) b.update(COL.CERT_VERIFY, cert.verifyCode, { status: 'revoked' })
  await b.commit()
}

/** Public lookup (no sign-in). */
export async function verifyCertificate(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{6,12}$/.test(c)) return null
  return db().get(COL.CERT_VERIFY, c)
}
