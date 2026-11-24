# FLOCKVILLE HUB

The Flockville Madden League hub includes a public league dashboard, ability guide, draft lottery and searchable Supabase archive.

## Features

- 3-2-1 lottery-ball system
- Picks #1 through #8 lottery by default
- Bottom-four protection
- Top-3 cooldown
- No consecutive #1 pick
- Optional per-team CPU locks that keep an original team in its pre-lottery slot without lottery balls
- Traded pick ownership
- Bright, accessible draft-night stage with decorative ball mixing and team/owner reveals
- Discord-ready results
- Lottery transparency panel with team-by-team balls, odds %, and tier subtotals
- Trade list builder with Discord-ready copy export
- **Required trades** — after each draw the app lists ordered pick swaps needed to turn the pre-lottery ownership order into the lottery ownership order; one click adds them to the trade list
- **Past Lotteries** — every completed lottery is saved by season year (date run, final order, odds, required trades) with view/delete per year and history JSON export/import
- **Guided layout** — separate Home, Ability Guide, Lottery, Results, History, Watch live and How it works pages, a step-by-step flow tracker, a per-team odds table, and result cards showing pre-lottery slot and movement
- **Enhanced trade cards** — each card shows from/to teams, assets, notes, timestamp, and manual/auto-generated badge
- **Lottery history** — full draw order per finalized season, linked to the rule version in effect
- **Season Discord export** — copy any individual season as a Discord announcement; copy all seasons at once
- **Ability Guide** — full-width chart with quick position filters, search across every field, and sorting by all nine chart fields; browse 25 entries at a time and expand full silver/gold requirements and notes. Tablets and phones use readable cards rather than a horizontally clipped table. Position order defaults to a football depth-chart sequence.
- **Optional Supabase archive** — everyone can look up year-keyed lottery history; authorized league admins can publish it across browsers while local storage and JSON backups continue to work
- Dark FLOCKVILLE HUB theme with a centered header, league-supplied animated purple raven logo and pause control, and responsive navigation with every tab visible on mobile
- A Flockville-themed static lottery machine appears before and after the draw and when 3D is unavailable; reduced-motion users see a still reveal
- Separate shareable pages for the ability guide, lottery, results, history, and help; navigation keeps an in-progress draw on the page
- **Rule tracking** — active rules are always visible; every settings change creates a versioned rule snapshot
- Versioned localStorage persistence (teams, settings, results, trades, lock state, seed, history, rule history)
- Season finalization workflow with automatic cooldown flag rollover
- JSON export + JSON import restore
- Owner dropdown includes all 32 NFL teams
- Optional deterministic seeded mode for repeatable audits
- Draw audit metadata panel
- Mobile-friendly layout
- No backend required for local use; Supabase is an optional cloud archive
- One-step trade undo, CSV and table exports, and required-trade review before finalizing
- Isolated dry-run previews with explicit save, discard, and export
- Playoff brackets for 2–64 teams with byes and CSV/text exports
- Independent season-scoped protection overrides, archive/restore for history years, and preview-first recovery
- Accessible glossary, text walkthrough, and editable mobile team cards

## Visual review previews

These historical browser captures show earlier designs; the current site uses the dark theme: [previous design](assets/previews/before-desktop.jpg) → [bright desktop design](assets/previews/bright-desktop.jpg).

| Viewport | Live stage | Revealed stage |
| --- | --- | --- |
| Desktop · 1440px | [Mixing](assets/previews/stage-live-1440.jpg) | [Complete](assets/previews/stage-revealed-1440.jpg) |
| Tablet · 768px | [Mixing](assets/previews/stage-live-768.jpg) | [Complete](assets/previews/stage-revealed-768.jpg) |
| Mobile · 375px | [Mixing](assets/previews/stage-live-375.jpg) | [Complete](assets/previews/stage-revealed-375.jpg) |

Mobile previews also cover the [guide](assets/previews/guide-mobile.jpg) and [protection dialog](assets/previews/dialog-mobile.jpg).

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

### Home, members and commissioners

The root URL opens **Home**. After commissioner sign-in, open **Edit league dashboard and current season** to publish the current season, announcements (one per line), and the next event. These updates are stored in Supabase and visible to everyone. Event times are entered and displayed in each viewer's local time zone. The lottery year is separate: use **Set lottery year** on Home or the **Lottery season year** field near the top of Lottery. It determines the saved draw year and previous-year protections.

On a configured site, visitors and signed-in non-admins have a **member view**: public news, abilities, results, history and live broadcasts. Setup, draws, imports, corrections, trade administration and finalization are visible only after Supabase verifies commissioner access. Use **Commissioner sign-in** or **History → Supabase History**; existing email/password and email-link access still work. UI visibility is not the security boundary: database row-level security and admin-checked RPCs enforce write permissions. With Supabase unconfigured, existing local commissioner tools remain available.

