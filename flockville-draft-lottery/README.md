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
- **Auto-generated trades** — one click generates trade entries for every pick where ownership differs from the lottery team
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

## Run Locally

Open `index.html` directly in a browser, or use a small local server:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

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

## Auto-Generated Trades

After running the lottery, click **Generate Trades from Results** in the draw panel. The app inspects every result where the pick owner differs from the lottery team and creates a trade entry automatically:

- **From team** — the team that gave up the pick (original lottery entrant).
- **To team** — the current pick owner who will receive the selection.
- **Asset** — labeled `Pick #N (from lottery draw)`.
- **Notes** — marked *Auto-generated from lottery results*.

Auto-generated trades are labeled with an **Auto-generated** badge in the trade card. Duplicate entries are skipped if the same traded pick already has an auto-generated trade. You can edit or remove auto-generated trades just like manual ones.

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
   - Teams that finished Picks #1-#3 are automatically marked `previousTopThree = true`.
   - Only Pick #1 is marked `previousNumberOne = true`.
   - Results are archived into lottery history with the full draw order and the active rule version at finalization time.

## Lottery History

The **Lottery History** section (under the draw panel) shows every finalized season:

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

### Rule Changelog

The **Rule Changelog** section lists all prior rule versions, most recent first. Each entry shows:

- When the version was replaced (i.e., when the next version took effect).
- An optional description of the change (auto-generated for reset events).
- The rule settings that were in effect during that period.

Up to 50 rule versions are retained.

### Linking History to Rules

When a season is finalized, the active rule version ID is stored alongside the season record. In **Lottery History**, the "Rules" line on each season entry shows the exact settings that were in effect for that draw.

## Persistence

- The app automatically saves to browser localStorage after meaningful updates.
- Refreshing the page restores teams, settings, history, lock state, seed config, latest results, and rule history.
- If saved data is malformed or unsupported, the app safely falls back to defaults.

### Schema version

The localStorage schema is currently at **version 3**. Older saves (v1–v2) are read without issue — `ruleHistory` defaults to an empty array and an initial snapshot is taken from the restored settings. A fresh rule version is captured automatically so existing users are not affected.

## Import / Export JSON

- **Download JSON** exports current setup/results/history, rule history, and metadata.
- **Import JSON** restores app state from prior export files.
- Older exports without `ruleHistory` are still accepted; a rule snapshot is taken from the imported settings automatically.

## Seeded Mode (Optional)

- Enable **Use deterministic seed** and provide seed text to produce reproducible draws.
- Leave it off for normal random behavior (`Math.random`).
- Seed information is shown in audit metadata and included in exports.

## Validation

The app has no automated test runner. Verify manually using the following checklist:

- New lottery draws are recorded in history after **Finalize Season**.
- The full draw order expands correctly per season entry.
- The "Rules" line on each season entry matches the settings that were in effect.
- Changing any setting in the Settings panel creates a new entry in **Rule Changelog**.
- **Active Lottery Rules** always reflects the current settings.
- Loading an older JSON export (without `ruleHistory`) continues to work.
- Refreshing the page restores all data including rule history.
- **Generate Trades from Results** creates trade entries for every pick where owner ≠ team, and skips duplicates on repeat clicks.
- Auto-generated trades show the **Auto-generated** badge; manually added trades show the **Manual** badge.
- **Copy Lottery Announcement** copies the current results in Discord format.
- **Copy Season Recap** copies the latest finalized season announcement.
- **Copy Announcement** on each season card copies that season's results.
- **Copy All Season History** copies all seasons in chronological order.
- Clipboard copy actions show a toast on success and a fallback message if clipboard access is blocked.

```bash
# Syntax check only (no test runner in this project)
node --check flockville-draft-lottery/app.js
```
