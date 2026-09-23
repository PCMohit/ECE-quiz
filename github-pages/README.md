# ECE Quiz Competition — Google Drive / Google Sheets Edition

## Changes in this fixed version

- Public **Live Ranking / Leaderboard has been removed** from the participant website.
- Participant result screen no longer shows score, marks, correct-answer count, or corrected questions.
- Fixed the scoring bug where unanswered questions could be counted as option A (answer index 0).
- Organizer dashboard still shows score, time, ranking, and exports CSV.
- The existing Google Apps Script `/exec` URL remains the same when you edit/redeploy the existing Web App deployment.
- No Firebase is used.

## Important backend update

Replace your current Apps Script `Code.gs` with `apps-script/Code.gs`.

Then:
1. Save the Apps Script.
2. Deploy → Manage deployments.
3. Edit the existing Web App deployment.
4. Create/deploy the new version.
5. Keep **Execute as: Me**.
6. Keep the same participant access setting.
7. The Web App `/exec` URL should remain the same when updating the existing deployment.

## Frontend

Update/upload these files to GitHub Pages:
- `index.html`
- `admin.html`
- `config.js`
- `css/style.css`
- `js/api.js`
- `js/quiz.js`
- `js/admin.js`

`config.js` already contains the same Apps Script `/exec` URL supplied in the uploaded project.

## Security

- Do NOT upload `questions.json` to GitHub Pages because it contains the correct-answer key.
- Keep the Google Sheet private/restricted.
- The answer key is read by Apps Script and is not sent to participants.
- `questions.json` is included in this ZIP only as a backend/Drive source file; keep it out of the public GitHub Pages files.

## Removed files

`leaderboard.html` and `leaderboard.js` are intentionally not included in the public website package because the public Live Ranking feature has been removed.

## Scoring behavior

Each selected answer is compared with the corresponding correct answer.

Unanswered questions are ignored and score 0 points.

Therefore, if a participant attempts only 5 questions, the maximum possible score is 5/50.