### Ability favorites, comparisons and sharing

Use **Favorite** on any entry, then **Favorites only** to show your shortlist. Favorites are saved only in this browser, not in your account; a shared favorites-only URL uses the recipient's own favorites. Select **Compare** on up to three abilities to see all nine chart fields side by side, including complete requirements and notes. Comparison selection lasts until reload or removal.

**Share these filters** copies a URL containing search, position, type, sorting and favorites-only mode. If clipboard access is unavailable, copy the displayed URL manually. Filters survive page navigation and browser back/forward. Clearing filters preserves favorites.

### Shared draft-night broadcast

An authenticated, verified commissioner can check **Broadcast this draw live** before starting. Share `?page=live` with spectators or use **Fullscreen broadcast** for screen sharing. Public viewers refresh about every two seconds while that page is visible; no account or Supabase Realtime setup is needed.

Only revealed pick numbers, original teams, owners and CPU-lock labels are transmitted. Future picks, seeds and the computed order are never included in the live payload. One broadcast can be active at a time; the database enforces publisher/run ownership and prevents rewriting revealed picks. A live room without updates for 90 seconds is labeled disconnected and can be superseded by a new draw. A completed broadcast remains viewable until the next broadcast.

Keep the commissioner tab open during a draw. Closing/reloading it does not resume a broadcast or save a partial lottery. Spectators see interrupted/stale status rather than a completed result. If an update fails after the broadcast starts, a visible warning appears and the local lottery continues saving independently. A failed initial broadcast prevents that draw from starting; resolve it or uncheck broadcasting. Broadcasts are a presentation feed, not the permanent history archive.

### Search and compare past seasons

In **History**, search by **original team**, not traded owner, and optionally limit the year range. Results include archived seasons, pick owner, CPU status, pre-lottery slot and movement when recorded; missing legacy metadata is labeled unknown. Results paginate at 50 without dropping matches. Select another comparison season to compare the currently viewed year's original teams side by side; teams absent from either season are identified explicitly.

### Automatic database backups and finalized corrections

After applying the updated SQL, every actual history insert, update or deletion stores an automatic server-side before/after snapshot in a private, client-append-only edit log. Existing records receive a baseline snapshot when upgrading. These revisions stay in Supabase until the project owner explicitly manages retention; browser reset or history deletion does not delete them. No-op upserts do not create duplicate revisions. Export downloaded revisions separately: same-database snapshots are not disaster-recovery or point-in-time database backups.

After a completed draw, go to **Results → Finalize Season** to review trades, finalize the draw and advance the lottery year. To finalize an older saved result without changing the live draw or advancing the year, select it under **History → View year** and choose **Finalize Selected Year**. Partial top-three records remain explicitly partial; simulated dry runs cannot be finalized. Check the cloud save status for confirmation.

Finalized year-keyed records appear under **History → Finalized Seasons** for all visitors, including on other devices after a confirmed cloud save. Older browser-only season archives still appear on the device holding them; they are not automatically uploaded or assumed to have a verified year. Replacing, rerunning or deleting a finalized record requires confirmation and an explicit correction reason of 8–500 characters. Direct database writes through the app cannot bypass that requirement. Archive visibility changes remain permitted and logged without a correction reason.

Under **History → Database backups and edit log**, load revisions and download a checksummed history export. A revision downloads its **before** record when available (the recoverable prior state), otherwise its inserted/baseline record. Restore it using **Import History** or **Recover Saved History**, review conflicts, confirm replacement, and supply a correction reason if the currently stored year is finalized. Restoration is a new audited edit, never a rewrite of the log. Audit snapshots and reasons are commissioner-only; never put secrets in correction reasons.

### Recover an actual past draft from a photo

1. In **Past Lotteries**, click **Enter a Past Draft**. Read your screenshot and type its actual season year, consecutive picks starting at #1, and original lottery teams. Use the exact team names from setup (suggestions are available); an optional owner identifies who received a traded pick.
2. Enter every pick for **Complete order**, or select **Partial — top three only** and enter exactly picks #1–#3. Partial records supply protection but never generate trades. Unknown odds, seed, standings and trades are not invented.
3. Click **Save / Confirm Past Draft**, check the confirmation, and save. **Edit Selected Year** opens a saved record for corrections; replacing any existing year requires confirmation. Other years and live setup/results stay unchanged. Known optional metadata is retained where the edited picks remain unchanged.
4. Select the **next season year** in Run the Lottery. Review the protection source and the automatically checked **Previous Top 3? / Previous #1?** columns. These use only the exact preceding year, by original team, not pick owner. Viewing another history year does not change live results or the protection source.
5. Review the independent rule toggles, current standings, owners and odds; run the **new** lottery. Impossible protection combinations stop with a message rather than silently permitting a repeat.
6. **Export History** and **Download JSON** for backups. History stays in browser storage by default; configure the optional Supabase archive below to sync between devices.

