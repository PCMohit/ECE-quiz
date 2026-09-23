# ECE Quiz Competition — Google Drive / Google Sheets Edition

## Public frontend
- 50 MCQs
- 30-minute timer
- One attempt per Participant ID
- No public Live Ranking page
- Participant receives only a submission confirmation
- Score and answer key stay on the Google Apps Script / private Google Sheet side

## Accurate scoring design
The frontend stores answers by question ID and sends only selected answers.
Unanswered questions are omitted from the request. The server therefore treats an omitted question as unanswered without any numeric coercion.

The private Questions sheet stores the correct answer as A/B/C/D.
The server validates every submitted question ID and answer value before scoring.
A hard invariant prevents score from ever exceeding answered question count.

## Files
Upload `index.html`, `admin.html`, `config.js`, `css/`, and `js/` from this `github-pages` folder to GitHub Pages.
Keep `private-backend/` private.
