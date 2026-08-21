# Lovable Audit Suite

https://github.com/seeditDev/seed-seb 

@secret:GITHUB_PERSONAL_ACCESS_TOKEN  - git pat


clone this repo and i have mentioned my analysis on all issues. fix them
i have firestore blaze plan on this one project. 

Student Dashboard Audit — Full Continuation Report

Appended to the earlier findings (open Firestore rules, plaintext passwords in the public JSON, keys in localStorage, unbounded getDocs on codingProgress at StaffDashboard.js:1446, new Function() on question data, dangerouslySetInnerHTML XSS). Everything below is new, student-side, and file:line-cited.

1. Assessments Tab — StudentDashboard.js

Functional

N+1 Firestore reads per dashboard load. StudentDashboard.js:715-770 loops every assessment through a Promise.all of per-item getDoc / MCQService.checkExistingAttempt / CodingAssessmentService.checkExistingAttempt. 30 assessments ≈ 30–90 reads on every mount, uncached.

Silent cross-tenant read. college = userData.College || 'KGKITE', year = userData.Year || '2026' at StudentDashboard.js:717-718, 733-735. Falsy field ⇒ status read/write targets a different tenant's doc path.

Unbounded incomplete-attempt query. StudentDashboard.js:249-251 runs where('completed','==',false) then uses snap.docs[0]. Needs limit(1).

Embedded GitHub PAT in the client bundle. StudentDashboard.js:865-875 uses a _0x5f… char-code array + atob() to reconstruct a token used against api.github.com — trivially recoverable from devtools. P0.

Filter recomputes on every keystroke. StudentDashboard.js:822-849 re-runs getScheduleStatus/Date parsing over the full list, no useMemo — visible lag on large lists.

Resume-session scan is fragile. StudentDashboard.js:181-190 linearly scans localStorage with JSON.parse in try/catch; one corrupt msaProgress_* blob drops resumable-session detection silently.

UI/UX

Filter/search shows stale "not completed" badges for seconds while the N+1 loop resolves — no per-card loading state.

setError (:151-152) has no aria-live region.

Firebase waste — fixes

P0 Replace the per-card loop with one getDocs per result collection filtered by known assessment IDs, or denormalize completedAssessmentIds: string[] on the user doc, written transactionally at submission.

P1 limit(1) on :251. Cache loadAssessments() in React Query/sessionStorage (60 s TTL) so tab switches don't re-fetch.

2. MCQ Tab — MCQPage.jsx, mcqService.js

Functional

Answer key shipped to the browser. question.correctAnswer is compared client-side at MCQPage.jsx:517, 537, 1089, 1367, 1508 and the full bank is cached in localStorage['mcqTestData'] (:897). Any student can read it in devtools mid-test → guaranteed 100%. P0.

Five drifting score-calculation paths. MCQPage.jsx:511-565, 1085-1130, 1340-1400, 1460-1540 — manual submit / timer auto-submit / reload-recovery submit / embedded submit each recompute independently, some from answers state and some from storedAnswersRaw in localStorage. Race between the 1 s timer interval and the 120 s sync interval yields different totals.

Duplicate auto-submits. handleAutoSubmit('timer') is fired from three separate effects (MCQPage.jsx:1631, :1648-1652, :1657-1673) with no isSubmittingRef guard inside the handler itself — the disabled button (:2253) doesn't protect programmatic paths.

Clock mixing. Reload-grace math at :1189-1213 mixes timeService.now() (server-adjusted) with device Date.now() — skewed clocks can trigger spurious auto-submit on reload.

UI/UX

Zero aria-*/role/tabIndex anywhere in MCQPage.jsx (grep = 0 hits). Timer, options, and per-question navigation are inaccessible.

Per-question timer disables Prev/Next (:2327, 2334) with no tooltip → looks broken.

No skeleton for question fetch — blank frame between loading transitions.

Firebase waste

P1 Every lifecycle event writes canonical + legacy paths: mcqService.js:157-164, 182-186, 300-306, 482-486. 2× writes for every MCQ event, permanently. Pick one path.

P1 fetchUserAttempts (mcqService.js:96-98) is an unbounded getDocs over the student's mcq_results history, called from the dashboard N+1.

P2 mcqLastActiveTime written every second (MCQPage.jsx:1614) — throttle to 5–10 s.

3. Coding Tab — CodingAssessmentPage.jsx, CodingAssessmentSandbox.jsx, codingAssessmentService.js, codingProgressService.js

Functional

Same canonical + legacy double-writes at codingAssessmentService.js:153-158, 237-242, 342-348, 541-546 — every compile/run/submit doubles writes.

Unbounded getDocs on coding history at codingAssessmentService.js:95-97.

Keystroke-adjacent localStorage writes. CodingAssessmentPage.jsx:1225 rewrites the full code map; :280-293 persists compile counts / submit times on every state change — input lag with multi-KB solutions.

