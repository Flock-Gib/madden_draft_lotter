# Flockville Draft Lottery

A static web application for running the Flockville Madden League draft lottery.

## Features

- 3-2-1 lottery-ball system
- Picks #1 through #8 lottery by default
- Bottom-four protection
- Top-3 cooldown
- No consecutive #1 pick
- Traded pick ownership
- Animated live drawing
- Discord-ready results
- Lottery transparency panel with team-by-team balls, odds %, and tier subtotals
- Trade list builder with Discord-ready copy export
- **Required trades** — after each draw the app lists ordered pick swaps needed to turn the pre-lottery ownership order into the lottery ownership order; one click adds them to the trade list
- **Past Lotteries** — every completed lottery is saved by season year (date run, final order, odds, required trades) with view/delete per year and history JSON export/import
- **Guided layout** — header navigation (Lottery / Results / History / How it works), a step-by-step flow tracker, a per-team odds table, and result cards showing pre-lottery slot and movement
- **Enhanced trade cards** — each card shows from/to teams, assets, notes, timestamp, and manual/auto-generated badge
- **Lottery history** — full draw order per finalized season, linked to the rule version in effect
- **Season Discord export** — copy any individual season as a Discord announcement; copy all seasons at once
- **Rule tracking** — active rules are always visible; every settings change creates a versioned rule snapshot
- Versioned localStorage persistence (teams, settings, results, trades, lock state, seed, history, rule history)
- Season finalization workflow with automatic cooldown flag rollover
- JSON export + JSON import restore
- Owner dropdown includes all 32 NFL teams
- Optional deterministic seeded mode for repeatable audits
- Draw audit metadata panel
- Mobile-friendly layout
- No backend or database required
- One-step trade undo, CSV and table exports, and required-trade review before finalizing
- Isolated dry-run previews with explicit save, discard, and export
- Playoff brackets for 2–64 teams with byes and CSV/text exports
- Independent season-scoped protection overrides, archive/restore for history years, and preview-first recovery
- Accessible glossary, text walkthrough, and editable mobile team cards

## Run Locally

Use a small local server (Python 3):

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

Opening `index.html` directly may allow basic use, but use **HTTPS or localhost** for reliable Web Crypto support. Every JSON export generates a SHA-256 checksum. If Web Crypto is unavailable, export fails with an explicit error rather than producing unchecked JSON.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this project.
3. Open **Settings**.
4. Select **Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose the `main` branch and `/root`.
7. Save.

GitHub will provide a public website address.

## How Pick Trading Works

Each lottery entry belongs to the original team's regular-season finish, but the result is awarded to the current pick owner.

Example:

- The Bears finish with the second-worst record.
- Baltimore owns the Bears' first-round pick.
- The Bears' lottery entry wins Pick #1.
- Baltimore receives Pick #1.

## Using the App

### Recover an actual past draft from a photo

1. In **Past Lotteries**, click **Enter a Past Draft**. Read your screenshot and type its actual season year, consecutive picks starting at #1, and original lottery teams. Use the exact team names from setup (suggestions are available); an optional owner identifies who received a traded pick.
2. Enter every pick for **Complete order**, or select **Partial — top three only** and enter exactly picks #1–#3. Partial records supply protection but never generate trades. Unknown odds, seed, standings and trades are not invented.
3. Click **Save / Confirm Past Draft**, check the confirmation, and save. **Edit Selected Year** opens a saved record for corrections; replacing any existing year requires confirmation. Other years and live setup/results stay unchanged. Known optional metadata is retained where the edited picks remain unchanged.
4. Select the **next season year** in Run the Lottery. Review the protection source and the automatically checked **Previous Top 3? / Previous #1?** columns. These use only the exact preceding year, by original team, not pick owner. Viewing another history year does not change live results or the protection source.
5. Review the independent rule toggles, current standings, owners and odds; run the **new** lottery. Impossible protection combinations stop with a message rather than silently permitting a repeat.
6. **Export History** and **Download JSON** for backups. Storage is browser-local, not server-synced; exports are backups for another browser/device or data loss.

No screenshot has been uploaded to the app: screenshots are transcribed manually. Unsaved past results cannot be recovered automatically; do not rerun an old lottery to reconstruct them.

If the exact prior year is missing, the app warns and requires **Use manual protection checkboxes for this season** before drawing with either cooldown rule enabled. Review both columns, including explicitly confirming no flags when appropriate. That override applies only to the selected season and is cleared when the year changes; uncheck it to resume automatic history sourcing. Historical edits/imports/deletes and newly added teams are reflected immediately in automatic mode.

