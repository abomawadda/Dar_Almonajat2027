// Create the base records (halaqat, teachers, settings) from web/src/data/base.json.
// Refuses to run if groups already exist, so it cannot overwrite real data.
//   node scripts/seed-base.mjs
import { readFileSync } from 'node:fs'
import { admin } from './_admin.mjs'

const BASE = JSON.parse(readFileSync(new URL('../../web/src/data/base.json', import.meta.url), 'utf8'))
const { db, FieldValue, projectId } = admin()
const existing = await db.collection('groups').limit(1).get()
if (!existing.empty) { console.log('• توجد حلقات بالفعل — لم يُنفذ شيء'); process.exit(0) }

const b = db.batch()
for (const { id, ...t } of BASE.teachers) b.set(db.collection('teachers').doc(id), { ...t, joinDate: FieldValue.serverTimestamp() })
for (const { id, ...g } of BASE.groups) b.set(db.collection('groups').doc(id), g)
b.set(db.collection('settings').doc('general'), { ...BASE.settings, updatedAt: FieldValue.serverTimestamp() })
await b.commit()
console.log(`✓ أُنشئت ${BASE.groups.length} حلقات و${BASE.teachers.length} محفظين والإعدادات في ${projectId}`)
console.log('  عدّل الأسماء والسعة من Firestore Console لتطابق الدار.')
process.exit(0)
