// ============================================================
// Weekly game-results leaderboard.
//
// Every completed HUMAN-vs-HUMAN match (never vs-AI) gets one document in
// the `gameResults` collection, tagged with a `weekId` (the Monday date of
// that match's week). The leaderboard page only ever queries the *current*
// week's weekId, so it naturally "resets" the moment a new week (Monday)
// begins — nothing has to be deleted, old weeks just fall out of view.
//
// Collection shape:
//   gameResults/{id} {
//     classId, gameId, gameName, weekId ('YYYY-MM-DD' of that week's Monday),
//     dayId ('YYYY-MM-DD' of the day it was played — used by the daily
//            per-game cap in js/play-limits.js),
//     player1: { uid, name }, player2: { uid, name },
//     winnerUid, winnerName, createdAt
//   }
// ============================================================
import {
  db, collection, addDoc, getDocs, query, where, serverTimestamp
} from "./firebase-init.js";
import { currentDayId, isGameCapped, DAILY_GAME_LIMIT } from "./play-limits.js";

export const GAME_NAMES = {
  "multiple-race": "🏁 Multiple Race",
  "pong": "🏓 Table Pong",
  "race-car-math": "🏎️ Race Car Math",
  "math-bubble-pop": "🫧 Bubble Pop",
  "burst-your-bubble": "💥 Burst Your Bubble",
  "memory": "🧠 Memory Showdown",
  "pindrop": "📍 Pin Drop",
  "break-the-bank": "🏦 Break the Bank",
  "base-attack": "🏰 Base Attack",
  "equations-drop": "💧 Equations Drop",
  "speed-connect-4": "🔴 Speed Connect 4",
};

// ---------- Week boundary: Monday 00:00 -> Sunday 23:59:59 (local time) ----------
export function currentWeekId(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Human-friendly "this week" range for display, e.g. "Jul 21 – Jul 27".
export function currentWeekLabel(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x) => x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

// ---------- Record a completed match ----------
// Call this only when BOTH players are real students (never vs-AI matches).
//
// The daily cap is enforced here rather than in each game, so every game gets
// it for free. If the winner has already had DAILY_GAME_LIMIT counted matches
// of this game today, the match is simply not recorded — they still played it,
// it just doesn't add to the leaderboard.
//
// Returns { recorded: true } or { recorded: false, reason: "daily-limit" | "error" }
// so a game can show a "practice only" note if it wants to. Games that ignore
// the return value keep working exactly as before.
export async function recordGameResult({ classId, gameId, player1, player2, winnerUid, winnerName }) {
  if (!classId || !gameId || !player1?.uid || !player2?.uid || !winnerUid) {
    return { recorded: false, reason: "incomplete" };
  }
  try {
    if (await isGameCapped(classId, winnerUid, gameId)) {
      return { recorded: false, reason: "daily-limit", limit: DAILY_GAME_LIMIT };
    }
    await addDoc(collection(db, "gameResults"), {
      classId, gameId, gameName: GAME_NAMES[gameId] || gameId,
      weekId: currentWeekId(),
      dayId: currentDayId(),
      player1: { uid: player1.uid, name: player1.name || "Player 1" },
      player2: { uid: player2.uid, name: player2.name || "Player 2" },
      winnerUid, winnerName: winnerName || "Player",
      createdAt: serverTimestamp()
    });
    return { recorded: true };
  } catch (err) {
    // Never let a leaderboard write break the game itself.
    console.error("Couldn't save game result:", err);
    return { recorded: false, reason: "error" };
  }
}

// ---------- Fetch + aggregate this week's results for a class ----------
export async function getWeeklyResults(classId) {
  const weekId = currentWeekId();
  const q = query(collection(db, "gameResults"), where("classId", "==", classId), where("weekId", "==", weekId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Per-game leaderboards: { [gameId]: { gameName, matches, standings: [{uid,name,wins}] (top 3) } }
export function aggregateByGame(results) {
  const byGame = {};
  for (const r of results) {
    if (!byGame[r.gameId]) byGame[r.gameId] = { gameName: r.gameName, wins: {}, matches: 0 };
    const g = byGame[r.gameId];
    g.matches++;
    if (!g.wins[r.winnerUid]) g.wins[r.winnerUid] = { name: r.winnerName, wins: 0 };
    g.wins[r.winnerUid].wins++;
  }
  const out = {};
  for (const [gameId, g] of Object.entries(byGame)) {
    const standings = Object.entries(g.wins)
      .map(([uid, v]) => ({ uid, name: v.name, wins: v.wins }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 3);
    out[gameId] = { gameName: g.gameName, matches: g.matches, standings };
  }
  return out;
}

// Overall "most wins this week" across every game combined (top 3).
export function aggregateOverall(results) {
  const wins = {};
  for (const r of results) {
    if (!wins[r.winnerUid]) wins[r.winnerUid] = { name: r.winnerName, wins: 0 };
    wins[r.winnerUid].wins++;
  }
  return Object.entries(wins)
    .map(([uid, v]) => ({ uid, name: v.name, wins: v.wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 3);
}
