// File uploads (excuse attachments, later certificates/receipts).
//   live → Firebase Storage under a scoped path; demo/tests → data URL kept in the record.
import { DATA_MODE, firebaseApp } from './backend'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function checkFile(file) {
  if (!file) return null
  if (!ALLOWED_TYPES.includes(file.type)) return 'الملف يجب أن يكون صورة أو PDF'
  if (file.size > MAX_UPLOAD_BYTES) return 'حجم الملف أكبر من ٥ ميجابايت'
  return null
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(file)
})

/** Upload and return { url, name, type, size }. `path` e.g. `excuses/{parentId}/{id}`. */
export async function uploadFile(path, file) {
  const err = checkFile(file)
  if (err) throw new Error(err)
  const meta = { name: file.name, type: file.type, size: file.size }
  if (DATA_MODE === 'demo' || !firebaseApp()) {
    if (file.size > 700 * 1024) throw new Error('في الوضع التجريبي الحد الأقصى ٧٠٠ كيلوبايت')
    return { ...meta, url: await readAsDataUrl(file) }
  }
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
  const r = ref(getStorage(firebaseApp()), `${path}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`)
  await uploadBytes(r, file, { contentType: file.type })
  return { ...meta, url: await getDownloadURL(r) }
}
