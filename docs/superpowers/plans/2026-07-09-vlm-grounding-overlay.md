# VLM Spatial Grounding Overlay — implemented

See implementation in:

- `small_vlm_video_analysis/src/observe.py` — `build_grounding_prompt`, `Observer.ground`, bbox parse helpers
- `vlm_backend.py` — `ground_for` on `/api/vlm/analyze`
- `replay.html` — overlay, toggle, hybrid fetch

## Manual precision gate (Task 6)

On real VLM (not mock), verify 1–2 konro/demo frames where a check is `yes`:

1. Run `./run.sh`, analyze a demo video
2. Confirm orange bbox roughly covers the referent object
3. If boxes are consistently wrong, set `GROUNDING_OVERLAY_DEFAULT_ON = false` in `replay.html`

Automated tests use mock (`status: failed` for grounding).