Older full-state backups remain compatible. **Import History** can expose their finalized orders in **Older finalized season** without changing live setup/results. Select an order, click **Load Order for Year Assignment**, assign the actual year (never guessed), review the record type and save. Imported unassigned candidates are available until reload or another import; save each needed order first. The legacy finalized archive/import candidate list retains its existing 12-entry limit; year-keyed Past Lotteries is not limited to 12.

1. **Enter teams & standings** — add non-playoff teams worst-to-best and set the pick owner for any traded pick.
2. **Review odds** — the odds table shows each team's pre-lottery slot, pick owner, balls, and chance on the first draw. Lock setup when it looks right.
3. **Run the lottery** — set the **Season year** and click **Start Lottery**. If that year is already saved, you are asked before it is replaced.
4. **View results & trades** — result cards show the pick, team, owner, pre-lottery slot, and movement (▲ up / ▼ down). The required trades are listed underneath.
5. **Saved to history** — the finished lottery is saved automatically under **Past Lotteries**.

## Required Trades

Before the lottery, Pick #N belongs to whoever owns the Nth-worst team's pick (Madden's default draft order). After the draw, the app computes the pick swaps needed so that every pick ends up with the team the lottery assigned it to (logic in `lottery-trades.js`):

- Trades are generated for **every** pick that has to move, not only for picks that were traded before the lottery.
- Swaps are made between the **current owners**. For example, if Baltimore owns the Bears' pick, Baltimore makes the trade.
- With unique owners, a cycle of length k needs k − 1 swaps. Already-correct owners are skipped. With duplicate owners the sequence is valid, but a globally minimum number of swaps is not guaranteed.
- Inconsistent results cannot be interpreted as “no trades needed”; the app reports a trade-validation error.
- Each trade reads `Team A sends Pick #X to Team B for Pick #Y`. Run them in the order listed.

Click **Generate Trades from Results** to add these swaps to the Trade List Builder as **Auto-generated** entries. Clicking it again skips swaps that are already in the list. You can edit or remove auto-generated trades just like manual ones.

### Undo and trade exports

**Undo last trade** removes only the newest trade. After generating a batch, it removes one trade, not the whole batch. It is disabled after use until another trade is added. It does not undo edits, deletions, setup changes, draws, imports, or finalization, and is not an unlimited undo history. **Export Trades CSV** downloads the list for a spreadsheet; **Copy Trades Table** copies a tabular version, with a text-download fallback if clipboard access is unavailable. Existing Discord exports remain available.

**Finalize Season** opens a confirmation dialog showing staged trades. Review or edit their From/To teams, assets, and notes, or remove entries before confirming. **Cancel** or Escape discards staged edits without changing the live list or finalizing. Confirmation saves the reviewed trade list, archives the season, and advances its year; it never executes trades inside Madden.

## Dry Run

1. Review live setup, season, protections, and rules, then click **Dry Run**.
2. Inspect the preview results and swaps, both marked **DRY RUN — not saved**.
3. **Export Dry Run** shares the preview without saving it. **Discard Preview** removes it.
4. To retain it, enter a **new unique season year**, different from the simulated year and every saved year, then select **Save Dry Run** and confirm. The simulated year and already-saved years are rejected; this workflow never replaces them.

Preview state is isolated: running or exporting a dry run does not overwrite live results, mutate the trade list, or automatically add a history record. A preview is not a finalized season and does not persist as an unsaved preview through reload. Save a wanted result explicitly.

## Playoff Brackets

Select **Playoff teams** (2–64, default 8), then **Generate Bracket** from the available results. Seeds follow overall pick order starting at Pick #1; non-power-of-two fields, including 6 or 12 teams, receive byes protecting the highest seeds. **Export Bracket CSV** and **Export Bracket Text** share the generated schedule. If the requested field exceeds the result count, the generator cycles the sorted results starting at Pick #1 again: seed numbers remain distinct, but team, owner, and pick can repeat. These repeated entries are placeholders, not distinct qualifiers; review the field before using it. It does not invent teams or simulate winners. Bracket rounds wrap or scroll on narrow screens, so large fields may require horizontal scrolling.

## Past Lotteries (History by Year)

- Each completed lottery is saved automatically under its season year. The saved record includes the date run, final draft order (with pre-lottery slot and movement), odds used, rule settings, seed, and required trades.
- Running a new year never overwrites other years. Re-running a year that is already saved asks for confirmation first.
- Pick a year in the **Past Lotteries** dropdown to view its full results and trades. **Delete This Year** removes one saved year after you confirm.
- **Export History** downloads all saved years as JSON. **Import History** accepts a history export or a full app export, merges it in, and asks before replacing years you already have.
- History is stored in its own localStorage key (`flockvilleDraftLotteryHistory`), so **Reset** does not delete it.
- **Finalize Season** archives the live draw using its recorded year (not a subsequently selected year) and advances to the following season. Protections already come from Past Lotteries; finalizing a historical draw is not necessary. Legacy live results without a verified year must be assigned through the history editor.
- **Archive This Year** hides a record from the default year list without deleting it. Enable **Show archived years** to view it and restore it using the archive action. Archived records still supply exact-prior-year protection and remain in backups.

