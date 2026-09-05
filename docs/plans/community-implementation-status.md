# Community implementation checkpoint

Work is inside the ITA application on `feature/community` in its prescribed worktree. No separate product was created; no changes have been pushed or merged.

Implemented: feature-gated community pages, profiles and houses, privacy settings, moderated profile images, follows, notification preferences and digests, feed ranking and stable pagination, post photos and embeds, schedules, AI suggestions requiring explicit acceptance, reactions, replies, report/block/mute, admin review, data export, house tools, and idempotent auction announcements. Database migrations through 035 are applied to the new project. The feature remains disabled pending complete acceptance.

Latest verification: 160 unit tests, two mobile browser tests, and twelve database workflow/security cases passed. Browser tests use labeled sample content with API fixtures; these do not constitute live end-to-end verification of all community endpoints. Temporary live authentication checks passed separately. Full-repository TypeScript checking still reports pre-existing errors outside community; no diagnostics in the new community files or changed AI helper.

The prior mobile header overlap was a screenshot capture artifact: the page was scrolled when a full-page image was taken. Captures now scroll to the top first and the header is visibly correct.

Remaining phase 1 acceptance includes live social API workflows, profile counts/wins/badges, richer category/nearby feed cards, and complete notification trigger coverage. Phases 2–6 (Q&A/chat, consignments, messaging/reviews, groups/events/discovery, gamification/analytics) remain to be implemented. Phase 7 depends on the separate video stack. Video and polls are excluded from phase 1 by the plan.

Before merge: reconcile with launch main, run final QA against the combined code, and update the Watchtower handoff. Do not enable `community_v1` or represent the full social specification as complete on the basis of this checkpoint.