No tab-switch guard on the primary coding page. CodingAssessmentPage.jsx has zero visibilitychange listeners (grep = 0). Detection is delegated to ProctoringEngine webcam ML, which soft-fails to 'camera_only'/'failed' (ProctoringEngine.jsx:342-350) — students can alt-tab freely when the webcam mode degrades. The sandbox variant has one at CodingAssessmentSandbox.jsx:294-295, so the two flows behave differently.

Duplicate-submit gap. Violation-triggered onAutoSubmit (CodingAssessmentPage.jsx:1569) has no in-flight guard; rapid alt-tabbing writes multiple final result docs.

UI/UX

Zero aria-*/role/tabIndex in CodingAssessmentPage.jsx.

Fullscreen countdown screen (:1821) has no keyboard-only escape / denied-fullscreen fallback.

Firebase waste

P1 De-duplicate canonical/legacy writes; add where/limit to fetchUserAttempts.

P2 codingProgressService.js:117, 151, 234, 285, 314 use setDoc({merge:true}) correctly but callers aren't debounced — confirm the elapsed-seconds interval in CodingAssessmentPage.jsx:1191-1195 isn't triggering backupProgress() more than the stated 60 s cadence, and that the page + sandbox aren't running the same autosave in parallel.

4. Multi-Section Assessment — MultiSectionAssessment.jsx

Suppressed exhaustive-deps timer. :1187-1199 with eslint-disable-next-line react-hooks/exhaustive-deps; the secTimer===0 expiry effect at :1202-1207 can invoke autoSubmitSection() twice before examFinishedRef.current is set → duplicate section submits.

Countdown reset bug. Pre-section countdown effect at :1229 depends on the entire sectionData object; any unrelated sectionData mutation (autosave answers) during the 10 s countdown recreates the setTimeout chain and can reset the countdown.

5. Live-User Tracking (crosscut) — trackingService.js

Expensive collectionGroup snapshot. subscribeToLiveCount (:143-159) opens onSnapshot on collectionGroup(db,'users') filtered by IsOnline==true && Date==today. Every 30 s heartbeat (:86-90, write at :108-113) from every online student re-fires the snapshot for every subscriber. Fan-out billing multiplier. P1.

Suspected onSnapshot leak. Callers in App.js, HomePage.js, Login.js, StaffDashboard.js, StudentDashboard.js — no confirmed capture/cleanup of the returned unsubscribe. Verify each useEffect returns the unsubscribe.

Heartbeats ignore document.hidden — full-price writes continue in background tabs.

6. Student-Flow Security (new, in addition to earlier findings)

#FindingLocationPriority1MCQ correctAnswer shipped + evaluated client-side, recoverable from localStorage['mcqTestData']MCQPage.jsx:517, 537, 897, 1089, 1367, 1508P02GitHub PAT obfuscated via atob() in client bundleStudentDashboard.js:865-875P03Falsy College/Year defaults route reads/writes to another tenantStudentDashboard.js:717-718, 733-735P14No DOM-level tab-switch detection on primary coding flowCodingAssessmentPage.jsx (absent) vs ProctoringEngine.jsx:342-350P15Client-supplied severity/violationCount written into scoring-adjacent docs with no server validationproctorService.js:61-79, ProctoringEngine.jsx:415-427P1

7. Priority Summary

P0

Move MCQ grading server-side (Cloud Function); stop shipping correctAnswer.

Remove the atob-obfuscated GitHub PAT (StudentDashboard.js:865-875); proxy via backend.

Kill the N+1 dashboard fetch (StudentDashboard.js:715-770) — batch reads or denormalize completion flags.

P1

Drop canonical/legacy double-writes in mcqService.js and codingAssessmentService.js.

Add where/limit to every unbounded getDocs (mcqService.js:97-98, codingAssessmentService.js:96-97, StudentDashboard.js:250-251).

Verify subscribeToLiveCount unsubscribes on every caller; gate heartbeats by document.hidden.

One isSubmittingRef guard across MCQ, Coding, and MSA auto-submit paths (MCQPage.jsx:1631/1652/1673, CodingAssessmentPage.jsx:1569, MultiSectionAssessment.jsx:1202-1207).

Add visibilitychange tab-switch detection to CodingAssessmentPage.jsx independent of webcam ML.

Fix falsy college/year defaults (StudentDashboard.js:717-718, 733-735).

P2

Add aria-*/keyboard focus management to MCQPage.jsx and CodingAssessmentPage.jsx.

useMemo the assessment filtering (StudentDashboard.js:822-849).

Throttle high-frequency localStorage writes (MCQPage.jsx:1614, CodingAssessmentPage.jsx:1225).

Cache loadAssessments() via React Query/sessionStorage TTL.


this web application is going to run on pyqt desktop apllication. so, no one can access the local storage through devtools. need not worry on it. gitpat also will not be avbl. can you get me any more suggestions?
and fixx all issues.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a385dfdc-fc10-4290-98df-d219d182471f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
