// ============================================================
// Daily per-game cap on leaderboard matches.
//
// Why: one student worked out that a particular game could be won very
// quickly, and farmed it dozens of times to sit on top of the weekly
// leaderboard. This caps how many matches of the SAME game can count
// towards the leaderboard for one student in one day.
//
// Important: this does not stop anyone playing. Students can play any game
// as often as they like — once they've used up their counted matches for
// that game today, further matches are simply practice and don't add wins.
// That removes the incentive to farm without taking the fun away.
//
// The count is per student, per game, per calendar day, and covers every
// match they took part in (win or lose), so playing "for" a friend doesn't
// dodge it either.
// ============================================================
import { db, collection, getDocs, query, where } from "./firebase-init.js";

// How many matches of the same game count towards the leaderboard per day.
// Change this one number to loosen or tighten the rule.
export const DAILY_GAME_LIMIT = 2;

// Local calendar day, e.g. "2026-08-25".
export function currentDayId(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// All of today's recorded matches for a class. Two equality filters only,
// so no composite index is needed (see the note in js/db.js).
async function todaysResults(classId) {
  const q = query(
    collection(db, "gameResults"),
    where("classId", "==", classId),
    where("dayId", "==", currentDayId())
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// -> { [gameId]: numberOfCountedMatchesToday } for one student.
export async function getTodaysCounts(classId, uid) {
  if (!classId || !uid) return {};
  try {
    const counts = {};
    for (const r of await todaysResults(classId)) {
      if (r.player1?.uid !== uid && r.player2?.uid !== uid) continue;
      counts[r.gameId] = (counts[r.gameId] || 0) + 1;
    }
    return counts;
  } catch (err) {
    // If the lookup fails, don't punish the student — just don't cap.
    console.error("Couldn't check today's play counts:", err);
    return {};
  }
}

// Has this student used up today's counted matches for this game?
export async function isGameCapped(classId, uid, gameId) {
  const counts = await getTodaysCounts(classId, uid);
  return (counts[gameId] || 0) >= DAILY_GAME_LIMIT;
}
