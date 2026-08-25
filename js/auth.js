// ============================================================
// Auth helpers.
//
// Every "person" in the app is a real Firebase Auth user, so passwords are
// verified securely by Firebase itself (never stored or compared in our own
// code/Firestore). Teachers and admin sign in with a normal email. Students
// sign in with a class code + their name (which we turn into a made-up email
// behind the scenes) + their password.
//
// Account CREATION (admin making a teacher, teacher making a student) uses
// the separate `workerAuth`/`workerDb` so the person doing the creating
// doesn't get signed out of their own session in the process.
// ============================================================
import { generatePassword } from "./passwords.js";
import {
  auth, db, workerAuth, workerDb,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp
} from "./firebase-init.js";

export function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Exported so the teacher dashboard can show a student's internal login
// email — that's what you search for in the Firebase console when resetting
// a forgotten password.
export function studentEmail(classCode, name, disambiguator = "") {
  return `${classCode.toLowerCase()}.${slugify(name)}${disambiguator}@students.ttrace.app`;
}

// ---------- Profile lookups ----------
export async function getMyProfile() {
  if (!auth.currentUser) return null;
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

// ---------- Admin / teacher login (normal email + password) ----------
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists()) throw new Error("No profile found for this account.");
  return { uid: cred.user.uid, ...snap.data() };
}

// Teacher login also checks approval status, and signs them back out if
// they're not approved yet so a pending/denied account can't sit "logged in".
export async function teacherLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists() || snap.data().role !== "teacher") {
    await signOut(auth);
    throw new Error("This account isn't set up as a teacher.");
  }
  const profile = { uid: cred.user.uid, ...snap.data() };
  if (profile.status === "pending") {
    await signOut(auth);
    throw new Error("Your account is still waiting for admin approval.");
  }
  if (profile.status === "denied") {
    await signOut(auth);
    throw new Error("Your account request wasn't approved. Contact your admin.");
  }
  return profile;
}

export function logout() {
  return signOut(auth);
}

// ---------- Student class lookup (public, no auth needed yet) ----------
export async function findClassByCode(rawCode) {
  const code = rawCode.trim().toUpperCase();
  const q = query(collection(db, "classes"), where("classCode", "==", code));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function getClassRoster(classId) {
  const snap = await getDoc(doc(db, "classRosters", classId));
  return snap.exists() ? (snap.data().students || []) : [];
}

// ---------- Student login (Player 1 — primary session) ----------
export async function studentLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists()) throw new Error("No profile found for this account.");
  return { uid: cred.user.uid, ...snap.data() };
}

// ---------- Student login (Player 2 — worker session, alongside Player 1) ----------
export async function studentLoginSecondPlayer(email, password) {
  const cred = await signInWithEmailAndPassword(workerAuth, email, password);
  const snap = await getDoc(doc(workerDb, "users", cred.user.uid));
  if (!snap.exists()) throw new Error("No profile found for this account.");
  return { uid: cred.user.uid, ...snap.data() };
}

// ---------- Teacher self-signup (creates a real account immediately, but
// it stays "pending" until an admin approves it — see teacherLogin above) ----------
export async function requestTeacherAccount({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    role: "teacher", name, email, status: "pending", createdAt: serverTimestamp()
  });
  await signOut(auth); // don't leave them "logged in" while unapproved
  return cred.user.uid;
}

// ---------- Admin actions on teacher requests (just a status flip — the
// Auth account already exists from the signup step above) ----------
export async function approveTeacherRequest(uid) {
  await setDoc(doc(db, "users", uid), { status: "approved" }, { merge: true });
}

export async function denyTeacherRequest(uid) {
  await setDoc(doc(db, "users", uid), { status: "denied" }, { merge: true });
}

export async function createClass({ teacherId, className, classCode }) {
  const existing = await findClassByCode(classCode);
  if (existing) throw new Error("That class code is already in use — pick another.");
  const ref = doc(collection(db, "classes"));
  await setDoc(ref, { teacherId, className, classCode: classCode.toUpperCase(), createdAt: serverTimestamp() });
  await setDoc(doc(db, "classRosters", ref.id), { className, students: [] });
  return ref.id;
}

// Creates one student. If no password is passed in, a unique random one is
// generated (this is the normal path now — see js/passwords.js for why).
// Returns { uid, name, email, password } so the caller can show the password
// to the teacher ONCE. It is never written to Firestore.
export async function createStudentAccount({ classId, classCode, name, password }) {
  const finalPassword = password || generatePassword();
  let email = studentEmail(classCode, name);
  const roster = await getClassRoster(classId);
  if (roster.some(s => s.email === email)) {
    email = studentEmail(classCode, name, "-" + Math.floor(Math.random() * 900 + 100));
  }
  const cred = await createUserWithEmailAndPassword(workerAuth, email, finalPassword);
  await setDoc(doc(db, "users", cred.user.uid), {
    role: "student", name, classId, level: 1, createdAt: serverTimestamp()
  });
  const rosterRef = doc(db, "classRosters", classId);
  const rosterSnap = await getDoc(rosterRef);
  const students = rosterSnap.exists() ? (rosterSnap.data().students || []) : [];
  students.push({ uid: cred.user.uid, name, email });
  await setDoc(rosterRef, { ...(rosterSnap.exists() ? rosterSnap.data() : {}), students });
  await signOut(workerAuth);
  return { uid: cred.user.uid, name, email, password: finalPassword };
}
