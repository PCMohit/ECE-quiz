ECE QUIZ FINAL FIXED VERSION

IMPORTANT SCORING FIX:
The previous backend scored unanswered questions as option A because Number(null) becomes 0 in JavaScript. This version fixes that by scoring ONLY explicit integer answers 0..3. Unanswered questions are always 0 marks.

PUBLIC GITHUB PAGES:
Upload ONLY the contents of github-pages/ to your GitHub repository.
Do NOT upload private-backend/questions.json.

PRIVATE APPS SCRIPT:
Replace the existing Code.gs in Google Apps Script with:
private-backend/apps-script/Code.gs
Then save and update the EXISTING Web App deployment to a new version.
Keep the same Execute as / access settings and the same /exec URL.

PRIVATE QUESTIONS:
private-backend/questions.json is for Google Drive only.

TEST:
1. Use a fresh Participant ID.
2. Start the quiz.
3. Answer exactly 2 questions.
4. Leave all other 48 unanswered.
5. Submit.
6. Organizer Dashboard / Results must show a score from 0 to 2 only.
7. Participant must see only submission confirmation, not score or correct answers.

If old attempts already exist with incorrect scores, those rows are historical and will not be automatically changed. For a clean competition database, clear old test rows from Attempts and Results before the real event.
