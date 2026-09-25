ECE QUIZ COMPETITION — RELIABLE VERSION

This package is designed for a normal college quiz with a burst of participants (target: about 80 students).
It keeps the existing Google Apps Script /exec URL in config.js.

IMPORTANT ARCHITECTURE
- GitHub Pages hosts the participant site and organizer dashboard.
- Google Apps Script is the private backend.
- Google Sheet stays private/restricted.
- Correct answers never go to GitHub Pages.
- Public Live Ranking is removed.
- Participants never receive their score, correct answers, or detailed result.

WHAT WAS HARDENED
1. Accurate scoring:
   - Only explicitly answered question IDs are scored.
   - Missing question IDs are unanswered and always score 0.
   - Answers are normalized to A/B/C/D.
   - Server enforces score <= answered count <= 50.
2. Burst handling:
   - Question bank is cached.
   - Start/Submit locks are short and fail fast.
   - Browser retries temporary busy/timeout/network failures with exponential backoff + jitter.
3. Idempotency:
   - Start uses a request ID, so a timeout/retry cannot create a second attempt.
   - Submit uses a request ID, so a timeout/retry cannot create a duplicate result.
4. Submission recovery:
   - Attempts store the finalized score/answered count/time.
   - Results store the submission request ID for duplicate recovery.
5. Smaller Start request:
   - Questions are preloaded through quizInfo before the participant clicks Start.
   - Start returns only the token and deadline.

SETUP — DO THIS IN ORDER

A) GOOGLE SHEETS / APPS SCRIPT
1. Open the Google Sheet: ECE Quiz Competition Database.
2. Extensions -> Apps Script.
3. Replace the complete Code.gs with:
   private-backend/apps-script/Code.gs
4. Save.
5. Reload the Google Sheet.
6. ECE Quiz Setup -> 1. Create/repair sheets.
7. ECE Quiz Setup -> 3. Import questions JSON.
   Enter the exact Google Drive filename, usually: questions.json
8. Verify Questions contains exactly 50 questions and Correct Answer is A/B/C/D.
9. Keep the Sheet Private / Restricted.

B) ADMIN PASSWORD
If you already set the organizer password, it remains in Script Properties.
Otherwise run ECE Quiz Setup -> 2. Set organizer password.

C) REDEPLOY WEB APP
1. Apps Script -> Deploy -> Manage deployments.
2. Edit the existing Web App deployment.
3. Create/deploy a new version.
4. Execute as: Me.
5. Keep the same participant access setting.
6. Keep the existing /exec URL.

D) GITHUB PAGES
Upload ONLY the contents of:
   github-pages/
Do NOT upload:
   private-backend/questions.json
   private-backend/apps-script/Code.gs

config.js already contains the existing Apps Script /exec URL.

OLD TEST DATA
Old incorrect test results in Attempts/Results are historical. Delete old test rows before the event, or create a fresh database copy.

TEST BEFORE EVENT
1. Answer 0 questions -> score must be 0/50 and answered 0/50.
2. Answer 1 question -> score must be 0 or 1; answered 1/50.
3. Answer 2 questions -> score must be 0, 1, or 2; answered 2/50.
4. Answer 5 questions -> score must be 0..5; answered 5/50.
5. Verify participant sees only submission confirmation.
6. Verify Organizer Dashboard shows Score and Answered separately.
7. Test several devices starting within a few seconds of each other.

80-STUDENT EXPECTATION
This version is engineered to reduce the main application-level bottlenecks and to recover from burst/network failures. Google Apps Script still has provider-side concurrency limits, so no Apps Script solution can guarantee that every 80-user burst is instantaneous. The client retry system is specifically included to smooth temporary overload instead of showing a one-shot Server Not Respond error.

GOOGLE LIMITS / DESIGN BASIS
Google currently documents 30 simultaneous executions per user and 1,000 simultaneous executions per script. Because this web app executes as the owner, the per-user concurrency limit is relevant to this architecture. See:
https://developers.google.com/apps-script/guides/services/quotas
https://developers.google.com/apps-script/guides/support/best-practices