No screenshot has been uploaded to the app: screenshots are transcribed manually. Unsaved past results cannot be recovered automatically; do not rerun an old lottery to reconstruct them.

If the exact prior year is missing, the app warns and requires **Use manual protection checkboxes for this season** before drawing with either cooldown rule enabled. Review both columns, including explicitly confirming no flags when appropriate. That override applies only to the selected season and is cleared when the year changes; uncheck it to resume automatic history sourcing. Historical edits/imports/deletes and newly added teams are reflected immediately in automatic mode.

Older full-state backups remain compatible. **Import History** can expose their finalized orders in **Older finalized season** without changing live setup/results. Select an order, click **Load Order for Year Assignment**, assign the actual year (never guessed), review the record type and save. Imported unassigned candidates are available until reload or another import; save each needed order first. The legacy finalized archive/import candidate list retains its existing 12-entry limit; year-keyed Past Lotteries is not limited to 12.

1. **Enter teams & standings** — add non-playoff teams worst-to-best and set the pick owner for any traded pick.
2. **Review odds** — the odds table shows each team's pre-lottery slot, pick owner, balls, and chance on the first draw. Mark **CPU / locked** for original teams that must stay in their slots; their picks receive no balls, and the lock is labeled in results, history, and exports. A CPU lock overrides cooldown and consecutive-#1 restrictions only for that slot. Lock setup when it looks right.
3. **Run the lottery** — set the **Season year** and click **Start Lottery**. If that year is already saved, you are asked before it is replaced.
4. **View results & trades** — result cards show the pick, team, owner, pre-lottery slot, and movement (▲ up / ▼ down). The required trades are listed underneath.
5. **Saved to history** — the finished lottery is saved automatically under **Past Lotteries**.

### Draft-night presentation

Choose **Normal** or **Fast** reveal speed before or during a draw. **Skip Animation / Reveal All** is available while running and immediately finishes the same computed order. Neither control changes weighting, seeded randomness, protections, pick ownership, or trades. History is saved once when the complete order is revealed; a second start is blocked during the reveal.

When WebGL is available, the stage lazily loads a pinned, integrity-checked Three.js renderer for a glossy ball chamber, metallic frame, and animated reveal chute. If WebGL or the renderer is unavailable, the existing 2D animation remains in use. The 3D pool is capped at 12 balls and pixel density is limited for mobile performance; Reduce motion stops the mixing movement. The 3D scene only displays results that the lottery has already computed and never affects odds or draw randomness.

The chamber's anonymous balls are decorative, not a live probability display. Each reveal shows the pick, original team, and current owner. Remaining picks are labeled **Standings placement**, and bottom-four adjustments are labeled **Protected placement**. Earlier result cards do not replay their reveal animations.

The stage respects your device's **Reduce motion** preference: no mixing or extraction motion, with prompt reveals. It uses no audio, flashing, automatic focus changes, or forced scrolling. Status announcements describe revealed picks rather than decorative movement. Reloading or leaving during a reveal discards partial live results and keeps previously saved years unchanged. Export History for a durable backup.

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
- The Supabase archive stores the same year-keyed records. Everyone can read cloud history without signing in; only accounts explicitly listed as Flockville admins can change it. Completed draws and edits queue only changed years, so unrelated local years do not overwrite newer cloud copies. A save is marked confirmed only after Supabase returns the matching stored records.
- The lottery and History pages show whether a draw is saved locally, waiting for admin sign-in, saving, confirmed, or failed. Pending years survive reload and retry after verified admin sign-in, reconnection, or **Retry cloud save**. Failed writes retry up to three times automatically; export a backup if errors persist.
- Loading or importing teams cross-checks **Previous Top 3**, **Previous #1**, and **CPU / locked**. Exact-prior-year history supplies automatic flags for original teams, not traded owners. Manual overrides remain explicit and disagreements, missing history, unmatched names, and inconsistent flags are surfaced in the setup panel. CPU locks remain current-season choices, not copied from previous seasons; they override protections only for their locked slots.
- **Finalize Season** archives the live draw using its recorded year (not a subsequently selected year) and advances to the following season. Protections already come from Past Lotteries; finalizing a historical draw is not necessary. Legacy live results without a verified year must be assigned through the history editor.
- **Archive This Year** hides a record from the default year list without deleting it. Enable **Show archived years** to view it and restore it using the archive action. Archived records still supply exact-prior-year protection and remain in backups.

### Independent protection overrides

