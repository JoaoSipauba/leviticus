# Design — Saída dupla de áudio (principal + prévia)

**Data:** 2026-06-02
**Status:** Aprovado em brainstorming, aguardando plano de implementação
**Autor:** Brainstorming João Sipauba + Claude

## Objetivo

Permitir que o player principal e a prévia toquem em saídas de áudio diferentes simultaneamente. Caso de uso primário: regente/operador do culto envia o áudio principal pro PA enquanto ouve a prévia da próxima música em um fone, sem interromper o som do palco.

## Restrição que define a arquitetura

`HTMLAudioElement.setSinkId()` **não funciona em WebKit/Safari** ([bug #179415](https://bugs.webkit.org/show_bug.cgi?id=179415) aberto desde 2017, sem fix em 2026). Como Tauri usa WKWebView no macOS (plataforma principal do Leviticus), qualquer solução só-JS é inviável. Solução é roteamento pelo Rust via CPAL/rodio/symphonia.

Referências:
- [MDN setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)
- [LiveKit issue #1216](https://github.com/livekit/components-js/issues/1216)
- [Claket](https://github.com/aera128/claket-tauri) — soundboard Tauri+CPAL precedente
- [tauri-plugin-native-audio](https://crates.io/crates/tauri-plugin-native-audio)

## Decisão de escopo

**Big bang full Rust:** todo o pipeline de áudio (player principal, prévia da biblioteca, prévia do AddSongModal) migra de Howler.js + MSE pra Rust com CPAL/rodio/symphonia. Justificativas:
- Resolve a dívida técnica existente do `onend` flaky com `html5: true` (issues #63, #116)
- Habilita roteamento bit-perfect por device
- Consistência total entre canais

Performance é EQUIVALENTE em uso de player puro (não trigger-based), não é razão pra migrar. Razão é robustez + capacidade de roteamento. Custo aceito: ~3-4 semanas de implementação com PRs separáveis.

## Arquitetura

### Visão geral

```
┌─────────────────── React (JS) ────────────────────┐
│  player.ts (store)        preview.ts (store NOVO) │
│       ▲                          ▲                │
│       │ events (position,        │                │
│       │ ended, error, device)    │                │
│       │                          │                │
└───────┼──────────────────────────┼────────────────┘
        │ invoke('audio_play', ..) │
        │                          │
┌───────▼──────────────────────────▼────────────────┐
│            Rust audio engine (novo módulo)        │
│  ┌──────────────┐         ┌──────────────┐        │
│  │ Channel main │         │ Channel prev │        │
│  │  symphonia   │         │  symphonia   │        │
│  │     +        │         │     +        │        │
│  │   rodio      │         │   rodio      │        │
│  │     +        │         │     +        │        │
│  │  cpal sink   │         │  cpal sink   │        │
│  └──────┬───────┘         └──────┬───────┘        │
│         │ Stream                  │ Stream        │
└─────────┼─────────────────────────┼───────────────┘
          ▼                          ▼
     [Device A]                 [Device B]
   (Built-in/PA)              (Bluetooth fone)
```

3 canais em memória: `main`, `preview`, `test` (este último criado on-demand pro botão "Tocar teste").

### Princípios

- 2 canais ativos isolados, cada um com Sink/Stream/state/posição
- JS controla via Tauri commands; Rust emite eventos pra JS
- Configuração de device é **per-canal**, persistida em `localStorage` por máquina (ID CPAL não é portátil)
- Volume independente por canal (slider próprio na config)
- Stream progressivo no AddSongModal: yt-dlp pipa bytes → Rust decoda em chunks → rodio toca conforme decoda

## Módulos

### Rust (`src-tauri/src/audio_engine/`)

| Arquivo | Responsabilidade |
|---|---|
| `mod.rs` | API pública: `AudioEngine::new()`, comandos Tauri expostos |
| `channel.rs` | Struct `Channel` — encapsula 1 canal (Sink, Stream, state, play/pause/seek/setVolume/stop) |
| `device.rs` | Helpers CPAL: listar devices, resolver preferred → default, watcher de mudança |
| `decoder.rs` | Abstrai symphonia: arquivo local OU stream progressivo (pipe yt-dlp) |
| `events.rs` | Estruturas dos eventos emitidos pro JS |

Engine global: `Arc<Mutex<AudioEngine>>` em Tauri state, com `HashMap<ChannelId, Channel>` pré-criado com `main` e `preview`.

### JS (`apps/desktop/src/lib/audio/`)

| Arquivo | Substitui | Responsabilidade |
|---|---|---|
| `engine.ts` | `audio.ts` (Howler) | Wrappers Tauri: `playSong(channel, ...)`, `pause`, `seek`, `setVolume`, `stop`, `testDevice` |
| `devices.ts` | (novo) | `listDevices()`, `setPreferredDevice(channel, id)`, `getCurrentDevice(channel)`, subscribe |
| `events.ts` | (novo) | Listener centralizado dos eventos Rust → atualiza stores |

### Stores

| Store | Estado novo |
|---|---|
| `player.ts` | `mainDevice: { preferred, current, inFallback }` |
| `preview.ts` (novo) | `previewDevice: { preferred, current, inFallback }`, `previewSong`, `previewIsPlaying`, `previewPosition`, `previewVolume` |
| `audioDevices.ts` (novo) | Lista live de devices disponíveis |

Persistência em `localStorage`:
- `leviticus_audio_main_device` (preferred ID ou null pra system default)
- `leviticus_audio_preview_device`
- `leviticus_audio_main_volume`
- `leviticus_audio_preview_volume`

### Páginas/componentes

- `Preferences.tsx` (NOVA, em `/preferences`)
- `AudioOutputSection.tsx` (NOVO) — em Preferences, com dropdowns, botão "Testar", sliders de volume
- `PlayerMini.tsx` — adiciona indicador `inFallback`
- `AddSongModal.tsx` — preview migra de MSE+Howler pra `engine.ts`
- `Layout.tsx` — ícone de engrenagem no topo direito → `/preferences`

## Fluxo de dados

### Tauri commands (JS → Rust)

```rust
audio_list_devices() -> Vec<Device>
// Device { id: String, name: String, is_default: bool, available: bool }

audio_set_preferred(channel: ChannelId, device_id: Option<String>) -> ()
// None = "usar default do sistema"

audio_play(channel: ChannelId, source: AudioSource, opts: PlayOpts) -> PlayResult
// AudioSource::File(path) | AudioSource::Youtube(url) | AudioSource::TestTone
// PlayOpts { song_id, playlist_id, duration_override_seconds, volume, start_position_seconds }
// PlayResult { current_device_id, in_fallback }

audio_pause(channel: ChannelId) -> ()
audio_resume(channel: ChannelId) -> ()
audio_stop(channel: ChannelId) -> ()
audio_seek(channel: ChannelId, position_seconds: f64) -> ()
audio_set_volume(channel: ChannelId, volume: f32) -> ()
audio_test_device(device_id: String) -> ()
audio_get_state(channel: ChannelId) -> ChannelState
```

### Eventos (Rust → JS)

| Evento | Payload | Quando |
|---|---|---|
| `audio:position` | `{ channel, seconds }` | ~4×/s enquanto playing |
| `audio:ended` | `{ channel, song_id }` | Fim natural — substitui `onend` do Howler |
| `audio:error` | `{ channel, code, message }` | Falha de decode ou erros não-recuperáveis |
| `audio:device-lost` | `{ channel }` | Stream falhou mid-playback (device sumiu). JS pausa o canal |
| `audio:device-changed` | `{ channel, current_device_id, in_fallback }` | Hot-plug detectado, preferred voltou ao normal |
| `audio:devices-list-changed` | `{ devices: [...] }` | Hot-plug detectado pelo watcher |
| `audio:test-ended` | `{}` | Tom de teste terminou |

### Sequência: play normal no canal main

```
JS: invoke('audio_play', main, File(path), opts)
Rust: tenta preferred → cai pra default se preciso → cria Sink/Stream
Rust: retorna PlayResult { current_device_id, in_fallback }
JS: atualiza store player.mainDevice
Rust (loop): emit audio:position 4×/s
Rust (fim): emit audio:ended → JS chama handleSongEnd
```

### Sequência: play paralelo (preview enquanto main toca)

```
JS: calcula targetPreviewDevice (preferred || default)
JS: compara com store.player.mainDevice.current
   se igual → abre modal warning (caso a ou b)
   se diferente → invoke('audio_play', preview, ...) — paralelo silencioso
Rust: cria Sink/Stream pro preview SEM tocar no canal main
```

### Sequência: device do canal main morre mid-playback

```
Rust: cpal stream error → captura
Rust: emit audio:device-lost { channel: main }
JS: store atualiza isPlaying=false, mostra toast "Saída perdida — toque play pra continuar"
Usuário clica play de novo:
  - Preferred voltou? → toca no preferred (estado normal)
  - Ainda fora? → toca no default + inFallback=true (mesmo caminho do start fresh)
```

### Sequência: preferred device reaparece

```
Rust watcher: detecta `preferredDeviceId` voltou na lista
Rust: NÃO interrompe música atual; emit audio:devices-list-changed
Rust: na próxima audio_play, usa o preferred → in_fallback volta pra false
Rust: emit audio:device-changed { channel, current, in_fallback: false }
JS: ícone de fallback some
```

### Sequência: streaming do AddSongModal

```
JS: invoke('audio_play', preview, Youtube(url), opts)
Rust: spawn yt-dlp como child process, lê stdout
Rust: alimenta symphonia decoder com chunks de stdout
Rust: rodio Sink consome PCM decodificado
Rust: começa a tocar ~1-2s (primeiros frames decodificados)
JS: igual ao caso normal — recebe position/ended
```

## Comportamento de fallback

### Regra unificada (pros 2 canais)

| Momento | Saída preferida indisponível |
|---|---|
| Ao clicar PLAY (ou início de fila / autoplay-next) | Cai pra system default, marca `inFallback`, ícone ⚠ + toast 1×/sessão. Toca normalmente |
| **Durante reprodução** (device some no meio) | **PAUSA o canal afetado.** Toast: "Saída perdida — toque play pra continuar" |

**Justificativa:** quando o usuário clica play, ele quer ouvir algo (fallback ajuda). Quando música já está tocando, áudio sumir de repente é evento — pause é o que usuário esperaria de um player normal.

### Caso 3 — NENHUMA saída disponível

- `default_output_device()` retorna `None`
- Toast erro: "Nenhuma saída de áudio disponível. Conecte um dispositivo e tente de novo."
- Player parado, watcher segue ativo
- Quando aparecer device → toast "Saída detectada, toque play pra continuar"

### Detecção de colisão (mesmo device em ambos)

Calculada ANTES de iniciar a prévia:
```
targetPreviewDevice = preview.preferred || systemDefault
mainCurrentDevice = store.player.mainDevice.current

if (mainIsPlaying && targetPreviewDevice === mainCurrentDevice):
    abrir modal warning (caso a ou b)
else:
    tocar prévia em paralelo, silencioso
```

Não há mais auto-recovery mid-playback (consequência da decisão acima), então não há colisão mid-playback pra resolver.

## UI

### Página `/preferences` (NOVA)

Acesso: ícone de engrenagem no topo direito do Layout.

**Seção "Saídas de áudio":**

```
┌─────────────────────────────────────────────────────────┐
│  Saídas de áudio                                        │
│  Configure onde o áudio principal e a prévia tocam      │
│                                                         │
│  ─────── Player principal ──────────────────────────    │
│  Saída preferida                                        │
│  ┌─────────────────────────────────────┐  ┌────────┐    │
│  │ AirPods do João                   ▼ │  │ Testar │    │
│  └─────────────────────────────────────┘  └────────┘    │
│  ⚠ Indisponível agora — usando MacBook Pro Speakers     │
│                                                         │
│  Volume                                                 │
│  ━━━━━━━━━━●━━━━━━━━━━━━━━━━━ 65%                       │
│                                                         │
│  ─────── Prévia ────────────────────────────────────    │
│  Saída preferida                                        │
│  ┌─────────────────────────────────────┐  ┌────────┐    │
│  │ Fone Sennheiser HD600             ▼ │  │ Testar │    │
│  └─────────────────────────────────────┘  └────────┘    │
│                                                         │
│  Volume                                                 │
│  ━━━━━━━━━━━━━━●━━━━━━━━━━━━━ 80%                       │
│                                                         │
│  ℹ Quando a prévia e o player principal usam a mesma    │
│    saída, ouvir prévia pausa o que está tocando.        │
└─────────────────────────────────────────────────────────┘
```

Comportamento:
- Dropdown lista devices live (`audio:devices-list-changed`)
- Opção sempre no topo: "Usar padrão do sistema" (`preferredDeviceId = null`)
- Devices indisponíveis aparecem cinza com "(desconectado)" — selecionáveis (vira preferred quando aparecer)
- Aviso amarelo quando `inFallback === true`
- "Testar" toca tom no device do dropdown (não no preferred salvo — no selecionado agora, sem precisar salvar)
- Mudanças salvam no `onChange` (sem botão "Salvar")
- Hot-update: mudar saída do main durante reprodução → aplica na próxima música; toast: "Saída do principal mudada — vai aplicar na próxima música"

### Modal warning — caso (a) colisão por configuração

```
┌──────────────────────────────────────────────┐
│  ⚠ Saídas iguais                             │
│                                              │
│  Prévia e player principal vão tocar em:     │
│  MacBook Pro Speakers                        │
│                                              │
│  Ouvir a prévia vai pausar o que está        │
│  tocando agora.                              │
│                                              │
│  [ Mudar saída da prévia → ]                 │
│                                              │
│        [ Pausar principal ]  [ Cancelar ]    │
└──────────────────────────────────────────────┘
```

### Modal warning — caso (b) colisão por fallback

```
┌──────────────────────────────────────────────┐
│  ⚠ Saída preferida indisponível              │
│                                              │
│  Prévia configurada para:                    │
│  Fone Sennheiser HD600 (desconectado)        │
│                                              │
│  Vai tocar em: MacBook Pro Speakers —        │
│  mesma do player principal.                  │
│                                              │
│  [ Configurar outra saída → ]                │
│                                              │
│        [ Pausar principal ]  [ Cancelar ]    │
└──────────────────────────────────────────────┘
```

Link "Mudar saída" / "Configurar outra saída" → `/preferences` com dropdown da prévia em foco. Estado `previewIntent` (música que ia tocar) guardado no store; quando voltar pra biblioteca/culto, reapresenta modal com estado novo (se ainda houver colisão) ou inicia prévia automaticamente.

### PlayerMini — indicador de fallback

Ícone ⚠ amarelo discreto à direita do título quando `main.inFallback === true`. Hover/click → tooltip "AirPods indisponível — usando MacBook Pro Speakers. [Configurar →]".

### Botão "Tocar teste"

- Toca arquivo bundleado curto (~3s) — provavelmente sample MP3 ou tom suave (~30KB)
- Usa canal **`test`** Rust separado, criado on-demand e descartado após
- NÃO interfere com main/preview — toca em paralelo no device escolhido
- Durante teste: label vira "⏹ Parar" + barra de progresso fina
- Falha de teste (ex: device sumiu entre seleção e click) → toast erro

## Edge cases

| Cenário | Comportamento |
|---|---|
| 0 saídas no aparelho | Toast "Nenhuma saída disponível". Watcher segue ativo; quando aparecer device, toast + reabilita play |
| 2 devices com mesmo nome | `preferredDeviceId` usa ID CPAL único; display dedup por sufixo: "AirPods (1)" / "AirPods (2)" |
| Trocar device do main durante repeat-one | Mudança aplica na próxima volta da música (não no meio do loop atual) |
| Pause + resume com device sumido entre | Resume detecta no momento de criar stream, cai em fallback (mesma regra do click play) |
| Test tone tocando + user clica play no main | Test continua em paralelo até fim (~3s). Não interfere |
| Bluetooth com latência alta (~250ms) | Sem compensação especial. Symphonia+rodio ~50ms; OS gerencia buffer bluetooth. Aceitável pro caso |
| Media keys macOS | Continuam controlando apenas canal **main**. Prévia ignora media keys |
| Sentry observability | Erros emitem `audio:error` → JS captura via listener central com `feature: 'audio-engine'` |
| Migração 0.18.x → versão com feature | Primeiro launch sem `preferredDeviceId` → ambos usam system default. Funciona como antes. Nudge sutil 1× "Configure saídas separadas?" no topo da Library (dispensável) |

## Testing

### Unit (Vitest)

- `audio/devices.ts` — listDevices retorna devices, dedup por ID
- `audio/engine.ts` — wrappers de commands com mock de `invoke`
- `store/preview.ts` — preferred/current/inFallback transitions
- `detectCollision(mainDevice, previewTarget)` — função pura
- `resolveTargetDevice(preferred, available, systemDefault)` — função pura

### Rust (cargo test)

- `audio_engine`:
  - Criar engine, listar devices (host mock), play file mockado
  - Fallback: preferred = "fake-id-inexistente" → cai em default
  - Hot-plug simulation via host mock — emite evento correto
- Symphonia decode: smoke tests com fixtures pequenas (mp3/m4a/flac de ~5s)

### E2E (WebdriverIO Linux CI)

- Linux CI não tem device de áudio. Mock total da Tauri command no spec
- Cobertura mínima: `/preferences`, ver lista (mock), trocar dropdown, abrir AddSongModal e disparar prévia, modal warning aparece quando target colide com main mockado

### Manual (macOS)

- Cenário 1: fone bluetooth como preview → main em built-in + prévia em fone → ouvir ambas paralelas
- Cenário 2: desconectar bluetooth durante prévia → prévia para, toast
- Cenário 3: clicar test no built-in → 3s de tom
- Cenário 4: hot-plug fone → list atualizar na config

## Fases de entrega

PRs separáveis pra manter cada um reviewable. App fica navegável após cada PR.

**PR 1 — Audio engine Rust base (shadow)**
- `audio_engine/` em Rust (channel, device, decoder, events)
- Tauri commands expostos
- Apenas canal `main` funcional; não conectado ao JS ainda
- Testes Rust passando
- App continua usando Howler

**PR 2 — JS engine wrapper + migração do player principal**
- `audio/engine.ts`, `audio/events.ts`
- `player.ts` store + listeners
- Substitui Howler em PlayerMini + playback.ts + audio.ts caller-sites
- Remove Howler.js do `package.json`
- Mantém preview do AddSongModal por enquanto
- Suite unit + manual smoke

**PR 3 — Canal preview no Rust + remoção do MSE**
- Adiciona canal `preview` no Rust com streaming progressivo
- Substitui MSE+chunks no AddSongModal pelo engine
- Substitui SongCard preview (se existir) pelo engine
- Modal warning ainda sem device dropdown (mantém copy atual)

**PR 4 — Configuração de devices + página `/preferences`**
- Página `Preferences.tsx` + `AudioOutputSection.tsx`
- Stores `audioDevices.ts`, `preview.ts` com persistência
- `localStorage` setup, hot-update
- Ainda sem test tone

**PR 5 — Test tone + indicadores de fallback**
- `audio_test_device` command + arquivo bundleado
- Botão "Testar" na config
- Ícone ⚠ no PlayerMini quando `inFallback`
- Toast 1×/sessão de fallback

**PR 6 — Modal warning atualizado**
- Cases (a) e (b) com copy nova + link pra `/preferences`
- Lógica de detecção de colisão integrada
- `previewIntent` pra reapresentar modal após mudar config

Estimativa total: ~3-4 semanas com testes manuais reais por fase.

## Open questions (post-implementation)

- Indicador do device atual no PlayerMini (fase 2 opcional) — útil ou polui?
- Atalho de teclado pra abrir `/preferences` (ex: Cmd+,)
- Suporte a Linux/Windows: CPAL cobre os três; testar bundle CI no Windows depois de PR 1