### Independent protection overrides

**Protection Flag Sources**, below Active Lottery Rules, explains the source of Previous #1 and Previous Top 3 separately. **Override Previous #1** or **Override Previous Top 3** opens a team-selection dialog for only that flag. Select original entrants and save; cancellation leaves both sources unchanged. The other flag continues using its existing source. **Clear Protection Overrides** resumes automatic sourcing where the exact prior year exists.

Per-flag overrides apply only to their recorded season and do not edit history or pick ownership. Selecting another year makes them inactive; returning to their year reuses them until you clear the overrides. The older full manual-checkbox fallback is cleared when the selected year changes and remains useful when prior-year history is missing; review both flag columns explicitly rather than assuming absent history means no protections.

### Explicit recovery

In **Recover Saved History**, paste a supported history JSON backup or choose a JSON file, click **Preview Recovery**, inspect the years and warnings, and then click **Merge Recovery**. Previewing does not modify saved records. Merging is explicit and asks before replacing conflicting years; live setup/results are not silently replaced. Recovery uses supplied records only: it cannot retrieve unsaved draws, infer actual years, or reconstruct screenshots.

All JSON exports include a **SHA-256 checksum** generated with Web Crypto, which requires a supported secure context such as **HTTPS or localhost**. If Web Crypto is unavailable, the app reports an explicit export error; it does not silently omit the checksum. A checksum mismatch warns that content may have changed or been damaged; review the source before deciding to import. A checksum is an integrity aid, not proof of authorship or a security signature. Older compatible backups without checksum metadata remain usable. Keep independent exported backups: browser-local storage can be cleared and is not server-synced.

## Discord Exports

### Copy Lottery Announcement

Click **Copy Lottery Announcement** in the Live Draw section after running the lottery. This copies the full draft order with pick ownership details in Discord-ready format.

### Copy Discord Trade List

Click **Copy Discord Trade List** in the Trades section. Exports all current trades as a numbered list suitable for pasting directly into Discord.

### Copy Season Recap (latest season)

Click **Copy Season Recap** in the Lottery History section header. Copies the most recently finalized season as a Discord announcement block including full draw order.

### Copy Announcement (individual season)

Each season card in Lottery History has a **Copy Announcement** button. Click it to copy that specific season's results as a Discord-ready block.

### Copy All Season History

Click **Copy All Season History** in the Export Results section. Copies all finalized seasons in chronological order, separated by horizontal dividers, suitable for a full Discord recap post.



1. Set up teams and settings.
2. Run lottery.
3. Click **Finalize Season** to archive the season and prepare the next one.
   - The following season derives `previousTopThree` from the saved original entrants at Picks #1–#3.
   - Only the saved original entrant at Pick #1 has `previousNumberOne = true`.
   - Manual flags are separate fallback/override inputs; finalization does not create a competing flag source.
   - Results are archived into lottery history with the full draw order and the active rule version at finalization time.

## Finalized Seasons

The **Finalized Seasons** section (under Past Lotteries) shows every season archived with **Finalize Season**:

- **#1 pick** and **Top 3** summary.
- **Full draw order** — click *Full draw order* to expand all picks with pick ownership details.
- **Rules in effect** — each entry shows the rule settings that were active when the draw was finalized.

History is stored in `localStorage` and survives page refreshes. Up to 12 seasons are retained.

## Rule Tracking

### Active Lottery Rules

The **Active Lottery Rules** section always shows the current rule settings and the date/time they came into effect:

- Number of lottery picks
- Bottom-four protection on/off
- Top-3 cooldown on/off
- No consecutive #1 on/off

### Updating Rules

Change any setting in the **Lottery Settings** panel. The app automatically takes a snapshot of the new rule set the moment any setting is modified. The snapshot is stored as a new rule version and becomes the "active" version going forward.

No manual action is required to create a rule version — it happens automatically on every settings change.

### Rule Versions

The **Rule Versions** section lists the active and prior versions, most recent first. Each entry shows:

- When the version was replaced (i.e., when the next version took effect).
- An optional description of the change (auto-generated for reset events).
- The rule settings that were in effect during that period.

Up to 50 rule versions are retained.

