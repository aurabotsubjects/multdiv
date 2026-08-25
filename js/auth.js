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
import { withTimeout } from "./net.js";
import {
  auth, db, workerAuth, workerDb,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword,
  collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp
} from "./firebase-init.js";

// Codes copied off a printed slip, or pasted by a teacher, very often pick up
// a stray leading/trailing space. Retrying once with it trimmed is the
// difference between "my password doesn't work" and getting on with the game.
function looksLikeWrongPassword(err) {
  return ["auth/invalid-credential", "auth/invalid-login-credentials",
          "auth/wrong-password", "auth/user-not-found"].includes(err?.code);
}

async function signInAllowingStraySpaces(authInstance, email, password) {
  try {
    return await signInWithEmailAndPassword(authInstance, email, password);
  } catch (err) {
    const trimmed = (password || "").trim();
    if (trimmed && trimmed !== password && looksLikeWrongPassword(err)) {
      return await signInWithEmailAndPassword(authInstance, email, trimmed);
    }
    throw err;
  }
}

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
  const snap = await withTimeout(getDoc(doc(db, "users", cred.user.uid)), 15000, "Your account");
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
// A "retired" profile is the leftover of a password reset: the teacher has
// issued this student a brand-new login, so the old one must stop working
// even though Firebase Auth still recognises the old password.
export async function studentLogin(email, password) {
  // Step 1: Firebase Auth checks the password.
  const cred = await signInAllowingStraySpaces(auth, email, password);

  // Step 2: we read their profile. This is a SEPARATE thing that can fail on
  // its own (blocked network, security rules, a missing profile doc) — and
  // when it does it is emphatically not a wrong password, so it throws its
  // own distinct errors rather than being lumped in with step 1.
  const snap = await withTimeout(getDoc(doc(db, "users", cred.user.uid)), 15000, "Your account");
  if (!snap.exists()) {
    await signOut(auth);
    throw new Error("profile-missing");
  }
  if (snap.data().retired) {
    await signOut(auth);
    throw new Error("account-reset");
  }
  return { uid: cred.user.uid, ...snap.data() };
}

// ---------- Setting your own password ----------
// Called on the login screen the first time a student signs in with a
// teacher-issued code, and again after every reset. Firebase lets a signed-in
// user change their OWN password with no extra permissions — that's the whole
// trick that makes this work without a paid backend.
export async function setMyPassword(newPassword) {
  if (!auth.currentUser) throw new Error("You're not signed in.");
  await updatePassword(auth.currentUser, newPassword);
  await setDoc(doc(db, "users", auth.currentUser.uid), { mustChangePassword: false }, { merge: true });
}

// ---------- Student login (Player 2 — worker session, alongside Player 1) ----------
export async function studentLoginSecondPlayer(email, password) {
  const cred = await signInAllowingStraySpaces(workerAuth, email, password);
  const snap = await withTimeout(getDoc(doc(workerDb, "users", cred.user.uid)), 15000, "That account");
  if (!snap.exists()) {
    await signOut(workerAuth);
    throw new Error("profile-missing");
  }
  const profile = snap.data();
  if (profile.retired) {
    await signOut(workerAuth);
    throw new Error("account-reset");
  }
  // Player 2 can't choose a new password from inside a game, so send them to
  // the main login screen to do it rather than letting them play on a code
  // that everyone standing nearby just watched the teacher hand over.
  if (profile.mustChangePassword) {
    await signOut(workerAuth);
    throw new Error("must-change-password");
  }
  return { uid: cred.user.uid, ...profile };
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
    role: "student", name, classId, level: 1,
    // The teacher-issued password is a one-time code: the student is made to
    // pick their own the first time they log in, so even a slip left on a
    // desk stops being useful the moment they've signed in once.
    mustChangePassword: true,
    createdAt: serverTimestamp()
  });
  const rosterRef = doc(db, "classRosters", classId);
  const rosterSnap = await getDoc(rosterRef);
  const students = rosterSnap.exists() ? (rosterSnap.data().students || []) : [];
  students.push({ uid: cred.user.uid, name, email });
  await setDoc(rosterRef, { ...(rosterSnap.exists() ? rosterSnap.data() : {}), students });
  await signOut(workerAuth);
  return { uid: cred.user.uid, name, email, password: finalPassword };
}

