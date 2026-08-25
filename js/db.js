// ============================================================
// Firestore data layer (everything except auth/account-creation, which
// lives in auth.js since it needs the worker app).
//
// Collections:
//   users/{uid}            { role, name, email?, classId?, level?, createdAt }
//   classes/{classId}       { teacherId, className, classCode, createdAt }
//   classRosters/{classId}  { className, students: [{uid,name,email}] }  (public read, for login dropdown)
//   notifications/{id}      { classId, studentId, studentName, level, score, total, status, createdAt }
//   testResults/{id}        { classId, studentId, studentName, level, score, total, passed, createdAt }
//   gameResults/{id}        { classId, gameId, gameName, weekId, player1:{uid,name},
//                              player2:{uid,name}, winnerUid, winnerName, createdAt }
//                            (see js/results.js — human-vs-human match results only,
//                            used for the weekly leaderboard)
//   settings/aiConfig       { [gameId]: { accuracy, minMs, maxMs } } — teacher-set AI
//                            opponent tuning per game (see js/ai-settings.js + settings.html)
// ============================================================
import {
  db, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, query, where, orderBy, onSnapshot, serverTimestamp
} from "./firebase-init.js";
import { nextLevel } from "./levels.js";

// ---------- Teachers (admin use) ----------
export async function listTeachersByStatus(status) {
  const q = query(collection(db, "users"), where("role", "==", "teacher"), where("status", "==", status));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Classes (for a given teacher) ----------
export async function listClassesForTeacher(teacherId) {
  const q = query(collection(db, "classes"), where("teacherId", "==", teacherId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------- Students ----------
export async function listStudents(classId) {
  const q = query(collection(db, "users"), where("classId", "==", classId), where("role", "==", "student"));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    // Skip the leftovers of password resets — the student's current account is
    // the replacement, and showing both would duplicate them on the roster.
    .filter(s => !s.retired)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setStudentLevel(studentId, level) {
  await updateDoc(doc(db, "users", studentId), { level });
}

// ---------- Test results + teacher notifications ----------
export async function saveTestResult(classId, { studentId, studentName, level, score, total }) {
  const passed = score === total;
  await addDoc(collection(db, "testResults"), {
    classId, studentId, studentName, level, score, total, passed, createdAt: serverTimestamp()
  });
  if (passed) {
    await addDoc(collection(db, "notifications"), {
      classId, studentId, studentName, level, score, total,
      status: "pending", createdAt: serverTimestamp()
    });
  }
  return passed;
}

export function listenPendingNotifications(classId, callback) {
  // NOTE: deliberately no orderBy() here. Combining it with the two where()
  // equality filters below requires a Firestore composite index — if that
  // index doesn't exist in the Firebase console, this query fails and
  // (with no error handler) fails *silently*, so the teacher page just never
  // shows any pending approvals even though the notification docs exist.
  // Sorting client-side avoids needing that index at all.
  const q = query(
    collection(db, "notifications"),
    where("classId", "==", classId),
    where("status", "==", "pending")
  );
  return onSnapshot(
    q,
    snap => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notifs.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
      callback(notifs);
    },
    err => console.error("listenPendingNotifications failed:", err)
  );
}

export async function resolveNotification(notifId, { approve, studentId, currentLevel }) {
  await updateDoc(doc(db, "notifications", notifId), { status: approve ? "approved" : "held" });
  if (approve) await setStudentLevel(studentId, nextLevel(currentLevel));
}
