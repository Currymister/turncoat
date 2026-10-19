# Turncoat

A Traitors-style social deduction game for phones. Everyone plays in their own browser, so nobody has to download an app: share a link or a 6-letter code and you're in.

"Turncoat" is a placeholder name. Change it in `client/src/config.js` and `client/index.html`.

## What's in release 1

- Friend games by code or invite link, 4–22 players (4+ in person, 5+ remote)
- In person (talk at the table) or remote (text chat round table)
- Run by the app, or by a non-playing Host who controls the pace and picks Traitors
- Quick, standard and slow-burn pacing (slow-burn moves on when everyone taps Ready)
- Four mission types: photo hunt with secret objects, vault code, scavenger hunt, secret word
- Night puzzles for everyone, with the Traitors' conclave hidden behind an identical "Notes" tab
- Murders, shields, recruitment and ultimatums, breakfast arrivals in small groups
- Finger-written voting slates, revealed one at a time; revotes and tie-breaks
- Warm-up day for groups of 4–6
- The endgame: unanimous "end the game" or banish again, roles hidden until the final reveal
- Prize pot, the Traitors' hidden stash and final placings

## Put it online (about 15 minutes, free)

You need a free GitHub account and a free Render account.

1. **Put the code on GitHub.** Go to github.com, click **New repository**, name it `turncoat`, and create it. On the new repo page, click **uploading an existing file** and drag in everything from this folder (not a `node_modules` folder, if you have one). Click **Commit changes**.
2. **Create the service on Render.** Go to render.com and sign in with GitHub. Click **New**, then **Blueprint**, and pick your `turncoat` repo. Render reads `render.yaml` and sets everything up. Click **Apply**.
3. **Wait for the first build** (2–4 minutes). When it says **Live**, open the address Render gives you, something like `https://turncoat-xxxx.onrender.com`.
4. **Play.** Open that address on your phone, tap **Start a game**, and share the invite link with your friends.

To change the game later, edit the files on GitHub (or push from your computer). Render rebuilds automatically.

### Things to know about Render's free plan

- It goes to sleep after 15 minutes with no visitors. The first person to open it afterwards waits about a minute while it wakes. Open the link a minute before your game night starts.
- Games are kept in memory. If the server restarts or sleeps, games in progress are lost. Evening games are fine because open phones keep it awake. **Slow-burn games over several days need a paid, always-on plan**, or the server will fall asleep overnight and lose the game.
- 750 free hours a month is enough to keep one game server running all month.

## Run it on your own computer

You need Node.js 20 or newer (nodejs.org).

```
npm install
npm run build
npm start
```

Open http://localhost:3001. To test with friends on the same wifi, use your computer's local IP address instead of `localhost`.

While changing the code, `npm run dev` rebuilds the app on every save (refresh the page to see changes).

## Test it

```
npm test
```

This plays 24 complete games with simulated players over real connections (in person, remote, host mode, slow-burn, 4 to 14 players), checks every rule, and fails if any phone is ever sent a role it shouldn't see.

## Working on it with Claude Code in VS Code

Open this folder in VS Code, start Claude Code, and ask for changes in plain English, for example "add a new photo prompt to the pub pack" or "make the night 4 minutes in quick mode". Then run `npm test` before you push.

## Where things live

| File | What it does |
| --- | --- |
| `server/game.js` | All the rules, and what each phone is allowed to see (`viewFor`) |
| `server/content.js` | Photo prompts, secret objects, scavenger items, secret words, puzzles |
| `server/index.js` | Web server and live connections |
| `client/src/screens/` | Every screen of the phone app |
| `client/src/styles.css` | Colours, type and layout |
| `scripts/bots.js` | The automated game tests |

Phase lengths for each pacing setting are at the top of `server/game.js` (`PACING`).

## Next up (from the design doc)

- Release 2: video round tables, AI photo checks, push notifications for slow-burn, saved friend groups and stats, saving games so they survive restarts
- Release 3: accounts, random-group matchmaking and moderation, seasons and badges
- Release 4: prizes, after legal checks
