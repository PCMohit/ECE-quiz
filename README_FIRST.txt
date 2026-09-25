ECE QUIZ — PERFORMANCE + ACCURATE SCORING VERSION
====================================================

This version keeps the same Google Apps Script /exec URL from config.js.

PERFORMANCE FIXES
-----------------
- Question bank is cached in Apps Script CacheService for fast repeated starts/submissions.
- The participant page preloads the public (no-answer-key) 50-question set while the registration form is open.
- Start Quiz keeps the 50-question payload off the critical click path when the preload has completed.
- The Apps Script lock is now held only around the small write-critical section instead of around question loading.
- Start checks only the Participant ID column instead of reading the entire Attempts sheet.
- Submit locates the token using only the Token Hash column, then reads one attempt row.
- Double submission is still prevented with a short lock around the final status check + result write.
- Frontend requests have a 25-second timeout with a clear error message instead of hanging indefinitely.
- Buttons show Starting Quiz... / Submitting... and prevent duplicate clicks.

SCORING RULE
------------
Only explicitly answered question IDs are sent. A missing question ID means unanswered = 0 marks.
The server accepts only A/B/C/D (plus temporary numeric 0/1/2/3 compatibility for old cached frontend files).
The server enforces score <= answered count.

DEPLOYMENT
----------
1. Replace Google Apps Script Code.gs with private-backend/apps-script/Code.gs.
2. Save.
3. Google Sheet menu: ECE Quiz Setup -> 1. Create/repair sheets.
4. If questions are already correct, no import is necessary. If needed: ECE Quiz Setup -> 3. Import questions JSON -> questions.json.
5. Deploy -> Manage deployments -> edit the existing web app -> Deploy a new version.
6. Keep Execute as: Me and your current participant access setting.
7. Do not change the /exec URL in github-pages/config.js.
8. Upload ONLY the contents of github-pages/ to GitHub Pages.
9. Do not upload private-backend/questions.json or Code.gs to GitHub.

MANDATORY LOAD TEST
-------------------
Use fresh Participant IDs. Test several starts close together.
Then test submissions from several browser tabs/devices.
A participant answering N questions can receive only 0..N marks.

OLD TEST DATA
-------------
Historical incorrect rows in Results remain. Clear/delete test rows before the event.
Attempts intentionally blocks a reused Participant ID.
