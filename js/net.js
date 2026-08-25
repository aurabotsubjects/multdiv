// ============================================================
// Shared error handling for anything that talks to Firebase.
//
// Two hard lessons are baked in here:
//
// 1. Signing in is TWO steps — Firebase Auth checks the password, then we
//    read the student's profile out of Firestore. If step 2 fails, the
//    student sees a login that doesn't work, and it is NOT a password
//    problem. Reporting every failure as "wrong password" sends teachers off
//    resetting accounts that were never broken.
//
// 2. Firestore streams over a long-lived connection that some school
//    networks, proxies and content filters quietly block. When that happens
//    the SDK doesn't fail — it retries forever, so a button just does
//    nothing. Everything here is therefore wrapped in a timeout.
// ============================================================

// Reject if a Firebase call hasn't answered in time, instead of hanging.
export function withTimeout(promise, ms = 15000, label = "The server") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const err = new Error(`${label} didn't answer in time.`);
        err.code = "app/timeout";
        reject(err);
      }, ms)
    )
  ]);
}

// Turn any Firebase error into something a 9-year-old (or a teacher) can act
// on. The raw code is appended for anything unexpected — that's what makes a
// support conversation possible instead of "it just doesn't work".
export function describeError(err) {
  const code = err?.code || "";
  const msg = err?.message || "";

  if (msg === "account-reset") return "Your teacher has reset your login — ask them for your new code.";
  if (msg === "must-change-password") return "You still need to set your own password — do that on the main login screen first.";
  if (msg === "profile-missing") return "Your account is missing its details. Tell your teacher — they'll need to reset your login.";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That password didn't match — check it and try again.";
    case "auth/invalid-email":
      return "There's a problem with this account. Tell your teacher.";
    case "auth/user-disabled":
      return "This account has been turned off. Tell your teacher.";
    case "auth/too-many-requests":
      return "Too many tries in a row — wait a minute, then try again.";
    case "auth/weak-password":
      return "That password is too short — use at least 6 characters.";
    case "auth/requires-recent-login":
      return "You've been logged in too long to change your password — log in again first.";
    case "auth/network-request-failed":
    case "app/timeout":
    case "unavailable":
    case "deadline-exceeded":
      return "Can't reach the game server right now. Check the wifi and try again — if it keeps happening on this device, tell your teacher.";
    case "permission-denied":
      return "The server wouldn't allow that. Teacher: check the Firestore security rules in the README.";
    default:
      return `Something went wrong${code ? ` (${code})` : ""} — try again, and tell your teacher if it keeps happening.`;
  }
}
