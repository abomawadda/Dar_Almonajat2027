// Student attendance card: a QR code the teacher scans to mark the student present.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Card } from '@/components/ui'

export const qrPayload = (studentId) => `DAR-STUDENT:${studentId}`
export const parseQr = (text) => (String(text || '').startsWith('DAR-STUDENT:') ? String(text).slice(12) : null)

export default function QrCard({ student }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(qrPayload(student.id), { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(''))
  }, [student.id])
  return (
    <Card className="p-4 flex items-center gap-4">
      {src ? <img src={src} alt={`رمز حضور ${student.personalInfo.fullName}`} className="w-28 h-28 rounded-xl bg-white p-1" /> : <div className="w-28 h-28 rounded-xl bg-field" />}
      <div className="min-w-0">
        <div className="text-xs text-ink-muted font-bold">بطاقة الحضور</div>
        <div className="text-base font-extrabold mt-1 leading-6">{student.personalInfo.fullName}</div>
        <div className="text-xs text-gold-600 font-bold mt-0.5">{student.academicInfo?.groupName}</div>
        <div className="text-[11px] text-ink-muted mt-2 leading-5">يُعرض على المحفظ عند الوصول لتسجيل الحضور</div>
      </div>
    </Card>
  )
}
