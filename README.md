# 🤠 Five-Card Draw — Wild West Poker

**A free browser card game for 2–6 players. Ante up, draw up to 3 cards, one round of betting, best hand takes the pot.**

Play it right now — no sign-up, no download, no cost. PC and mobile. Free play chips only — no real money, no accounts, no database.

**v1.1** — every hand opens with an explicit ante round (fastest click sets the entry amount; top up to enter or spectate), staged chip betting with a Bet Ready button, spectators auto-offered entry next hand, a 10-second rejoin with a 3-quick-quit room ban, calmer bots, and card deal/draw animations.

## The game

Each player gets **5 cards** and **5000 free chips**. Every hand opens with an **ante round** — the fastest click sets the entry amount (10 / 100 / 500 / 1000), everyone else tops it up to enter or spectates that hand. Then each player may exchange **0–3 cards** once (discards go to the **bottom** of the deck, replacements come off the **top**). Then **exactly one round of betting** — Fold, Call, Raise or All-in — and the best 5-card hand takes the pot. No community cards, no cards in the middle.

### Hand rankings

| Hand | Example |
|---|---|
| Royal Flush | A-K-Q-J-10, same suit |
| Straight Flush | Five in a row, same suit |
| Four of a Kind | Four of the same rank |
| Full House | Three of a kind + a pair |
| Flush | Five of the same suit |
| Straight | Five in a row (A-2-3-4-5, the wheel, counts) |
| Three of a Kind | Three of the same rank |
| Two Pair | Two different pairs |
| One Pair | Two of the same rank |
| High Card | Nothing — highest card wins |

### How a hand works

1. **Ante round (every hand, explicit):** the **fastest click wins** — tap **10 / 100 / 500 / 1000** to set the entry amount for this hand. Everyone else must **top up that amount to enter**; anyone who doesn't stays a **spectator for that hand** and is automatically offered entry again at the next ante round (no leaving and rejoining). If **nobody enters**, the round is **dead** — no cards are dealt, and the ante is set again (try a lower amount). A player with fewer chips than the ante goes all-in for what they have. At 0 chips you are busted and may **Rebuy** 5000 free chips between hands. Anyone can **leave the match at any time** with the Leave button.
2. **Deal:** 5 cards each from a single 52-card deck, dealer button rotates clockwise every hand.
3. **Draw (once per hand, starting left of the dealer):** tap **0–3 cards** to exchange, then confirm (0 = stand pat). Your discards go to the **bottom** of the deck and your replacements come off the **top**. Only the count is logged ("Ana discarded 2") — never the ranks.
4. **Betting (exactly one round, after all draws, first to act left of the dealer):**
   - **Call** — match the bet to stay in. When nothing has been bet yet, Call reads **Check**.
   - **Raise** — match it plus extra. Minimum raise is 10 chips or the size of the last raise, whichever is bigger.
   - **All-in** — bet everything you have left.
   - **Fold** — give up your hand and your chips in the pot.
   
   A player who just raised **can't raise again over their own raise** — they must wait until somebody else raises first (they can still fold, call, check, or all-in for the call amount). An all-in that increases the bet counts as a raise for this rule. Betting ends when everyone left has matched the bet, or only one player remains.
