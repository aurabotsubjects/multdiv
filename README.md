# Times Tables Race

A classroom web app with real accounts: you (admin) create teachers, teachers
create students, students log in and practise with a friend, then take a
1-minute test that notifies the teacher when they're ready to level up.

## What's new in this version

- **Real accounts** via Firebase Authentication — admin, teacher, and student
  roles, with actual password verification done securely by Firebase (not by
  our own code).
- **25-level progression** instead of just times tables 2–12:
  - Levels 1–11: ×2 through ×12
  - Level 12: Mixed multiplication (×2–×12 at random)
  - Levels 13–23: ÷2 through ÷12
  - Level 24: Mixed division
  - Level 25: Mixed everything (multiplication **and** division)
- **No manual setup in-game** — every game and the test now reads the logged-in
  student's name and level automatically. For 2-player games, Player 2 also
  logs in (their own name + password) right there on the game screen, so the
  game always uses *each* player's own level, not a shared one.

## Student passwords (updated)

Passwords are no longer typed in by the teacher, and no adult ever needs to
know a student's password.

**Creating students.** Adding a student generates a unique random *one-time
code* (`js/passwords.js`) — two short words plus two digits, e.g.
`bravekiwi38`: easy for a child to type, impossible for a classmate to guess.
The codes appear once in a dashed gold card on the roster, with a **Print
slips** button that lays them out two-up for cutting up. They aren't saved
anywhere, so print them before leaving the page. There's also an "Add a whole
class at once" box that takes one name per line.

**First login.** The code only works once. The first time a student signs in,
the app makes them choose their own password before it will let them into the
game menu. From that moment the printed slip is worthless — so a slip left on
a desk, or a code read out loud, doesn't give anyone a way in.

**Forgotten passwords.** The 🔑 **Reset password** button on each roster row
does the whole job in one click: it issues the student a fresh one-time code,
shown on screen to hand over quietly. Their old password stops working
immediately, and they'll be asked to choose a new private one when they next
log in. Their name, class and level all carry across.

### How the reset works (and why it looks odd in the Firebase console)

A browser can only change a password three ways: know the current one, click
an emailed reset link, or use the Admin SDK on a server. A teacher has none of
those — and the console's "Reset password" sends an email to the student's
*made-up* address, so it goes nowhere. That's a dead end, not a setup problem.

So the app doesn't change the old login — it replaces it:

1. A brand-new Auth account is created with a new invisible email and the new
   one-time code, carrying over the student's name, class and level.
2. The class roster is repointed at the new account, so the login dropdown
   picks it up automatically.
3. The old profile is marked `retired`, and `studentLogin()` refuses to let a
   retired account in — so the old password is dead even though Firebase Auth
   still technically recognises it.

Side effects worth knowing:

- Retired Auth accounts pile up invisibly in **Authentication → Users** (their
  emails end in `-r123@students.ttrace.app`). Harmless; delete them there
  whenever you feel like tidying up.
- A reset gives the student a new internal id, so any leaderboard wins they'd
  already banked *that week* stay under the old id and won't merge with their
  new ones. Resetting on a Monday avoids this entirely.
- The existing security rules in this README already permit all of it — no
  rule changes needed.

**Students created before this change** keep their old passwords and aren't
asked to pick a new one. Hit 🔑 Reset password on each of them once to move
everyone onto the new system.

## Daily limit on leaderboard matches

To stop a single game being farmed for easy wins, only the first
**2 matches of the same game per student per day** count towards the weekly
leaderboard. Beyond that the game still opens and plays normally — the result
just isn't recorded.

- The number lives in `DAILY_GAME_LIMIT` in `js/play-limits.js`. Change that
  one constant to loosen or tighten it.
- The rule is enforced inside `recordGameResult()` in `js/results.js`, so
  every game gets it without any per-game changes.
- The count covers every match a student took part in that day, win or lose,
  so playing "for" a friend doesn't get around it.
- The game menu shows each card's remaining ranked games for today, or
  "Practice only today" once they're used up.
- Each `gameResults` document now carries a `dayId` (`YYYY-MM-DD`) alongside
  `weekId`. Results written before this change have no `dayId` and simply
  don't count towards the daily total.

