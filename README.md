# ECE Quiz — Google Drive / Google Sheets Edition

This version has **no Firebase**. GitHub Pages hosts the frontend. A private Google Sheet in your Drive stores questions, attempts and results. Google Apps Script acts as the server so the browser never receives the answer key.

## What is included
- 50 MCQs / 30-minute quiz
- one attempt per Participant ID
- answer key stays in private Google Sheet
- score calculated by Apps Script
- server-side start/submission timestamps
- ranking: score DESC, time ASC, submission ASC
- public leaderboard
- password-protected organizer results
- CSV export

## Setup
1. In Google Drive create a blank Google Sheet named **ECE Quiz Competition Database**.
2. Open the Sheet → **Extensions → Apps Script**.
3. Replace the default Code.gs with `apps-script/Code.gs` from this package and Save.
4. Return to the Sheet and reload it. Open **ECE Quiz Setup** menu:
   - `1. Create/repair sheets`
   - `2. Set organizer password`
   - `3. Import questions JSON` and paste the entire contents of `questions.json`.
5. In Apps Script choose **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: choose the option that allows your participants to access the web app without signing into your Google account (the exact label depends on account type).
   - Authorize the script when Google asks.
6. Copy the deployed URL ending in `/exec`.
7. Open `config.js` and replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with that `/exec` URL.
8. Upload the frontend files to GitHub Pages. Do **not** upload any Google password, OAuth secret, or private key. The organizer password is stored only in Apps Script Script Properties.
9. Test with two different Participant IDs/devices, then test `admin.html`.

## Google Drive storage
The Google Sheet itself is a file stored in Google Drive. Keep it **Private / Restricted**. Participants never need direct access to the Sheet.

## Security notes
- Do not put correct answers in frontend JavaScript.
- Do not make the database Sheet public.
- Do not put the organizer password in `config.js` or GitHub.
- Apps Script has quotas/limits; this design is suitable for a normal college quiz, but it is not an unlimited high-traffic backend.
- The public leaderboard intentionally exposes participant name, ID, score and time. If you do not want that, remove/disable `leaderboard.html` and the `leaderboard` action.
