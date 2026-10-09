# W2 — Community Growth + Attribution QA
CYCLE_ID: 20261008-branch-consolidation
ACTIVE_BRANCH: cycle/mobile-nav-runtime-validation-20261007
Date: 2026-10-08
Owner: W2
Status: QA_STATIC_16_PASS_4_GAPS; RUNTIME_PENDING; NO_CAMPAIGN_PUBLICATION

## Evidence
- Frontend PR #705 and API PR #542 merged. Do not duplicate or cherry-pick.
- Community API: app isolation, capacity locking, unique RSVP, organizer auth, geofence, and time window present in source.
- Static contract checks: 16/20 PASS; four gaps: UI check-in time not refreshed, create+publish non-atomic, register drops full UTM, email verification drops full UTM.
- PR #710 remains draft and W1 owns preserving its two docs.
- GitHub Actions runs for merge commits not confirmed by queried PR-triggered runs.
- Landing /for-producers HTTP validation failed: DNS resolution error (curl exit 6).
- Metricool brand 7132266: Oct 7 7 followers, 8 views, reach 4; Oct 8 partial. Published Story 390297204 and draft 390461150 share media; do not duplicate. No post scheduled or published.
- A minimal code fix for live check-in refresh was attempted on this branch but the connector blocked the write. No commit/push.
## Handoff W0
1. Have W4 run API HTTP negative/edge-case tests: 401,403,409,422, concurrency, out-of-radius, out-of-time, cross-app.
2. Fix stale check-in clock and idempotent create+publish flow before community public launch.
3. Review UTM propagation across register and email verification while preserving W1/W3 ownership.
4. Confirm production HTTP, API migrations, CI and Android/PWA before campaign CTA activation.
5. W1 retain the two docs in draft PR #710; do not claim campaign release readiness.