Use a version's **Restore** action to apply its settings as a new active version. Restoring appends a snapshot rather than deleting intervening versions or rewriting the rules linked to old draws. Review protections and odds before the next draw.

### Linking History to Rules

When a season is finalized, the active rule version ID is stored alongside the season record. In **Lottery History**, the "Rules" line on each season entry shows the exact settings that were in effect for that draw.

## Persistence

- The app automatically saves to browser localStorage after meaningful updates.
- Refreshing the page restores teams, settings, history, lock state, seed config, latest results, and rule history.
- Results are completed only after the animation finishes. Reloading during a draw discards its partial live results rather than exposing them as a final order; saved past years are unchanged.
- If saved data is malformed or unsupported, the app safely falls back to defaults.

### Schema version

The localStorage schema remains **version 3**, with additive history, archive, and season-scoped protection metadata. Older saves (v1–v2) are accepted — `ruleHistory` defaults to an empty array and an initial snapshot is taken from the restored settings. Unassigned legacy season years are never inferred.

## Import / Export JSON

- **Download JSON** exports current setup/results/history, rule history, Past Lotteries, and metadata.
- **Import JSON** restores app state from prior export files.
- Older exports without `ruleHistory` are still accepted; a rule snapshot is taken from the imported settings automatically.
- Past Lotteries in an imported file are merged into your saved history (you are asked before any saved year is replaced).

## Seeded Mode (Optional)

- Enable **Use deterministic seed** and provide seed text to produce reproducible draws.
- Leave it off for normal random behavior (`Math.random`).
- Seed information is shown in audit metadata and included in exports.

## Validation

The app has no build step. From the **repository root**, install the test dependencies and Chromium, then run the Node and browser checks:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing. Python 3 is required for the browser suite's configured static web server. Playwright runs desktop (1280px) and mobile (390px) projects. The Node baseline can also run directly with `node --test flockville-draft-lottery/*.test.js`. Verify the UI manually using the following checklist:

The layout suite additionally checks 1920px, 768px, and 375px widths and attaches full-page screenshots to its test results for visual review. It checks panel/card overflow, touch-target sizing, centered dialogs, keyboard focus, Chromium accessibility-tree control names, reduced motion, and representative text/control contrast. These checks supplement, rather than replace, manual screen-reader and visual review. Run just these checks with `npx playwright test browser-tests/layout.spec.js`.

- New lottery draws are recorded in history after **Finalize Season**.
- The full draw order expands correctly per season entry.
- The "Rules" line on each season entry matches the settings that were in effect.
- Changing any setting in the Settings panel creates a new entry in **Rule Versions**; restoring an old version appends a new active version.
- **Active Lottery Rules** always reflects the current settings.
- Loading an older JSON export (without `ruleHistory`) continues to work.
- Refreshing the page restores all data including rule history.
- Completing a lottery saves it under **Past Lotteries** for the selected season year. Re-running that year asks before replacing it.
- Deleting a year removes only that year. Export History followed by Import History restores it.
- The required trades turn the pre-lottery order into the lottery order. **Generate Trades from Results** adds them once and skips duplicates on repeat clicks.
- Auto-generated trades show the **Auto-generated** badge; manually added trades show the **Manual** badge.
- **Copy Lottery Announcement** copies the current results in Discord format.
- **Copy Season Recap** copies the latest finalized season announcement.
- **Copy Announcement** on each season card copies that season's results.
- **Copy All Season History** copies all seasons in chronological order.
- Clipboard copy actions show a toast on success and a fallback message if clipboard access is blocked.
- **Undo last trade** removes only the newest trade (one from a generated batch), then disables until a new addition; it does not undo edits or deletions. CSV and table exports preserve order and notes.
- Finalization cancellation leaves history and season untouched; confirmation shows the required swaps.
- Dry-run preview/export/discard leave live state untouched; saving requires a new unique year and confirmation. The simulated year and already-saved years are rejected, not replaced.
- Brackets support byes and large fields; narrow layouts wrap or scroll without clipping controls.
- At widths below 768px, editable team cards replace the setup table; controls have at least 44px touch targets.
- Archive/restore does not remove protection data; independent overrides affect only the selected flag and season.
- Recovery preview is read-only; merge is explicit; checksum warnings are visible.
- All JSON exports include SHA-256 checksums; unavailable Web Crypto causes an explicit export error. Verify with HTTPS or localhost.
- The glossary opens from How It Works, is keyboard accessible, and closes with Escape or its Close button. The text walkthrough describes all workflows without external media.

```bash
# Syntax check
node --check flockville-draft-lottery/app.js

# Tests (tie-break ordering, required trades, history, app integration)
node --test flockville-draft-lottery/*.test.js
```