// ---------- Resetting a forgotten password ----------
// Firebase gives a browser exactly three ways to change a password: know the
// current one, click an emailed link, or use the Admin SDK on a server. A
// teacher whose student has forgotten their password has none of those (the
// student "emails" are made up, so the console's reset email goes nowhere).
//
// So instead of changing the old login, we retire it and issue a fresh one:
// a new Auth account with a new invisible email and a new one-time code, with
// the student's name and level carried across, and `mustChangePassword` set
// so they immediately choose their own password. The old account is marked
// `retired` and studentLogin() refuses it, so the old password is dead even
// though Firebase still technically recognises it.
//
// Returns { uid, name, email, password } — the code to hand to the student.
export async function resetStudentPassword({ classId, classCode, student }) {
  const rosterRef = doc(db, "classRosters", classId);
  const rosterSnap = await getDoc(rosterRef);
  const rosterData = rosterSnap.exists() ? rosterSnap.data() : { students: [] };
  const students = rosterData.students || [];
  const retiredEmails = rosterData.retiredEmails || [];

  // Emails of retired accounts stay claimed inside Firebase Auth forever, so
  // keep a list and never reuse one.
  const taken = new Set([...students.map(s => s.email), ...retiredEmails]);
  const password = generatePassword();

  let cred = null, email = null;
  for (let attempt = 0; attempt < 6 && !cred; attempt++) {
    const candidate = studentEmail(classCode, student.name, "-r" + Math.floor(Math.random() * 900 + 100));
    if (taken.has(candidate)) continue;
    try {
      cred = await createUserWithEmailAndPassword(workerAuth, candidate, password);
      email = candidate;
    } catch (err) {
      if (err.code !== "auth/email-already-in-use") throw err;
      taken.add(candidate); // collided with an older retired account — try again
    }
  }
  if (!cred) throw new Error("Couldn't create a fresh login for that student — try again.");

  const oldSnap = await getDoc(doc(db, "users", student.uid));
  const old = oldSnap.exists() ? oldSnap.data() : {};

  await setDoc(doc(db, "users", cred.user.uid), {
    role: "student", name: student.name, classId,
    level: old.level ?? 1,          // keep the level they'd worked up to
    mustChangePassword: true,
    previousUid: student.uid,
    createdAt: serverTimestamp()
  });
  await setDoc(doc(db, "users", student.uid), {
    retired: true, replacedBy: cred.user.uid
  }, { merge: true });

  const idx = students.findIndex(s => s.uid === student.uid);
  const entry = { uid: cred.user.uid, name: student.name, email };
  const nextStudents = idx >= 0
    ? students.map((s, i) => (i === idx ? entry : s))
    : [...students, entry];
  const oldEmail = idx >= 0 ? students[idx].email : null;

  await setDoc(rosterRef, {
    ...rosterData,
    students: nextStudents,
    retiredEmails: oldEmail ? [...retiredEmails, oldEmail] : retiredEmails
  });

  // Before handing a child a code, prove the new account actually works.
  // workerAuth is still signed in AS that student, so this reads their profile
  // exactly the way their own browser will — if security rules or a failed
  // write would break their login, we find out here instead of at the desk of
  // a confused 9-year-old.
  const check = await withTimeout(getDoc(doc(workerDb, "users", cred.user.uid)), 15000, "The new account");
  await signOut(workerAuth);
  if (!check.exists()) {
    throw new Error("The new login was created but its profile couldn't be read back — check the Firestore security rules, then try again.");
  }

  return {
    uid: cred.user.uid, name: student.name, email, password,
    // idx < 0 means the class list didn't hold an entry for this student's old
    // account, so the new one was added rather than swapped in. Worth a look:
    // the name may now appear twice in the login dropdown.
    rosterMismatch: idx < 0
  };
}
