# Alpa Seasonal VIP Stories — agent brief

## Session protocol — do this, not something else

**START.** Read `_context/90-next-session.md` FIRST. It is the project's control
panel: where the work stands, what is broken, the queue of sessions, and the
prompt for the one you are running. Then `_context/README.md` and whatever that
prompt names. Do not plan your own scope — the panel has one.

**INTERPRET BEFORE YOU BUILD.** First message of a session is the owner's task in
your own words: what you will do, what you will NOT do, which forks you see. No
code until he says go. He asks for this every time; skipping it is how sessions
end up fixing the wrong thing precisely.

**A GREEN GATE IS NOT PROOF.** `pose:check`, `fly:check`, `fit:check` and `audit`
guard against regressions and nothing more — most of them compare our data with
our data. The only evidence that a thing looks right is a picture you OPENED and
DESCRIBED in words. "The numbers agree" is not a finding.

**FINISH.** Before the report and before the commit, rewrite
`_context/90-next-session.md`: move what you closed, add what you found, re-point
the queue, and write the NEXT session's prompt in full so it works in an empty
chat. End that prompt with three things: **model, effort, and whether it runs in
this chat or a new one.** A session that does not leave the panel updated has not
finished, however good its code is.

**REPORT** in Russian (code, comments and commits stay English), in six parts, in
this order: what was done; how to check it; this chat or a new one; the next
session's prompt; model and effort; whether the commit is made or waiting.
Deploy and look at it with your own eyes BEFORE the report, then commit.

`_context/` is **not in git** (canonical copy lives with the project in
DevHubVault), so a fresh clone will not have it. If it is missing, say so rather
than guessing at the architecture.

## Hard rules

1. `_context/source/*` is verbatim input — **never edit it.** Corrections go in
   an ADR or a log entry.
2. No new dependency without an ADR in `_context/10-decisions.md`.
   Runtime deps are exactly `vue` and `gsap`.
3. Every layout number cites the Figma node it came from.
4. **GSAP never writes `transform` on an element that has a CSS `transform`**
   (ADR-0002). Elements under GSAP control are centred with negative margins,
   not `translate(-50%)`. See the header of `src/styles/_stage.scss`.
5. Never put `opacity`, `filter`, `overflow`, `mask` or `contain` on an element
   between `.stage-3d` and a journal face — they flatten the 3D scene.
6. Poses, timecodes and object flights are **data only**, in `src/story/`.
   No literal durations or ease strings inside presets (ADR-0009).
7. Run `npm run build` and `npm run pose:check` before claiming a change works.
8. After each block of work, add a `_context/20-log.md` entry — it must include
   a `Verified:` line saying what was actually checked.
9. `_refs/*.mp4` (187 MB each) must never enter git.