## How the accounts work

1. **Teachers request their own account** at `teacher-signup.html` — name,
   email, and a password they choose themselves. This creates their account
   right away, but it sits **pending** until approved.
2. **You (admin)** sign in at `admin.html` and see a list of pending teacher
   requests. **Approve** or **deny** each one with a click — no need to invent
   passwords for anyone.
3. Once approved, the **teacher** signs in at `teacher.html` with the email +
   password they chose during signup, creates classes (a name + a class code
   like `ROOM12`), and adds students to a class (name + password — the class
   code is shared automatically). Teachers see the roster, each student's
   level, and approve/hold level-ups when a perfect test score comes in.
4. **Students** go to `index.html`, type their class code, pick their name
   from a dropdown, enter their password, and land on the game menu — no
   typing their table or name into any game.
5. **2-player games**: Player 1 is already logged in from the menu. When the
   game loads, it asks "Player 2" to log in the same way (name + password)
   right there on the game screen. Both players' own levels are used for
   their own questions.

### Why this is a bit different from typical school-app logins

There's no backend server here — just static files (for GitHub Pages) and
Firebase. To make real password checking possible without one, every
student/teacher is a genuine Firebase Auth user behind the scenes:

- Students don't have real email addresses, so we invent one from their class
  code + name (e.g. `room12.maya@students.ttrace.app`) purely so Firebase Auth
  has something to key off. They never see or type this — just their name and
  password.
- Teachers sign themselves up directly (real account, created instantly) but
  we add a `status: "pending"` field to their profile, and `teacher.html`
  refuses to let them past login until you flip that to `"approved"` from
  `admin.html`. No password ever has to pass through your hands.
- Creating a **student** account (a teacher making one for their class) uses a
  **second, independent Firebase session** behind the scenes (`js/firebase-init.js`
  calls it the "worker" app) so that creating someone else's account doesn't
  log the teacher out of their own.
- The same trick lets **Player 2 log in on the worker session** while Player 1
  stays logged in on the main one — that's how two students can both be
  "logged in" on one device at once.

This gives you real, Firebase-verified passwords with no server to run or pay
for (Auth + Firestore are both free on Firebase's Spark plan).

## Setting up Firebase (do this once)

1. Go to https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database** → start in test mode for now.
4. **Project settings → Your apps → </> (web)** → register the app → copy the
   `firebaseConfig` object.
5. Paste those values into `js/firebase-init.js`, replacing the placeholder
   `YOUR_...` strings.
6. Create the **one admin account** (this is the only manual step):
   - In **Authentication → Users → Add user**, add yourself with an email + password.
   - In **Firestore → Start collection**, create `users` → document ID =
     that user's UID (copy it from the Authentication tab) → add fields
     `role: "admin"` (string) and `name: "Your Name"` (string).
   - That's it — sign in at `admin.html` from now on to approve teacher requests.

## Firestore security rules

Once you're happy with how things work, replace the default rules
(**Firestore → Rules**) with something like this — it enforces that teachers
can only see/edit their own classes and students, and students can only see
their own profile:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function myRole() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role; }
    function myUid() { return request.auth.uid; }

    match /users/{uid} {
      allow read: if isSignedIn() && (myUid() == uid || myRole() in ['teacher','admin']);
      allow create: if isSignedIn() && (
        // a teacher signing themselves up — must start out pending, can't self-approve
        (myUid() == uid && request.resource.data.role == 'teacher' && request.resource.data.status == 'pending') ||
        // a teacher creating a student in one of their own classes
        (request.resource.data.role == 'student' && myRole() == 'teacher' &&
          get(/databases/$(database)/documents/classes/$(request.resource.data.classId)).data.teacherId == myUid())
      );
      allow update: if isSignedIn() && (
        myUid() == uid ||
        myRole() == 'admin' || // admin approving/denying a teacher request
        (myRole() == 'teacher' && get(/databases/$(database)/documents/classes/$(resource.data.classId)).data.teacherId == myUid())
      );
    }

    match /classes/{classId} {
      allow read: if true; // class-code lookup happens before login
      allow create: if isSignedIn() && myRole() == 'teacher';
      allow update: if isSignedIn() && resource.data.teacherId == myUid();
    }

    match /classRosters/{classId} {
      allow read: if true; // public so the name dropdown works pre-login
      allow write: if isSignedIn() && get(/databases/$(database)/documents/classes/$(classId)).data.teacherId == myUid();
    }

    match /notifications/{id} {
      allow create: if isSignedIn();
      allow read, update: if isSignedIn() && myRole() == 'teacher';
    }

    match /testResults/{id} {
      allow create: if isSignedIn();
      allow read: if isSignedIn() && myRole() == 'teacher';
    }

    match /gameResults/{id} {
      // One doc per completed 2-player (human vs human) game — powers the
      // weekly leaderboard. vs-AI matches are never written here at all.
      allow create: if isSignedIn();
      allow read: if isSignedIn();
    }

    match /settings/{id} {
      // AI opponent accuracy/speed per game, set from the teacher Settings
      // page. Every signed-in user (including students) needs to read this
      // so their games know how to configure the bot; only teachers/admins
      // can change it.
      allow read: if isSignedIn();
      allow write: if isSignedIn() && myRole() in ['teacher', 'admin'];
    }
  }
}
```

This is solid for a classroom app, not bank-grade — the tradeoffs (student
names+made-up emails are publicly readable so the login dropdown can work) are
called out inline above.

## Deploying to GitHub Pages

1. Push this whole folder to a GitHub repo.
2. In the repo, **Settings → Pages → Deploy from a branch** → pick `main` and `/ (root)`.
3. Your app will be live at `https://yourusername.github.io/yourrepo/`.
   Share `.../index.html` with students and `.../teacher.html` with teachers.