5. **Chips — stage, then confirm:** clicking a chip or dragging it (**10 / 100 / 500 / 1000**) only **stages** it in your bet tray — nothing leaves your stack yet. Stack as many as you like (1000 + 500 + 100 = 1600 is easy), click a staged chip to **take it back**, then press **✅ Bet Ready** to commit. The tray tells you live what the staged bet means ("Call 200", "Raise to 700", "All-in", or what's missing, e.g. "120 more to cover the call"). A staged bet that doesn't cover the call, or a raise below the minimum raise, is **rejected with a reason** and the staged chips stay in place to fix — never silently adjusted. The Fold / Call / Raise / All-in buttons always work too (Raise routes through the same staged-bet path).
6. **Showdown:** the last player to raise shows first, then clockwise. If everyone else folds, the survivor takes the pot without showing. Ties split the pot; any odd chip goes to the earliest winner clockwise from the dealer. **Side pots** are worked out properly when someone is all-in for less.

### The three betting terms — a correction

The owner asked to be corrected if the terms were wrong. They were almost right:

- **Call** = match the bet to stay in — correct. (When nothing has been bet yet, it's a **Check**.)
- **Raise** = match it plus extra — correct.
- **All-in** = bet everything — correct.
- **Plus Fold**, which is also needed: without it, a player who doesn't want to pay could never leave the hand. So the game has four betting buttons: **Fold, Call/Check, Raise, All-in**.

## Interpretations (where the rules as given left a gap)

These are the calls made while building; they are also stated in the in-game Rules:

1. **Who sets the ante:** "the first player to set the ante" is literal — every hand opens with an ante round, and **whoever clicks an amount first locks it** for that hand (10 / 100 / 500 / 1000). There is no lobby-level ante any more; the old lobby/bot-game ante picker was removed in v1.1. Bots propose 10 if no human proposes within ~3s.
2. **Short-stack ante:** a player with fewer chips than the ante pays what they have and is all-in for the hand (they can still win up to their contribution via side pots).
3. **Busted players sit out:** a player at 0 chips sits out the hand (no cards, no ante) and may Rebuy 5000 free chips between hands — or keep spectating.
4. **Draw order:** draws run clockwise starting left of the dealer, one player at a time (not simultaneous), so the deck order is unambiguous.
5. **Discards to the bottom:** discarded cards go to the bottom of the deck in the order they were picked (highest slot first, as stored) and are not reshuffled back in during the hand.
6. **Short all-in raise:** an all-in that increases the bet by less than the minimum raise still counts as a raise for the no-double-raise rule (it becomes the last raiser), but it does not change the minimum-raise size.
7. **Win streaks mean nothing:** win streaks are display-only (the log shows them). They have **no** connection to any secret rule — v1.0 briefly tied them to one, and v1.1 removed that entirely (see "Hidden rules" below for the real trigger).
8. **Spectators are players-in-waiting:** anyone who doesn't top up the ante, joins mid-hand, or returns after the 10s grace is a spectator **for that hand only** and is automatically offered entry at the next ante round — just stay on the screen, no leaving and rejoining. The only exceptions are banned clients (below) and voluntary leavers, who are out of the room entirely.
9. **Disconnects and the troll ban:** a seat is held **10 seconds** for a reconnect with the same clientId. Back in time = resume the seat. Back late = plain withdrawal (hand shuffled back into the deck, seat lost) and a return as a spectator. A **quick disconnect-reconnect cycle** (back inside 10s) counts toward a ban only if the player then disconnects again **without completing a full hand in between** — three such cycles in a row in the same room = **banned from rejoining that room for its lifetime**. A genuine dropout that stays away past 10 seconds never counts toward the three.
10. **Staged bets are local until committed:** staging chips touches no engine state — a staged-then-cancelled bet leaves the stack untouched, trivially, because no engine call was made. Only the confirmed Bet Ready (or Raise) call is validated, and a rejected amount leaves the staged chips in place.
11. **Bots play lower, like cautious humans:** bots propose the small ante (10), enter cheap antes (≤ 100) and decline 500+ antes (which is what makes dead rounds possible). In betting they prefer min-raises and small raises (capped: min raise, or twice it up to 100 extra with four of a kind or better), go all-in only with four of a kind or better (or trips+ when short-stacked at ≤ 500), and fold weak one-pair hands to large raises. They never shoot and never drink (whiskey is human-local anyway).

## How to play

| Button | What it does |
|---|---|
| **Create lobby** | Pick how many bots to add (0–5), then choose **Private** (code-only) or **Public** (listed) and a **max players** (2–6, bots included). You get a 4-letter code + shareable link (`?room=CODE`). Players join; you press Start with 2–6 total. The ante is set fresh each hand — fastest click wins. |
| **Join lobby** | Enter a friend's lobby code. |
| **Browse public rooms** | Shows open public lobbies (host, code, players / max, bots, waiting/playing). **Tap one to join** — there is never any automatic matchmaking or auto-join. |
| **Play vs bots** | Pick 1–5 bots. Fully local, works offline. |

A lobby link also works: open `https://<your-site>/?room=KQ7B` and the code is filled in for you.

### Public rooms — how the list works (no server)

The list is PeerJS-only, same $0 approach as the rest of the game:

- A public-room host **also claims one directory slot**: a fixed PeerJS peer ID `poker-directory-v1-1` … `poker-directory-v1-10` (first free one wins).
- Your browser **asks all 10 slots** and shows the rooms that answer with `{code, hostName, players, maxPlayers, bots, status}`. A slot with no answer is skipped.
- The host **unregisters when the game starts or the room closes**, so the list only shows lobbies still waiting for players. (A game already in progress can still be joined by code — as a spectator; see below.)
- **Limits, stated honestly:** the list depends on hosts being online — if the directory doesn't answer, the page says so ("couldn't load the list — join with a code instead") and code-join still works. With 10 slots, at most 10 public rooms can be listed at once. There is no auto-join and no Play Anyone button, by design.

### Max players

The host sets the max (2–6) when creating the lobby. Bots count toward it: the create screen won't let you pick a max below host + bots, and the host **rejects joins when full** (the joiner gets a "room is full" message). The lobby screen always shows `players / max`.

### Spectating & rejoining

- **Joining a game in progress:** enter the room code as usual — you are **seated at once as a spectator** for the current hand. You see every seat, the pot and the log, but all cards stay hidden (a spectator's view hides every value) and you can't act this hand. A "👀 Spectating — you're up for the next round" panel tells you to stay on the screen: you are **automatically offered entry at the next hand's ante round** (no leaving and rejoining). If the table is full (6 players), you wait as a pure spectator until a seat frees up, then you're seated the same way.
- **Next hand:** when a new hand's ante round opens, every spectator is offered entry — top up the ante to play, sit out to keep watching.
- **Disconnecting mid-hand:** if your connection drops, your seat and cards are held for **10 seconds** while the game waits for you. Your browser retries the same code automatically (same browser id), and if it reconnects in time you resume exactly where you were. After 10 seconds you're **withdrawn** — your hand is shuffled back into the deck, your bets stay in the pot, the turn passes if it was yours, and a later rejoin puts you in as a spectator. If the host's browser closes, the game ends for everyone (host-authoritative, no host migration).
- **Leaving:** the **🚪 Leave match** button (game screen) exits voluntarily at any time — your hand is mucked, your bets stay in the pot, and the seat frees at once (no 10s hold).
- **The troll ban:** quit and slip back in before the 10 seconds **three times in a row** in the same room (with no completed hand in between) and you are **banned from rejoining that room for its lifetime** — the host refuses the join and your screen says so. A genuine dropout that stays away past 10 seconds never counts toward the three.

## Bots

Bots draw and bet by hand strength, at human speed — and play lower, like cautious humans:

- **Ante:** bots propose the small ante (10) if no human proposes within ~3s, enter cheap antes (≤ 100), and decline 500+ antes — which is what makes dead rounds possible.
- **Draw:** keep pairs / trips / quads, keep 4-flush and 4-straight draws, otherwise keep the two highest cards — always discarding 0–3.
- **Betting:** prefer min-raises and small raises (capped: the min raise, or twice it up to 100 extra with four of a kind or better); all-in only with four of a kind or better, or trips+ when short-stacked (≤ 500 chips); fold weak one-pair hands to large raises; call medium hands more than raise them. A bot never raises over its own raise, and never proposes an illegal action.
- **Bot pace (one editable const, `BOT_PACE`, near the top of the UI script):** bots think 1.4–2.0s before acting and pause 1.1–1.4s after drawing. Humans are never delayed — your actions apply instantly.

## Table feel — animations, round table, whiskey

**Card animations (CSS transitions + flight clones, visual only — they never gate the engine):** when a hand is dealt, cards visibly fly from the deck to each player's seat; when a player exchanges, the discarded cards slide away toward the deck and the replacements fly from the deck to the hand (driven off the "X discarded N cards and drew N." log lines, so every player sees every exchange). `prefers-reduced-motion` disables them entirely.

**Round table (landscape / desktop):** in landscape orientation on a screen ≥ 700px wide, the table becomes a round/oval felt table — seats arranged on an ellipse around it (your seat always at the bottom arc), pot and deck in the centre, chip rack below. In portrait (phone upright) the stacked layout stays. The switch is a `matchMedia` listener toggling a `round-table` class; seat math is two pure functions (`layoutModeFor`, `seatPositionsFor`) copied from Wellington's tested layout.

**🥃 Drink Whiskey (local cosmetic fun only):** a "Drink Whiskey" button sits on the menu and game screens — an exact copy of Wellington's cognac logic, renamed. It affects **only your own screen** — never the game state, never other players' screens, never synced over PeerJS. Sips are counted per session ("Sips: 3"). At **5 sips** a mild effect starts — a gentle screen wobble/sway for **3 minutes from the 5th sip**. At **15 sips** a strong effect replaces it — a bigger sway/tilt with a very light blur for **6 minutes from the 15th sip**. Exact rules: sipping while mild leaves the 3-minute timer alone (it runs from the 5th sip); crossing 15 while mild upgrades to strong with a fresh 6-minute timer; sipping while strong adds 30 seconds per sip, capped at 6:00 remaining. A **Sober up** button while an effect is active clears it early (timer reset, sip count kept). The remaining time is shown ("Tipsy — 2:31 left" / "Wasted — 5:12 left"). Playability is a hard requirement: rotation is only a few degrees, blur is very light, cards and buttons stay readable and clickable, the wobble touches only the table/menu (modals, buttons and the log never wobble), and `prefers-reduced-motion` disables it entirely. Thresholds/durations live in one editable const (`WHISKEY`, near the top of the UI script) and the level logic is a pure function (`drunkLevelForSips`) tested headlessly in `test/whiskey.test.js`.

## $0 architecture — how multiplayer is free

There is **no game server**. The whole game is one static file (`index.html`):

- **Hosting:** Cloudflare Pages (free tier) serves the static site.
- **Multiplayer:** peer-to-peer WebRTC via [PeerJS](https://peerjs.com/)'s free public broker (`0.peerjs.com`). Lobby codes are PeerJS peer IDs; actions travel directly between browsers. Nothing about your game is stored anywhere.
- **Host-authoritative, hidden-info safe:** the host holds the true state and validates every action through one `applyAction()` choke point. Each player only ever receives a **filtered view** of the state — their own hand only, opponents' cards as backs (with opaque IDs, so even the card ID can't leak the rank). The deck is count-only; folded hands stay mucked and are never revealed. After every action the host broadcasts fresh filtered views, clients acknowledge, and both sides compare fingerprints every few seconds — a lost message repairs itself instead of desyncing the game.
- **Cost:** $0. No database, no backend to keep awake, no accounts.

Because the game is fully client-side, it also works offline for bot games (once loaded).

## Run it locally

```bash
# any static server works — the game is a single file
python3 -m http.server 8000
# open http://localhost:8000/
```

Tests (engine + bots + whiskey + shootout + UI smoke, no browser needed — the UI test runs the real page in jsdom):

```bash
npm test
# or individually:
node test/engine.test.js    # 132 checks: deck/deal, ante phase (first propose
                            #   locks, top-up / sit-out, dead rounds, streak
                            #   resets), draw 0-3 + discards-to-bottom/
                            #   draw-from-top, betting call/raise/min-raise/
                            #   no-double-raise/all-in/fold/check-when-0-to-
                            #   call/showdown order, evaluator all 10
                            #   categories + tiebreaks + wheel, side pots
                            #   incl. ties, filtered views leak nothing,
                            #   removal/rebuy, disconnect + troll-ban helpers
node test/bot.test.js       # 100 bot-only hands (2-6 players) + 20 bot sessions
                            #   + 23 scripted bot decisions (incl. ante
                            #   propose/enter + conservative betting)
node test/whiskey.test.js   # 20 checks: sip thresholds, labels, durations, wobble
                            #   scoping, prefers-reduced-motion, sober-up
node test/shootout.test.js  # 49 checks: trigger at 3 dead high-ante rounds
                            #   not 2, low-ante dead rounds don't count,
                            #   someone entering resets, different setter
                            #   resets, single shooter gets all, multiple
                            #   shooters split equally, 6-bullet cap, streak
                            #   reset + button clears, victim removal + turn
                            #   repair, hidden from the UI
node test/ui.test.js        # 64 checks (jsdom): ante panel + propose/enter
                            #   through real DOM clicks, staged betting
                            #   (1600 staged, take-back, Bet Ready commit),
                            #   dead-round panel, leave + banned screens exist,
                            #   shootout mash (6 rapid real clicks all land,
                            #   button stable, victim kicked after the 2s
                            #   window) + guest fire-and-forget sends
```

## Deploy to Cloudflare Pages ($0)

**Option A — dashboard (easiest, 2 minutes)**
1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Pick this repo. Framework preset: **None**. Build command: *(empty)*. Output directory: `/` (the repo root — `index.html` is there).
4. Deploy. You get `https://five-card-poker.pages.dev` free.

**Option B — CLI**
```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name five-card-poker
```

**Custom domain (optional):** Pages → Custom domains → add yours. Still free.

## Files

```
index.html            the whole game (engine + UI + multiplayer), single file
test/engine.test.js   engine unit tests (node)
test/bot.test.js      bot stress test: 100 bot-only hands + 20 sessions + scripted decisions (node)
test/whiskey.test.js  whiskey button thresholds + wobble scoping tests (node)
test/shootout.test.js secret-rule tests (node)
test/ui.test.js       UI smoke test: real page in jsdom, ante + staged betting + dead rounds (node)
wrangler.toml         Cloudflare Pages config (Pages needs no config; no Worker)
README.md             this file
LICENSE               MIT
```

## Hidden rules (owner only)

The game contains one secret rule that is deliberately **not** documented in the in-game Rules, How to Play, menu help, or any visible UI text — only code comments describe it, and this section of the README (which players never see in-game) states it once:

- **The ONLY trigger is the entry ante.** If the **same player** sets a **very large entry ante (500 or 1000 chips)** to start the game **three times in a row** and **nobody enters in any of those rounds** — so they are just dead rounds — then every **other human player** in the room (not the setter, not bots, not spectators) gets a red pulsing **"🔫 Shoot'em Dead"** button (fixed bottom corner). Winning hands have **nothing** to do with it — a 5-hand win streak never arms it. A low-ante dead round, someone entering, a different setter, or the setter leaving all reset the count to zero; a hand starting disarms it.
- Each press fires **one bullet**, max **6 presses** per player per armed episode (revolver chambers shown as dots). The button's chambers update in place and the gunshot shakes the table (not the whole screen), so all 6 presses land even when mashed inside the window — rapid taps are never dropped by a re-render or a jumping button. Each shot plays a synthesized gunshot (WebAudio, no audio file), a muzzle flash, and a screen shake, and everyone sees "[Name] fired at [Victim]!". On the **first** shot a **2.0-second window** opens; every player who fired at least once in that window counts as a shooter. At window end the victim is **removed/disconnected** (seat removed, hand mucked, turn repaired, bets already in the pot stay in the pot) and their **remaining chip stack** (chips NOT in the pot) is **split equally among the shooters** (integer division, remainder 1 chip each to the earliest shooters clockwise from the dealer); a lone shooter gets it all. The streak resets, the button disappears. The victim's client shows "You were shot off the table" and returns to the menu. If the victim is a bot, the same removal + split applies. If the victim leaves on their own before the window ends, the shootout is cancelled with no payout. Shots fired after the window closes pay nothing.

## License

MIT — do what you want with it.
