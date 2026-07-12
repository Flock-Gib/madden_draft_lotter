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
- JSON export
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

## Notes

The app is fully client-side. Refreshing the page clears the current setup unless you export the results first.