4. One extra step for Firebase Auth: in the Firebase console, **Authentication
   → Settings → Authorized domains**, add your `github.io` domain.

## Games — current status

Fully wired into the new account/level system, ready to test:

- ✅ **Multiple Race** (`games/multiple-race.html`) — pass-and-play board race
- ✅ **Table Pong** (`games/pong.html`) — landscape 2-player pong with quiz-gated paddles
- ✅ **Race Car Math** (`games/race-car-math.html`) — real-time racing, both players answer simultaneously; converted from your uploaded file as the template for the rest

Uploaded but **not yet converted** (still using their own old manual
name/table setup screens, not yet hooked into logins/levels — placeholders on
the menu for now, marked "Coming soon"):

- Math Bubble Pop
- Burst Your Bubble
- Memory Showdown
- Pin Drop
- Break the Bank
- Base Attack
- Equations Drop
- Speed Connect 4

### The conversion pattern (for the remaining 8)

Race Car Math is the reference example — here's exactly what changed, so the
rest can follow the same recipe:

1. Change the game's `<script>` tag to `<script type="module">` and add:
   `import { levelInfo, generateQuestion } from "../js/levels.js";`
   `import { getClassRoster, studentLoginSecondPlayer } from "../js/auth.js";`
2. Replace the manual "pick your table" setup UI with: a read-only line
   showing Player 1's name + `levelInfo(level).label` (from `sessionStorage`),
   and a small Player 2 login form (name dropdown from `getClassRoster`,
   password, a button that calls `studentLoginSecondPlayer`).
3. Find wherever the game generates a question (usually `a * b` using a
   locally-picked "table" number) and replace it with
   `const q = generateQuestion(player.level); /* use q.text and q.answer */`.
4. Update any "×N table" labels/messages to use `levelInfo(level).label`
   instead, since levels can now be division or mixed too.

Want me to keep going and convert the next one or two right now? Happy to work
through the list — just say which to prioritize, or I'll go in the order
above.

## Design notes / tradeoffs worth knowing about

- **Games don't currently save practice results to Firebase** — only the
  1-minute test does (since that's what drives level-ups). Easy to add
  match-history logging later if you want it.
- **Class codes are public** (readable without logging in) so the student
  login dropdown can work before anyone's authenticated. Same for student
  names + their made-up emails. Passwords are never exposed — those are
  checked by Firebase Auth itself.
- If two students in the same class share an exact name, the second one gets
  a small random suffix added to their internal (invisible) email so accounts
  don't collide — nothing students see or type changes.
