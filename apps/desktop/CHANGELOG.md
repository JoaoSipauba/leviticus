# Changelog

## [0.7.1](https://github.com/JoaoSipauba/leviticus/compare/v0.7.0...v0.7.1) (2026-05-14)

### Correções

* **youtube:** integração 10-20× mais rápida (oEmbed + Innertube) ([#18](https://github.com/JoaoSipauba/leviticus/issues/18)) ([506f8a5](https://github.com/JoaoSipauba/leviticus/commit/506f8a5ff56bbb51281f8ff65fd6d74bf1f2b22c))

## [0.7.0](https://github.com/JoaoSipauba/leviticus/compare/v0.6.0...v0.7.0) (2026-05-14)

### Funcionalidades

* **landing+release:** unifica feed em latest.json + valida HEAD ([6efc8a2](https://github.com/JoaoSipauba/leviticus/commit/6efc8a21da689ca71e097dfd0d30346ee87b2f9b))
* **library:** toast ao remover música do dispositivo ([9534320](https://github.com/JoaoSipauba/leviticus/commit/95343208a27e499db7f0b5da0ab00a9567d05ed7))

### Correções

* **auth:** trata e-mail duplicado e melhora mensagens de erro no signup ([c2f89d7](https://github.com/JoaoSipauba/leviticus/commit/c2f89d783343cf21ae1a4d33d92cdc014408a1df))
* **landing:** viewport meta e overflow lateral em mobile/tablet ([ba18c03](https://github.com/JoaoSipauba/leviticus/commit/ba18c03db1ba99d9c980598a1dd4c734d502d9c4))
* **library:** menu de ações abre pra cima quando não cabe embaixo ([e277b09](https://github.com/JoaoSipauba/leviticus/commit/e277b099f28a33b05f34c30b82246745aa41b41a))
* **player:** seek slider commita posição só ao soltar o mouse ([4e070ff](https://github.com/JoaoSipauba/leviticus/commit/4e070ffaf340c450a4e24d99f57c68ce6ca50685))

## [0.6.0](https://github.com/JoaoSipauba/leviticus/compare/v0.5.0...v0.6.0) (2026-05-13)

### Funcionalidades

* **landing+release:** feed estático landing.json no Supabase ([8eecc21](https://github.com/JoaoSipauba/leviticus/commit/8eecc211180cbc46536beb8a716883350163081b))

## [0.5.0](https://github.com/JoaoSipauba/leviticus/compare/v0.4.0...v0.5.0) (2026-05-13)

### Funcionalidades

* **landing+ci:** versão dinâmica + path filters dos pipelines ([b699e48](https://github.com/JoaoSipauba/leviticus/commit/b699e4891929f237952a7585a733a2281b4acc7b))
* **landing:** habilitar Vercel Analytics e Speed Insights ([bfdf00b](https://github.com/JoaoSipauba/leviticus/commit/bfdf00b4c73e4615c4d18d03ce86cc4405c98c45))

### Correções

* **desktop:** UX de progresso, atalho Q e toast de exportação MP3 ([981590a](https://github.com/JoaoSipauba/leviticus/commit/981590ac9de6f31e2df5b706a49316e153fca221))
* review do Copilot no PR [#12](https://github.com/JoaoSipauba/leviticus/issues/12) ([601fb2c](https://github.com/JoaoSipauba/leviticus/commit/601fb2c13037e394f21d9e6e07066ffcd234982e))

## [0.4.0](https://github.com/JoaoSipauba/leviticus/compare/v0.3.0...v0.4.0) (2026-05-13)

### Funcionalidades

* **landing:** add landing page for Vercel deploy ([dddbd41](https://github.com/JoaoSipauba/leviticus/commit/dddbd418dfc17a40be55a1a09ff3bcf27805f395))
* **landing:** adicionar OG image gerada em runtime (edge) ([ccc5d75](https://github.com/JoaoSipauba/leviticus/commit/ccc5d757bf9d44e0e6eb6869dca1756daade759f))
* **landing:** integrar waitlist com Supabase ([aa27258](https://github.com/JoaoSipauba/leviticus/commit/aa27258794e228baf33802f2c61e5658fe4406bf))
* **landing:** migrate to Next.js App Router for SEO ([a631b1d](https://github.com/JoaoSipauba/leviticus/commit/a631b1d690165eac3fae518c36b5538c1f83f4be))
* **landing:** substituir logo CSS pelo SVG real do Figma ([032135d](https://github.com/JoaoSipauba/leviticus/commit/032135d6b4f5176ecfbff7bbcb511de7a49a7ee8))

### Correções

* **landing:** corrigir todos os pontos bloqueantes para produção ([b132fd1](https://github.com/JoaoSipauba/leviticus/commit/b132fd1868b27f50a8cc5e30304d47842383bef5))

## [0.3.0](https://github.com/JoaoSipauba/leviticus/compare/v0.2.0...v0.3.0) (2026-05-13)

### Funcionalidades

* **boot:** splash com equalizer animado (mesma identidade do ícone) ([b8ea0b4](https://github.com/JoaoSipauba/leviticus/commit/b8ea0b4aa512eb6ce5e5c297b71a0792d84ecf8c))
* **boot:** splash screen + boot resiliente a Supabase offline ([1b808d6](https://github.com/JoaoSipauba/leviticus/commit/1b808d6577dd95ccf3f23ae1c29ba6e7beec7a15))
* tracker global de mousemove para drop target via posição do cursor ([fcb6d6e](https://github.com/JoaoSipauba/leviticus/commit/fcb6d6e8c397dd5e3d783ecec71c6a12e86e15d9))
* zona de detecção expandida para drop de seções e músicas ([c58bf50](https://github.com/JoaoSipauba/leviticus/commit/c58bf507013e22653e67ff67b9f403dc490ec02f))

### Correções

* **boot:** baseline do equalizer agora extende além das barras ([e78c396](https://github.com/JoaoSipauba/leviticus/commit/e78c3963820545644960f09acf732c1fec2b730f))
* **download:** barra de progresso travava em ~95% em músicas grandes ([a983b39](https://github.com/JoaoSipauba/leviticus/commit/a983b39d64f34bf53a5c40fcbe58dc00452c0653))
* drag de seção não ativa mais drop zones de música ([1527457](https://github.com/JoaoSipauba/leviticus/commit/152745748158ab304c43fc4ed6e96958a4d1cc14))
* DropZone usa height:0 + absolute para zona de detecção confiável ([30843cf](https://github.com/JoaoSipauba/leviticus/commit/30843cf85d67751c2a59427220461468c476ed75))
* **ensure_*:** atomic write + cache validation + erro com target ([2a66f85](https://github.com/JoaoSipauba/leviticus/commit/2a66f85ab85ea336a73517d2ab4b910f3252cc0e)), closes [#8](https://github.com/JoaoSipauba/leviticus/issues/8) [#1](https://github.com/JoaoSipauba/leviticus/issues/1)
* **export:** baixar ffmpeg em runtime — resolve export Windows ([aa6710b](https://github.com/JoaoSipauba/leviticus/commit/aa6710b4061d66a6137bf4195ba1e2a2a33af6e0))
* indicador de seção apaga ao sair da zona de drop ([a69af6a](https://github.com/JoaoSipauba/leviticus/commit/a69af6a5703a4e282b7190a2b9ef979c793c2a20))
* indicador de seção some ao entrar no conteúdo da seção ([a09cbf5](https://github.com/JoaoSipauba/leviticus/commit/a09cbf518822adef0dbf5aa954e76f45b88c13e2))
* **player:** liberar http(s)://asset.localhost no CSP — toca áudio no Windows ([1ca9017](https://github.com/JoaoSipauba/leviticus/commit/1ca901781030c33b3bfbb989d9613c18d8eefde4))
* reordenação de músicas no culto via mouse events (padrão PlayerExpanded) ([08510a9](https://github.com/JoaoSipauba/leviticus/commit/08510a9739e033c40013e913f8f0d015ac95dd9d))
* reordenação de seções no culto via mouse events (padrão PlayerExpanded) ([0f8e9c0](https://github.com/JoaoSipauba/leviticus/commit/0f8e9c098cce82b74aff67dd7c5186319316a299))
* **sonar:** bound regex de trailing dot/space (S5852 ReDoS) ([576c693](https://github.com/JoaoSipauba/leviticus/commit/576c6937a2cb4314730c50fe2a9acc8b1ba24f65))
* **sonar:** zip-bomb limit + permissões 0o700 nos binários baixados ([a1b7abb](https://github.com/JoaoSipauba/leviticus/commit/a1b7abbca676db1401e5f3c5fc84779dace967ab))
* **updater:** progresso real + Windows não fecha sem prompt de reiniciar ([6dd97aa](https://github.com/JoaoSipauba/leviticus/commit/6dd97aa2690127195a8cb3b22cb4280f4837053e))
* **windows:** downloadDir, reserved-name sanitize, shell:bash no build ([1c74c21](https://github.com/JoaoSipauba/leviticus/commit/1c74c21ca9021fcc6f082b6951ccdfd39ca968f7))
* **yt-dlp,ffmpeg:** SHA-256 check + spawn_blocking na descompressão ([aba0666](https://github.com/JoaoSipauba/leviticus/commit/aba06662d2389f5f5e76b52590309e3004187086))

## [0.2.0](https://github.com/JoaoSipauba/leviticus/compare/v0.1.15...v0.2.0) (2026-05-13)

### Funcionalidades

* **release:** bump de versão automatizado via GH Actions ([26dfbfe](https://github.com/JoaoSipauba/leviticus/commit/26dfbfe66f0683b5eeb8b134c694a3d02d08e3e9))
* **release:** bump full-auto em push pra main ([62a9e07](https://github.com/JoaoSipauba/leviticus/commit/62a9e07558dacd1fb9fd6e310834791dd5747450))

## [0.1.15](https://github.com/JoaoSipauba/leviticus/compare/v0.1.14...v0.1.15) (2026-05-13)

### Correções

* **yt-dlp:** baixar em runtime pra fora do .app (resolve Mac + Windows) ([f210029](https://github.com/JoaoSipauba/leviticus/commit/f21002930a9f599d02efbcdb89f8e38738f65258))

## [0.1.14](https://github.com/JoaoSipauba/leviticus/compare/v0.1.13...v0.1.14) (2026-05-11)

### Funcionalidades

* **release:** criar GitHub Release com assets do Supabase no publish ([1ccbce5](https://github.com/JoaoSipauba/leviticus/commit/1ccbce51f8c8265ee4b10a4f7b24878b245c55ce))
* **yt-dlp:** bundle como sidecar Tauri (Windows + macOS) ([990ade5](https://github.com/JoaoSipauba/leviticus/commit/990ade53fa697b16895c6bd7479aac71e9b5205a))

## [0.1.13](https://github.com/JoaoSipauba/leviticus/compare/v0.1.12...v0.1.13) (2026-05-11)

### Funcionalidades

* **release:** adicionar build Windows (NSIS) ao pipeline ([1e54458](https://github.com/JoaoSipauba/leviticus/commit/1e544587d6dee2a930179f1036d9da2d9a842bb1))

## [0.1.12](https://github.com/JoaoSipauba/leviticus/compare/v0.1.11...v0.1.12) (2026-05-11)

### Funcionalidades

* **release:** distribuir via Supabase Storage (repo é privado) ([689833a](https://github.com/JoaoSipauba/leviticus/commit/689833a21426751eb8b7398a62010557452192b7))

## [0.1.11](https://github.com/JoaoSipauba/leviticus/compare/v0.1.10...v0.1.11) (2026-05-11)

### Correções

* **tauri:** habilitar createUpdaterArtifacts no bundle config ([ca6a410](https://github.com/JoaoSipauba/leviticus/commit/ca6a410120c30d67ec3dafe7f43ec936290298f3))

## [0.1.10](https://github.com/JoaoSipauba/leviticus/compare/v0.1.9...v0.1.10) (2026-05-11)

### Correções

* **release:** substituir tauri-action por chamada direta ao Tauri CLI ([e81487d](https://github.com/JoaoSipauba/leviticus/commit/e81487d8781ac63d7215bca77e6255258b6b4251))

## [0.1.9](https://github.com/JoaoSipauba/leviticus/compare/v0.1.8...v0.1.9) (2026-05-11)

### Correções

* **release:** --bundles app,dmg,updater pra Tauri assinar o tar.gz final ([0a89ae9](https://github.com/JoaoSipauba/leviticus/commit/0a89ae96fbd66b6c78bfc81ed82ccc798ff7d96b))

## [0.1.8](https://github.com/JoaoSipauba/leviticus/compare/v0.1.7...v0.1.8) (2026-05-11)

### Correções

* **release:** localizar .sig dinamicamente + log do bundle dir ([8ff9941](https://github.com/JoaoSipauba/leviticus/commit/8ff9941e69e1564d12575463f5cbda38e7a34333))

## [0.1.7](https://github.com/JoaoSipauba/leviticus/compare/v0.1.6...v0.1.7) (2026-05-11)

### Correções

* **release:** montar latest.json na unha (workaround bug tauri-action) ([a881ca8](https://github.com/JoaoSipauba/leviticus/commit/a881ca808a45735380591678fc16e12f7634005b))

## [0.1.6](https://github.com/JoaoSipauba/leviticus/compare/v0.1.5...v0.1.6) (2026-05-11)

### Correções

* **ci:** pinar todas as actions por SHA (Sonar S7637) ([1e5ffd0](https://github.com/JoaoSipauba/leviticus/commit/1e5ffd096bf616be7fafe4b4649e32db0fe9e6e4))
* **release:** pin tauri-action em v0.6.2 pra publicar latest.json ([63554af](https://github.com/JoaoSipauba/leviticus/commit/63554af3e67b9fa926ab356e7dfe782953e62b66))
* **release:** pin tauri-action por SHA (Sonar S7637) ([e746368](https://github.com/JoaoSipauba/leviticus/commit/e746368c207f2adb8e8d215a31de0da0bee30d09))

## [0.1.5](https://github.com/JoaoSipauba/leviticus/compare/v0.1.4...v0.1.5) (2026-05-11)

### Correções

* **release:** remover --target pra tauri-action achar o .sig do updater ([b9bae22](https://github.com/JoaoSipauba/leviticus/commit/b9bae22d24daf57103c9215d5997d46ded8f2eab))

## [0.1.4](https://github.com/JoaoSipauba/leviticus/compare/v0.1.3...v0.1.4) (2026-05-11)

### Funcionalidades

* **player:** format >1h + integração MediaSession + workflow dev ([e873824](https://github.com/JoaoSipauba/leviticus/commit/e87382420ce57b7a1e08e675e806a2774a5d7952))

### Correções

* SonarCloud camada 1 (bug real + void operator + regex ReDoS) ([cce97a9](https://github.com/JoaoSipauba/leviticus/commit/cce97a97631f2909719b13cd21482dcce203454a))
* **updater:** dismissal só na sessão + intervalo 6h -> 1h ([5c7af7b](https://github.com/JoaoSipauba/leviticus/commit/5c7af7bdfe23286174360dec90dfd87d6cfb033c))

## [0.1.3](https://github.com/JoaoSipauba/leviticus/compare/v0.1.2...v0.1.3) (2026-05-10)

### Correções

* **release:** injetar VITE_SUPABASE_URL/ANON_KEY no build via secrets ([415a05a](https://github.com/JoaoSipauba/leviticus/commit/415a05a3804c29070237805c9317bb1d4a92f989))

## [0.1.2](https://github.com/JoaoSipauba/leviticus/compare/v0.1.1...v0.1.2) (2026-05-10)

### Correções

* **macos:** ad-hoc signing + release notes com comando xattr ([b456dbf](https://github.com/JoaoSipauba/leviticus/commit/b456dbf7f514d980b2893398d8cd9c6f079ed2bd))

## [0.1.1](https://github.com/JoaoSipauba/leviticus/compare/v0.1.0...v0.1.1) (2026-05-10)

### Funcionalidades

* ambiente dev isolado + erros específicos do insert de música ([372de90](https://github.com/JoaoSipauba/leviticus/commit/372de904879d16ad3e6371476280cc6c843ea713))
* bloqueia ações offline em todo lugar que escreve no Supabase ([5489d65](https://github.com/JoaoSipauba/leviticus/commit/5489d65f8216cc854fcb98517cc60f84769b25a4))
* dev usa Supabase local, prod continua com remoto ([4531122](https://github.com/JoaoSipauba/leviticus/commit/4531122c4c85eb1af5e21df4d0d538e34f0b2575))
* hover do 'Adicionar música' altera cor do texto suavemente ([55c190a](https://github.com/JoaoSipauba/leviticus/commit/55c190a71ee07e80a9762c83a8003946c9eb9fb5))
* indicador de download proeminente nos cultos (Opção D) ([d0a5ae1](https://github.com/JoaoSipauba/leviticus/commit/d0a5ae18c03d7946bb4124b848cdbd0fc80954b3))
* pipeline de release com auto-updater + checklist de migrations ([2073ef9](https://github.com/JoaoSipauba/leviticus/commit/2073ef9d52fc9676ef19e6950bcc0781cd3b60ae))
* seek na prévia pula o stream pro byte correspondente ([fef0fe8](https://github.com/JoaoSipauba/leviticus/commit/fef0fe896f1f91403ee12d8ce364b757d78ce071))
* streaming MSE via Tauri HTTP + buffer no slider da prévia ([138dd4d](https://github.com/JoaoSipauba/leviticus/commit/138dd4d5c969c499c561fa3b68d70c03c8fefce2))
* streaming progressivo da prévia + suporte a duração com horas ([e5d5788](https://github.com/JoaoSipauba/leviticus/commit/e5d57883f249085d0e91508a56c419d5f4d6744b))

### Correções

* 3 bugs do player no detalhe do culto ([aa03bbe](https://github.com/JoaoSipauba/leviticus/commit/aa03bbe06cd62f43ddd76d90f2ca27d2916c4377))
* aborta MSE em retry e reta Range falho 3x antes de desistir ([bb1cfab](https://github.com/JoaoSipauba/leviticus/commit/bb1cfab6923129f1119ee4b664c807896cb9e0a0))
* ActionsMenu da listagem de cultos não disparava ações ([4f55b32](https://github.com/JoaoSipauba/leviticus/commit/4f55b32e04b48bae3abf5222cb3807921ae58a13))
* botão 'Adicionar música' não muda no hover ([8eeb228](https://github.com/JoaoSipauba/leviticus/commit/8eeb228145599f369bc8cd7a5dbc8890e210e574))
* clicks no menu do culto/seção não disparavam mais a ação ([eaa1533](https://github.com/JoaoSipauba/leviticus/commit/eaa15333a0afba3d3c0e8b368b1b2446c0fd0891))
* desabilitar autocorreção e autocomplete do macOS no campo de busca ([5cec2e0](https://github.com/JoaoSipauba/leviticus/commit/5cec2e0b65b5cf77f1adeb04a3fcaf48e7597b1d))
* hover de fundo nos itens de Editar/Excluir da listagem de cultos ([f5cc161](https://github.com/JoaoSipauba/leviticus/commit/f5cc1619436ab6fbfb5f2c9f6215fbb9630a5b4e))
* hover do 'Adicionar música' não cresce mais — só muda cor ([5ca20b1](https://github.com/JoaoSipauba/leviticus/commit/5ca20b17dcfba9e8ff574a5d2dec946d62cac1bc)), closes [#9ca3af](https://github.com/JoaoSipauba/leviticus/issues/9ca3af) [#9ca3af](https://github.com/JoaoSipauba/leviticus/issues/9ca3af)
* liberar buffer já tocado quando atinge cota do SourceBuffer ([2d6f1c9](https://github.com/JoaoSipauba/leviticus/commit/2d6f1c932f4fcd2eae2b9aacd83a35aee2e4fa94))
* ocultar 'Excluir da biblioteca' no menu da música dentro do culto ([46dd101](https://github.com/JoaoSipauba/leviticus/commit/46dd101c089fcf989f14f9e29daa7b1f99a60c9c))
* PlayerMini some sem música e remove pb das listas ([7aa12f6](https://github.com/JoaoSipauba/leviticus/commit/7aa12f69cd6011f96a727d73f0fd87f0f81b451a))
* remover padding-right ao rolar que espremía os cards da busca ([59ce2e7](https://github.com/JoaoSipauba/leviticus/commit/59ce2e723b261a9ac64d0feb21a6a8ab0aaefe15))
* socket-timeout, outputBuf no stdout e timeout de 3min no download ([93187bd](https://github.com/JoaoSipauba/leviticus/commit/93187bdf73b4f25895c74e03027fae29d4acc6bb))
* título completo e timer da prévia que continuava após o fim ([9927ced](https://github.com/JoaoSipauba/leviticus/commit/9927cedcea7e7d5c6056ed547a840d9d7c3b4a0e))
* usar sourceBuffer.buffered pra atualizar progresso de buffer ([ef68a4e](https://github.com/JoaoSipauba/leviticus/commit/ef68a4e95cb488d404769e557c2a4ffb82e3477a))

### Performance

* prévia via Range requests grandes ao invés de streaming ([700226b](https://github.com/JoaoSipauba/leviticus/commit/700226b3ba5d9670491914d757c03ae3d2171c76))
