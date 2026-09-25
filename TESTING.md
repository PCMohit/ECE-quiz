# ECE Quiz Reliability Test Plan

## Scoring tests
- 0 answers: score 0, answered 0.
- 1 answer: score 0 or 1, answered 1.
- 2 answers: score 0, 1, or 2, answered 2.
- 5 answers: score 0..5, answered 5.
- 50 answers: score 0..50, answered 50.

## Integrity tests
- Submitting an invalid question ID must fail.
- Submitting an empty answer for an existing question ID must fail.
- Sending an answer value other than A/B/C/D (or legacy numeric 0-3) must fail.
- Submitting twice with the same submission request ID must not create a duplicate Results row.
- Retrying a Start request with the same start request ID must not create a duplicate Attempts row.
- A different start request with an already-used Participant ID must be rejected.

## Burst test
Open the quiz from multiple devices/browsers and click Start within a narrow time window. Observe:
- buttons show retry states instead of appearing frozen;
- temporary server-busy responses are retried automatically;
- each Participant ID gets only one attempt;
- each submission produces one result.

For a realistic 80-student event rehearsal, use the actual devices and network that will be used on competition day. This local package does not make provider-side Apps Script concurrency limits disappear; it is designed to fail gracefully and retry rather than relying on a single request.
