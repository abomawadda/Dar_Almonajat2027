// Permission matrix. UI uses can(); the server enforces the same rules in firestore.rules.
const A = 'admin', S = 'supervisor', T = 'teacher', ST = 'student', P = 'parent'
// Phase-0 roles: their screens arrive with finance (AC), visitors (SE) and exam committees (EX).
const AC = 'accountant', SE = 'secretary', EX = 'examiner'

export const PERMISSIONS = {
  'applications.view':     [A, S, SE],
  'applications.review':   [A, S],   // move to reviewing / schedule interview
  'applications.decide':   [A],      // approve / defer / reject
  'students.view':         [A, S, T, ST, P, SE],
  'teachers.view':         [A, S],
  'attendance.record':     [A, S, T],
  'attendance.view':       [A, S, T, ST, P],
  'staffAttendance.all':   [A, S],
  'staffAttendance.self':  [T],
  'hifz.record':           [A, S, T],
  'behavior.record':       [A, S, T],
  'behavior.view':         [A, S, T, ST, P],
  'exams.manage':          [A, S, T],
  'exams.view':            [A, S, T, ST, P, EX],
  'exams.grade':           [A, S, EX],
  'announcements.publish': [A, S],
  'announcements.delete':  [A],
  'circulars.publish':     [A, S],
  'circulars.ack':         [T, ST, P],
  'certificates.issue':    [A, S],
  'certificates.view':     [A, S, T, ST, P],
  'competitions.manage':   [A, S],
  'competitions.view':     [A, S, T, ST, P],
  'finance.view':          [A, AC],
  'finance.collect':       [A, AC],
  'visitors.manage':       [A, SE],
  'reports.view':          [A, S]
}

export const can = (role, permission) => (PERMISSIONS[permission] || []).includes(role)
