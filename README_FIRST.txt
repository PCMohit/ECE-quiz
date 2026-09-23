ECE QUIZ — ACCURATE SCORING VERSION

SCORING ARCHITECTURE
- The browser stores answers only for questions the participant explicitly selects.
- Unanswered questions are omitted from the submission payload.
- Apps Script scores only explicitly submitted question IDs.
- Missing question IDs are always 0 marks.
- No Number(null) conversion is used anywhere in scoring.
- The Apps Script does not return the score/correct-answer count to the participant.

IMPORTANT DEPLOYMENT STEPS
1. Upload ONLY the contents of github-pages/ to GitHub Pages.
2. Keep private-backend/questions.json private; do not upload it to GitHub.
3. Replace the existing Code.gs in your Google Apps Script with private-backend/apps-script/Code.gs.
4. Save the Apps Script.
5. Deploy > Manage deployments > Edit your EXISTING Web App > select New version > Deploy.
6. Keep Execute as: Me and keep the same participant access setting.
7. The /exec URL in github-pages/config.js is already preserved.

TEST BEFORE COMPETITION
- Use a fresh Participant ID.
- Answer exactly 2 questions.
- Leave 48 questions unanswered.
- Submit.
- Organizer Dashboard must show a score from 0 to 2.
- If you answer only one question correctly, score must be exactly 1.
- If you answer both correctly, score must be exactly 2.
- Participant must see only submission confirmation, not score or correct answers.

IMPORTANT
Existing incorrect test rows in Google Sheets are historical data. Delete/clear old test rows from Attempts and Results before the real competition.
