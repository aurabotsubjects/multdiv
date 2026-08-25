// ============================================================
// Student password generation.
//
// Why this exists: passwords used to be typed in by hand on the teacher
// dashboard, which in practice meant everyone got the same easy one and the
// whole class knew it. Now every student gets a *unique* random password
// that nobody can guess from a classmate's.
//
// The passwords are built from short, readable words so a 9-year-old can
// still type them: e.g. "bluefox47". They are shown to the teacher ONCE,
// right after the account is made, and are never stored anywhere — not in
// Firestore, not in this file. Print the slips (or write them down) before
// leaving that screen. If one is lost, see the "Reset a password" steps on
// the teacher dashboard.
// ============================================================

// Deliberately short, unambiguous, easy-to-spell words. No lookalike
// letters at the joins, nothing that reads badly when two are combined.
const ADJECTIVES = [
  "blue", "red", "gold", "fast", "cool", "kind", "bold", "warm", "neat",
  "wild", "calm", "lucky", "sunny", "happy", "brave", "quick", "jolly",
  "smart", "shiny", "green", "silver", "mighty", "sharp", "swift"
];

const NOUNS = [
  "fox", "cat", "dog", "owl", "bee", "jet", "van", "kiwi", "lion", "bear",
  "wolf", "duck", "frog", "crab", "moth", "star", "moon", "rock", "tree",
  "boat", "kite", "drum", "cake", "pear", "bolt", "wave", "comet", "tiger"
];

// crypto.getRandomValues is available in every browser this app supports and
// is genuinely unpredictable — Math.random() is not, and a determined student
// with a browser console could otherwise replay the sequence.
function randomInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pick(list) {
  return list[randomInt(list.length)];
}

// e.g. "bravekiwi38" — 2 words + 2 digits. Comfortably over Firebase's
// 6-character minimum, and roughly 1 in 400,000 to guess.
export function generatePassword() {
  const digits = String(randomInt(90) + 10); // 10–99, never a leading zero
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${digits}`;
}

// Generate `count` passwords that are all different from each other.
export function generatePasswords(count) {
  const out = new Set();
  while (out.size < count) out.add(generatePassword());
  return [...out];
}
