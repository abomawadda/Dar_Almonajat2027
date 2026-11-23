// Camera QR scanner (BarcodeDetector). Calls onScan(studentId) for each new student card read.
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/ui'
import { parseQr } from './QrCard'

export default function QrScanner({ open, onClose, onScan, lastName }) {
  const video = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    let stream, timer, stopped = false
    const seen = new Map()
    ;(async () => {
      if (!('BarcodeDetector' in window)) { setError('المتصفح لا يدعم قراءة الرمز — استخدم Chrome على أندرويد أو سجّل الحضور يدويًا'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) return
        video.current.srcObject = stream
        await video.current.play()
        const det = new window.BarcodeDetector({ formats: ['qr_code'] })
        const tick = async () => {
          if (stopped) return
          try {
            for (const c of await det.detect(video.current)) {
              const id = parseQr(c.rawValue)
              const now = Date.now()
              if (id && now - (seen.get(id) || 0) > 4000) { seen.set(id, now); onScan(id) }
            }
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 350)
        }
        tick()
      } catch {
        setError('تعذّر فتح الكاميرا — اسمح للتطبيق باستخدامها')
      }
    })()
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); setError('') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={open} title="مسح بطاقات الحضور" onClose={onClose}>
      {error ? <div className="p-3 rounded-xl bg-warn-soft text-sm font-bold">{error}</div> : (
        <video ref={video} playsInline muted className="w-full aspect-square object-cover rounded-2xl bg-black" />
      )}
      <div className="text-center text-sm font-bold mt-3 min-h-[24px] text-ok">{lastName ? `✓ ${lastName}` : 'وجّه الكاميرا إلى بطاقة الطالب'}</div>
    </Sheet>
  )
}