**Protection Flag Sources**, below Active Lottery Rules, explains the source of Previous #1 and Previous Top 3 separately. **Override Previous #1** or **Override Previous Top 3** opens a team-selection dialog for only that flag. Select original entrants and save; cancellation leaves both sources unchanged. The other flag continues using its existing source. **Clear Protection Overrides** resumes automatic sourcing where the exact prior year exists.

Per-flag overrides apply only to their recorded season and do not edit history or pick ownership. Selecting another year makes them inactive; returning to their year reuses them until you clear the overrides. The older full manual-checkbox fallback is cleared when the selected year changes and remains useful when prior-year history is missing; review both flag columns explicitly rather than assuming absent history means no protections.

### Explicit recovery

In **Recover Saved History**, paste a supported history JSON backup or choose a JSON file, click **Preview Recovery**, inspect the years and warnings, and then click **Merge Recovery**. Previewing does not modify saved records. Merging is explicit and asks before replacing conflicting years; live setup/results are not silently replaced. Recovery uses supplied records only: it cannot retrieve unsaved draws, infer actual years, or reconstruct screenshots.

All JSON exports include a **SHA-256 checksum** generated with Web Crypto, which requires a supported secure context such as **HTTPS or localhost**. If Web Crypto is unavailable, the app reports an explicit export error; it does not silently omit the checksum. A checksum mismatch warns that content may have changed or been damaged; review the source before deciding to import. A checksum is an integrity aid, not proof of authorship or a security signature. Older compatible backups without checksum metadata remain usable. Keep independent exported backups: browser-local storage can be cleared, and cloud sync is optional.

### Configure the optional Supabase archive

The website can run without a database. To share lottery history across devices, create a Supabase project and:

1. Open the project's SQL Editor and run [`../supabase/schema.sql`](../supabase/schema.sql). **Existing projects must re-run the entire updated file** before deploying these features. It preserves existing records and admin accounts, adds automatic revision snapshots and finalized corrections, and creates the public dashboard and live-room tables/RPC. Row-level security allows public history/dashboard/broadcast reads but restricts mutations and audit-log reads to authorized league admins. No new service key, Realtime publication or scheduled job is required.
2. Invite the administrator from **Authentication → Users**. In the SQL file, replace the example email and run the commented insert statement as the project owner to authorize that account.
3. Add the deployed app URL to Supabase **Authentication → URL Configuration → Redirect URLs**.
4. Put the project URL and its **publishable** (or legacy anon) key in `supabase-config.js`. These browser values are public; **never** put a `service_role` or secret key in this file or the website.
5. Reload the site. Public history loads automatically. To save draws to Supabase, sign in under **Past Lotteries → Supabase History** using the admin account's email and password. If this account does not have a password yet, use **Email sign-in link** once, open the link in the same browser, and use **Set or change password**. Thereafter use email and password. Enable email/password authentication in Supabase Auth if needed. Wait for verified publishing access before drawing; pending local draws publish once access and archive reconciliation succeed.

Use **Publish Local History** to upload all existing browser records explicitly; confirmation warns that matching cloud years will be replaced. Automatic sync uploads only pending years. Pending admin edits take precedence on refresh; other conflicts require confirmation, and declining them pauses automatic publishing. Keep JSON exports as backups. The configured project URL and publishable key are public browser configuration; write access is controlled by row-level security. Without configuration, cloud controls remain disabled and local features are unchanged.

After signing in, the site separately checks that the account is in `flockville_admins` before allowing publishing; non-admins can still read the archive. If access fails or a request times out, the cloud status explains the error and **Refresh Cloud History** can retry. **Publish Local History** becomes available after publishing access is verified and at least one year is saved in this browser.

Deleting a saved year also deletes its cloud copy only after cloud history has been successfully loaded without unresolved conflicts. Otherwise the confirmation explains that deletion is local only, and the cloud copy can be restored by loading cloud history.

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
npm run test:database
npm run test:browser
```

On Linux, use `npx playwright install --with-deps chromium` if browser system dependencies are missing. Python 3 is required for the browser suite's configured static web server. Playwright runs desktop (1280px) and mobile (390px) projects. The Node baseline can also run directly with `node --test flockville-draft-lottery/*.test.js`. Verify the UI manually using the following checklist:

The database regression uses an isolated, in-memory PostgreSQL-compatible PGlite instance with stubbed Supabase roles/Auth. It checks repeat-safe migrations, preserved data/admins, public versus private access, baseline/before/after snapshots, immutable finalized results, correction reasons and live-room integrity. It never connects to or modifies the production Supabase project. For reliable software-rendered WebGL coverage on resource-limited hosts, run `npx playwright test browser-tests/stage-3d.spec.js --project=desktop --workers=1` separately from the other browser files.

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
