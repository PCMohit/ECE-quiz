ECE QUIZ — ACCURATE MARKING VERSION
====================================

This package fixes the scoring architecture, not just the symptom.

KEY SCORING RULE
-----------------
The participant browser does NOT send a 50-element array containing nulls.
It sends an object containing ONLY explicitly answered question IDs.

Example:
{
  "1": "B",
  "2": "A"
}

Questions 3–50 are absent => unanswered => 0 marks.

The server checks every submitted question ID against the private Questions sheet.
Only A/B/C/D are valid answers. Missing question IDs are never converted to A.
The server also enforces score <= answered count.

IMPORTANT BACKEND STEPS
-----------------------
1. Open your Google Sheet → Extensions → Apps Script.
2. Replace Code.gs with:
   private-backend/apps-script/Code.gs
3. Save.
4. In the Google Sheet, reload the sheet.
5. Run: ECE Quiz Setup → 1. Create/repair sheets
6. Run: ECE Quiz Setup → 3. Import questions JSON
   Enter the exact Drive filename: questions.json
7. Verify Questions → Correct Answer now contains A/B/C/D.
8. Deploy → Manage deployments → edit your existing Web App → deploy a new version.
9. Keep Execute as: Me and keep the same participant access setting.
10. The existing /exec URL in github-pages/config.js is preserved.

FRONTEND / GITHUB PAGES
-----------------------
Upload ONLY the contents of github-pages/ to GitHub Pages.
Do NOT upload private-backend/questions.json.
Do NOT upload Code.gs to the public GitHub Pages site.

PUBLIC PARTICIPANT RESULT
-------------------------
After submission, participants see only a submission confirmation.
They do not receive score, correct answers, or answer review.

LIVE RANKING
------------
The public Live Ranking page has been removed.
The organizer dashboard remains password protected.

AUDIT INFORMATION
------------------
The organizer dashboard also shows Answered count (for example 2/50).
The private Results sheet stores this value in the Answered Count column.
This makes testing the marking behavior straightforward.

MANDATORY TEST BEFORE THE EVENT
-------------------------------
Use a fresh Participant ID.
A. Answer 0 questions → Score must be 0, Answered must be 0/50.
B. Answer exactly 1 question correctly → Score must be 1, Answered 1/50.
C. Answer exactly 1 question incorrectly → Score must be 0, Answered 1/50.
D. Answer exactly 2 questions → Score can only be 0, 1, or 2; never 27, 25, etc.
E. Answer exactly 5 questions → Score can only be 0 through 5.

OLD TEST DATA
-------------
Previous incorrect test submissions remain historical rows in Results.
Delete old test rows before the real competition so the organizer dashboard starts clean.
Use fresh Participant IDs for every test because Attempts intentionally blocks reused IDs.
