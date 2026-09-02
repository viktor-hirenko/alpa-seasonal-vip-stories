# Alpa Seasonal VIP Stories — agent brief

Read `_context/README.md` first, then `_context/90-next-session.md`. That file
carries the current phase and the next task.

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
