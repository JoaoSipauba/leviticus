# E2E Journey B — Add Song Variations Design

## Goal

Extend the add-song coverage beyond the happy paste-URL path. Add 3 tests covering: duplicate URL detection, song-type selection (Playback/Instrumental/VS), and ministry binding on creation.

Maps to gap items 7, 9, 10 in the audit.

---

## Scope

**In:** 3 tests in `10-add-song-variations.spec.ts`.

| # | Test | Path | Expected |
|---|---|---|---|
| T1 | Duplicate URL | Add a song; try to add it AGAIN | Inline error `"Essa música já existe na biblioteca..."` |
| T2 | song_type "Playback" | Add a song; pick "Playback" type in step 2 | SQL row has `song_type='playback'` |
| T3 | Ministry binding on creation | Seed a ministry; add a song; pick ministry chip in step 2 | SQL: `song_groups` row links song to ministry |

**Out:** YT search tab (separate journey — requires fake yt-dlp `--flat-playlist` variant), preview audio (`--get-url`), retry-after-error flow.

---

## Setup pattern

Outer `before()` does once: cleanup + installYtDlpMock + signupAndCreateOrg. Then T1 runs first (adds the song), T2 and T3 reuse the same session and just trigger more adds with different URLs/types.

For T3, seed a ministry via `createGroupForOrg` (new helper — see below) before opening the modal.

---

## Test details

### T1 — Duplicate URL

The dup-check path in [AddSongModal.tsx](apps/desktop/src/components/AddSongModal.tsx):
- Line ~1150: after `fetchYoutubeMetadata` returns, app does `select` on songs by `youtube_url` + `org_id`; if hit, `syncOrg` + `setError('Essa música já existe na biblioteca. A biblioteca foi sincronizada.')` and stays on step 1.
- Line ~1208: on `handleConfirm`, if INSERT returns `23505` (unique constraint violation), `setError('Essa música já existe na biblioteca.')` (slightly different message).

We test the first path (more likely in practice) — same URL re-pasted from step 1.

```
T1 it:
  - Use a URL we KNOW will work (paste, Buscar, Baixar, wait for song in DB) — same as journey #2 T1
  - Now click "Adicionar outra" (resets modal to step 1)
  - Re-paste the SAME URL → click "Buscar"
  - Wait for <p role="alert"> containing "Essa música já existe na biblioteca"
```

### T2 — Pick "Playback" song_type

Step 2 of the modal has 4 chips: Normal (default), Playback, Instrumental, VS. We need to find the chip button and click it.

In [AddSongModal.tsx](apps/desktop/src/components/AddSongModal.tsx), the chips render with text "Playback" / "Instrumental" / "VS" / "Normal". Use `button=Playback` selector.

```
T2 it:
  - Reset modal (Adicionar outra)
  - Paste a NEW unique URL → Buscar
  - Step 2 renders; click button=Playback
  - Click button=Baixar música
  - Poll Supabase songs → assert song_type='playback'
```

### T3 — Bind ministry on creation

Pre-seed a ministry via a new SQL helper. Then in step 2, click the ministry's chip. The chip click toggles selection. After submit, `song_groups` row is inserted.

```
before (per-test):
  - createGroupForOrg(admin, orgId, 'Louvor E2E')  // new helper

T3 it:
  - Reset modal (or open fresh)
  - Paste new unique URL → Buscar
  - In step 2, click button*=Louvor E2E
  - Click button=Baixar música
  - Poll songs row (with new URL)
  - Verify song_groups row exists for (song.id, ministry.id)
```

---

## New helpers

### `apps/desktop/e2e/helpers/supabase.ts` — `createGroupForOrg`

```ts
export async function createGroupForOrg(
  admin: SupabaseClient,
  orgId: string,
  name: string,
  colorIndex = 0
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from('groups')
    .insert({ org_id: orgId, name, color_index: colorIndex })
    .select('id, name')
    .single()
  if (error || !data) throw new Error(`createGroupForOrg: ${error?.message ?? 'no row'}`)
  return data as { id: string; name: string }
}
```

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/10-add-song-variations.spec.ts` | CREATE |
| `apps/desktop/e2e/helpers/supabase.ts` | MODIFY — add `createGroupForOrg` |

---

## Risks

- **Ministry chip selector**: the chip is a button with the ministry name as text. Might be ambiguous if other buttons share the name. Use `*=` substring match scoped to within the modal if needed.
- **Sync timing for ministry**: after `createGroupForOrg`, the local SQLite needs to know about it before the step-2 chips render. We pre-seed BEFORE the AddSong opens, so `getDb().select('SELECT id, name FROM groups WHERE org_id = ?')` inside `handleFetchMetadata` will pick it up — but only after the next syncOrg. Test may need to trigger a navigation+back or wait for sync. **Mitigation**: do the createGroup BEFORE the outer `signupAndCreateOrg`'s syncOrg fires, OR force a navigation by `browser.url('tauri://localhost/library')` to trigger a Library mount which calls syncOrg.

---

## Out of scope
- Search tab (`--flat-playlist`).
- Edit song after adding.
- Multiple ministries selected at once.
