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
- **Lottery history** — full draw order per finalized season, linked to the rule version in effect
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

## Season Workflow

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

```bash
# Syntax check only (no test runner in this project)
node --check flockville-draft-lottery/app.js
```
