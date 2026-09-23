ECE QUIZ FIXED PACKAGE

PUBLIC WEBSITE:
Upload only the contents of github-pages/ to your GitHub Pages repository.

PRIVATE BACKEND:
- private-backend/apps-script/Code.gs -> replace the current Apps Script Code.gs
- private-backend/questions.json -> keep in private Google Drive; do NOT upload to GitHub

Changes:
1. Public Live Ranking removed.
2. Participant result page no longer shows score/correct count/time.
3. Scoring fixed: unanswered questions are not counted as option A.
4. Organizer dashboard and CSV export remain.
5. config.js keeps the existing Apps Script /exec URL.

After replacing Code.gs:
Deploy -> Manage deployments -> Edit existing Web App -> Deploy a new version.
Keep Execute as: Me and the same access setting. The /exec URL stays the same when updating the existing deployment.
