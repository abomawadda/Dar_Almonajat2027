// Write sentinels understood by both adapters (Firestore and in-memory).
export const op = {
  now: () => ({ __op: 'now' }),
  inc: (n) => ({ __op: 'inc', n }),
  union: (...v) => ({ __op: 'union', v })
}
export const isOp = (v) => !!(v && typeof v === 'object' && v.__op)

/**
 * Query spec shared by both adapters:
 * { where: [[field, op, value], ...], orderBy: [field, 'asc'|'desc'], limit: n }
 */
