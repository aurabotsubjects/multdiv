// ============================================================
// AI Opponent engine — a "semi-AI" stand-in for Player 2 (or Player 1) when a
// student doesn't have a partner. Teacher/student picks a difficulty; the bot
// answers its own questions on a randomized human-like delay, at an accuracy
// rate that matches the difficulty, using the SAME generateQuestion() engine
// as everyone else (so it feels like a fellow student, not a scripted robot).
//
// Usage in a game:
//   import { createAIOpponent, scheduleAIAnswer } from "../js/ai-opponent.js";
//   const bot = createAIOpponent('medium');       // { uid, name, level, isAI, profile }
//   // ...generate a question the normal way for bot.level...
//   const cancel = scheduleAIAnswer(bot, question, (isCorrect, value) => { ... });
//   // call cancel() if the question changes / the game resets before it fires
// ============================================================

export const AI_PROFILES = {
  easy: {
    key: "easy",
    label: "Rookie Bot",
    emoji: "🟢",
    level: 3,          // ×4 facts — small, friendly numbers
    accuracy: 0.84,
    minMs: 2000,
    maxMs: 4000,
  },
  medium: {
    key: "medium",
    label: "Racer Bot",
    emoji: "🟡",
    level: 10,          // ×11 facts
    accuracy: 0.86,
    minMs: 1750,
    maxMs: 3500,
  },
  hard: {
    key: "hard",
    label: "Champion Bot",
    emoji: "🔴",
    level: 21,          // ÷9 facts, i.e. genuinely tough
    accuracy: 0.90,
    minMs: 1500,
    maxMs: 3050,
  },
};

// Returns a player-shaped object that can slot in anywhere a logged-in
// student profile ({ uid, name, level }) is used.
export function createAIOpponent(difficulty) {
  const profile = AI_PROFILES[difficulty] || AI_PROFILES.medium;
  return {
    uid: "ai-" + profile.key,
    name: `${profile.emoji} ${profile.label}`,
    level: profile.level,
    isAI: true,
    difficulty: profile.key,
    profile,
  };
}

// Simulates the AI "solving" a question that was generated the normal way
// (via generateQuestion(bot.level) elsewhere in the game). Calls back with
// (isCorrect, submittedValue) after a randomized delay. Returns a cancel()
// function — call it if the question changes or the game resets before the
// delay elapses, so a stale answer doesn't get submitted late.
export function scheduleAIAnswer(aiPlayerOrProfile, question, callback) {
  const profile = aiPlayerOrProfile.profile || aiPlayerOrProfile;
  const delay = profile.minMs + Math.random() * (profile.maxMs - profile.minMs);
  const willBeCorrect = Math.random() < profile.accuracy;

  let value = question.answer;
  if (!willBeCorrect) {
    const offsets = [-3, -2, -1, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const off of offsets) {
      const candidate = question.answer + off;
      if (candidate >= 0 && candidate !== question.answer) {
        value = candidate;
        break;
      }
    }
  }

  const timer = setTimeout(() => callback(value === question.answer, value), delay);
  return () => clearTimeout(timer);
}

// For multiple-choice / tap-a-button games (e.g. Pong): picks one of the
// options actually on screen after a simulated delay, instead of an
// arbitrary numeric offset. Guarantees a wrong pick is still one of the
// real choices, never an off-list value.
export function scheduleAIChoice(aiPlayerOrProfile, correctValue, options, callback) {
  const profile = aiPlayerOrProfile.profile || aiPlayerOrProfile;
  const delay = profile.minMs + Math.random() * (profile.maxMs - profile.minMs);
  const willBeCorrect = Math.random() < profile.accuracy;
  let value = correctValue;
  if (!willBeCorrect) {
    const wrongOnes = options.filter((o) => o !== correctValue);
    if (wrongOnes.length) value = wrongOnes[Math.floor(Math.random() * wrongOnes.length)];
  }
  const timer = setTimeout(() => callback(value === correctValue, value), delay);
  return () => clearTimeout(timer);
}
