# E2E Journey #4 — Play / Pause Song Design

## Goal

Add the fourth E2E spec covering the most critical play-side wiring: clicking play on a SongCard transitions the store + UI to "playing" state, and clicking pause flips back to "paused". Validates the SongCard → Zustand store → audio.ts → Howler chain without depending on real audio output.

This corresponds to jornada **#3** in the priority list documented in [CLAUDE.md § Testing strategy](../../../CLAUDE.md#testing-strategy).

---

## Scope

**In:**
- One new spec file `e2e/specs/04-play-song.spec.ts` with **one `it()`** that exercises play → pause → play.
- SQL + UI assertion via the `aria-label` flip on the SongCard play button. The label is state-driven (Zustand `isPlaying`), so it tests the store wiring without requiring audio output.

**Out:**
- Real audio playback verification. The fake `.m4a` (1024 zero bytes) is invalid audio — Howler logs `onloaderror` and never reaches "playing" state internally. The store flips regardless because `setCurrentSong` sets `isPlaying: true` unconditionally.
- Seek (depends on `Howler.duration()` which requires a valid file).
- Next/prev in playlist (requires culto/playlist context — jornada #4 territory).
- Media keys (macOS-only, manual per CLAUDE.md).
- PlayerMini internals (only verify the SongCard's button flips; PlayerMini is the same source of truth).

---

## Test

`e2e/specs/04-play-song.spec.ts` contains a single `describe`/`it`:

```
describe('Journey #3 — Play / Pause song') {
  before():
    1. cleanLocalSqlite + installYtDlpMock (happy mode)
    2. signupAndCreateOrg → returns orgId
    3. Add a song via the AddSongModal flow (paste URL → "Buscar" → "Baixar música")
    4. Poll Supabase until the song row appears
    5. Wait for the SongCard to render in the Library list (find by song title)

  it('plays, pauses, and resumes'):
    1. Locate the play button on the SongCard:
       $('button[aria-label=Tocar]')
    2. Click it
    3. Wait for the button to flip to aria-label="Pausar"
       → proves Zustand `isPlaying` is true
    4. Click the Pausar button
    5. Wait for the button to flip back to aria-label="Tocar"
       → proves Zustand `isPlaying` is false
}
```

### Why button selector instead of inspecting Zustand directly?

The Zustand store is not exposed on `window` — accessing it from WebDriver would require either:
- Adding a test-only `window.__playerStore = useStore` (production code change just for tests, bad)
- Reading via React Devtools protocol (complex)

The `aria-label` flip is **state-driven UI** — `aria-label={isCurrentlyPlaying ? 'Pausar' : 'Tocar'}` is rendered by SongCard.tsx based on the store. So waiting for the label to change IS verifying state propagation, but at a higher level (the level the user sees).

---

## Architecture / data flow

```
User click ──▶ SongCard.handlePlay()
                  │
                  ├─▶ store.setCurrentSong(song)      ─── isPlaying: true
                  └─▶ audio.playSong(filename)
                          │
                          └─▶ new Howl({src, html5}) ─── tries to load
                                  │
                                  └─▶ onloaderror (silent log)
                                  
SongCard re-renders with isCurrentlyPlaying=true ─── aria-label="Pausar"
```

Test verifies the state propagation (label flip), not Howler's actual playback.

---

## Why this is worth testing

The wiring SongCard → store → SongCard re-render is exactly the kind of glue that breaks in subtle ways:
- A regression in `setCurrentSong` (e.g. `isPlaying` accidentally hard-coded false) breaks all playback.
- A regression in `isCurrentlyPlaying` comparison (e.g. id vs song-equality) silently breaks the icon.
- A regression in the `aria-label` ternary breaks accessibility.

All three classes are caught by this single test for ~25s of runtime.

---

## Setup cost analysis

Setup steps and approximate cost:
- signup + create org: ~10s (UI signup + DB poll)
- Add song via UI (paste → Buscar → Baixar): ~10s
- Wait for SongCard render: ~5s

Total setup ≈ **25s** before the play/pause actions run. Acceptable for a single E2E test on a journey we care about.

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/04-play-song.spec.ts` | CREATE |

No CI workflow changes. No app source changes. No new migrations. No new helpers (all reused from journeys #1, #2, #6).

---

## Risks

- **Howler `onloaderror` logs to console** — Visible in CI logs as noise. Not a failure; just confirms we exercised the real audio loading path with an intentionally-invalid fixture.
- **SongCard render timing.** After "Baixar música" completes, the local SQLite sync triggers a Library re-render. The new song appears within seconds, but if syncOrg stalls (we've seen this in journey #1's redirect issue), the test may time out waiting for the SongCard. Wait 30s.
- **`aria-label` value localization.** Hardcoded Portuguese "Tocar"/"Pausar" matches the app today. If the app ever adds i18n, the labels will change. Acceptable risk for monolingual app.
- **Click on play button can scroll the page.** WebdriverIO auto-scrolls on click; should not be an issue but flagging.

---

## Out of scope (re-stated)

- Real audio playback.
- Seek behavior.
- Playlist navigation (next/prev).
- Media keys.
- PlayerMini internal assertions (the bottom-of-screen widget rendering).
- Volume controls.
- Download badge / re-download flows.
