# E2E Journey F — Playlist Detail Flows Design

## Goal

Cover the core PlaylistDetail flows: adding sections, adding songs to a section, and reordering. These are the "execute mode" prerequisites — without these flows, a playlist is just an empty shell. Currently zero coverage.

Maps to gap items 36, 37, 41 in the audit.

---

## Scope

**In:** 3 tests in `14-playlist-detail.spec.ts`.

| # | Test | Path | Expected |
|---|---|---|---|
| T1 | Add an "avulso" section | Open playlist → click + → "Avulso" tab → type label → confirm | SQL row inserted in `playlist_songs` (the section row) |
| T2 | Add a song to a section | Existing section → click "Adicionar música" → pick song → confirm | SQL: song appears in playlist_songs with correct section_id |
| T3 | Reorder songs in a section | Section with 2 songs → drag song[1] above song[0] | SQL: positions swapped |

**Out:** Group-based sections (test would mirror T1 with extra setup), section rename/delete (covered indirectly via #8's cascade), executing the setlist in playback mode (out of MVP — playback already covered in #3), reordering sections.

---

## Setup pattern

Each test starts from a freshly seeded playlist with at least the setup it needs:
- T1: empty playlist
- T2: playlist with one section (created in before-each or T1's residue)
- T3: playlist with two songs in one section

To avoid making each test re-do the UI add-song flow, we **seed playlist + section + songs via admin SQL** before each test. This keeps the test focused on the single UI action it's exercising.

```ts
before():
  await cleanLocalSqlite()
  await installYtDlpMock()  // T2/T3 use the mock indirectly because seeded songs need fake audio files for SongCard to be in the DB → on disk path is irrelevant here, songs come from SQL admin
  const seeded = await signupAndCreateOrg()
  orgId = seeded.orgId; userId = seeded.userId
  // Pre-seed: 2 songs in the org (so we can attach them to playlist sections)
  song1Id = await createSongForOrg(admin, orgId, userId, 'Song One')  // new helper
  song2Id = await createSongForOrg(admin, orgId, userId, 'Song Two')
```

Each test then:
- Creates a playlist via SQL admin (`createPlaylistForOrg` helper)
- Navigates to its `/services/:id` page

---

## Test details

### T1 — Add avulso section

```
T1 it:
  - Create empty playlist via admin
  - Navigate to /services/${playlistId}
  - Click button=Adicionar seção (or "+" — verify selector)
  - In the AddSectionModal: click "Avulso" tab (away from default "Ministério")
  - setReactInputValue on input[placeholder*="Cantora Maria"] with 'Test Section'
  - Click button=Criar seção
  - Wait for section row to appear in DOM
```

Note: AddSectionModal creates a section in the UI but the section is NOT persisted to DB until the first song is added (per AddSectionModal.tsx comment line 9-12). So the SQL assertion isn't useful here — we assert UI only (section header text appears) OR wait for T2 to add a song which persists it.

### T2 — Add a song to a section

```
T2 it:
  - Create a playlist + add a section (UI section, not yet persisted)
  - Find the section's "+ Adicionar música" button (selector TBD)
  - Click it → AddSongToPlaylistModal opens with the org's songs
  - Pick song1 from the list
  - Click "Adicionar"
  - Poll playlist_songs for a row matching (playlist_id, song1Id)
  - Verify section_id is set
```

Alternative path if AddSection isn't easy: seed the playlist + an initial song directly via SQL, then test JUST the add-song-to-section flow.

### T3 — Reorder songs

The PlaylistDetail uses drag-and-drop. **drag-and-drop in WebDriver is notoriously flaky**. Alternative: trigger the move via the same RPC the UI uses, then verify SQL reflects the swap. But that doesn't test the UI.

Recommendation: **defer T3 to a follow-up journey if drag-and-drop integration proves flaky**. Try a simple `browser.action('pointer').move().down().move().up()` first; if it fails, drop T3 and document why.

```
T3 it:
  - Seed playlist with 2 songs in one section (positions 1 and 2)
  - Navigate to /services/${playlistId}
  - Get DOM elements for song1 and song2 cards
  - Drag song2 above song1 via WebDriver pointer actions
  - Poll playlist_songs for the swap (song2 now position 1, song1 now position 2)
```

---

## New helpers

### `apps/desktop/e2e/helpers/supabase.ts`

```ts
export async function createPlaylistForOrg(
  admin: SupabaseClient,
  orgId: string,
  ownerId: string,
  name: string,
  scheduledAt: Date,
  durationHours = 2
): Promise<{ id: string; name: string }> {
  const scheduledEnd = new Date(scheduledAt.getTime() + durationHours * 3600 * 1000)
  const { data, error } = await admin
    .from('playlists').insert({
      org_id: orgId,
      name,
      scheduled_at: scheduledAt.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      created_by: ownerId,
    })
    .select('id, name').single()
  if (error || !data) throw new Error(`createPlaylistForOrg: ${error?.message}`)
  return data as { id: string; name: string }
}

export async function createSongForOrg(
  admin: SupabaseClient,
  orgId: string,
  addedBy: string,
  title: string,
  artist = 'Test Channel'
): Promise<string> {
  const { data, error } = await admin
    .from('songs').insert({
      org_id: orgId,
      youtube_url: `https://youtube.com/watch?v=seed${Date.now().toString().slice(-7)}`,
      title, artist, song_type: 'normal',
      added_by: addedBy,
    })
    .select('id').single()
  if (error || !data) throw new Error(`createSongForOrg: ${error?.message}`)
  return (data as { id: string }).id
}
```

---

## Files changed

| File | Action |
|---|---|
| `apps/desktop/e2e/specs/14-playlist-detail.spec.ts` | CREATE |
| `apps/desktop/e2e/helpers/supabase.ts` | MODIFY — add `createPlaylistForOrg`, `createSongForOrg` |

---

## Risks

- **T1 doesn't persist section**: AddSectionModal creates UI-only sections until the first song is added. T1's assertion is shallow. Consider merging T1 into T2 (one combined "add section + add song" flow) — but that loses isolation. Decide at impl time.
- **T3 drag-and-drop flakiness**: WebDriver pointer actions against React DnD libraries are notoriously hard. May need to skip T3 or replace it with an RPC-level assertion ("call the RPC directly + verify SQL").
- **Sync timing**: songs seeded via admin SQL need to be picked up by SQLite for the AddSongToPlaylistModal to list them. The modal reads from local DB — force a navigation to trigger `syncOrg` before opening the modal.
- **Multiple modals**: AddSongToPlaylistModal might overlap with the playlist's section flow. Verify the click selectors after the section is created.

---

## Out of scope
- Group-based sections (UI flow similar to avulso, just picks from existing ministries).
- Section rename / delete (similar RPCs, separate tests).
- Move section vs move song (different RPCs, separate tests if T3 works).
- Execute mode (playback in sequence) — partly covered by #3, fully scoped for a future journey.
- Multi-playlist scenarios.
