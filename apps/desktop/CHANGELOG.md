# Changelog

## [0.16.0](https://github.com/JoaoSipauba/leviticus/compare/v0.15.0...v0.16.0) (2026-05-25)

### Funcionalidades

* **admin:** Visitas por dia mostra granularidade horaria no preset Hoje ([#163](https://github.com/JoaoSipauba/leviticus/issues/163)) ([b2e29da](https://github.com/JoaoSipauba/leviticus/commit/b2e29da3a358cd7e1f7fd95f72e0149794401fb4))
* contabiliza minutos tocados em qualquer parada (song_stopped) ([#162](https://github.com/JoaoSipauba/leviticus/issues/162)) ([1f78224](https://github.com/JoaoSipauba/leviticus/commit/1f7822448b63442fe590f6c136178f144ba9ecd9))

### Correções

* **ci:** close-issues escuta workflow_run em vez de release.published ([#160](https://github.com/JoaoSipauba/leviticus/issues/160)) ([c568b7c](https://github.com/JoaoSipauba/leviticus/commit/c568b7c5389db18280ae74e97c9a2b514ddbebdb)), closes [#116](https://github.com/JoaoSipauba/leviticus/issues/116) [#120](https://github.com/JoaoSipauba/leviticus/issues/120) [#141](https://github.com/JoaoSipauba/leviticus/issues/141)

## [0.15.0](https://github.com/JoaoSipauba/leviticus/compare/v0.14.0...v0.15.0) (2026-05-24)

### Funcionalidades

* **ci:** poda releases antigas do bucket app-releases (retem 3) ([#150](https://github.com/JoaoSipauba/leviticus/issues/150)) ([80efbf0](https://github.com/JoaoSipauba/leviticus/commit/80efbf008eaee611f0e6ca5b5adcbf119d728504))

### Correções

* **admin:** preset 'Hoje' não filtrava (URL key 'hoje' vs resolver 'today') ([#151](https://github.com/JoaoSipauba/leviticus/issues/151)) ([22d7339](https://github.com/JoaoSipauba/leviticus/commit/22d73397dccb9e24e23f01e49a244d093ec3a7cb))

## [0.14.0](https://github.com/JoaoSipauba/leviticus/compare/v0.13.0...v0.14.0) (2026-05-24)

### Funcionalidades

* **admin:** redesign do dashboard com métricas event-driven ([#146](https://github.com/JoaoSipauba/leviticus/issues/146)) ([6601341](https://github.com/JoaoSipauba/leviticus/commit/660134114c27d6353ef9972c0b322d32198f3a78))

## [0.13.0](https://github.com/JoaoSipauba/leviticus/compare/v0.12.1...v0.13.0) (2026-05-23)

### Funcionalidades

* permission gating ([#120](https://github.com/JoaoSipauba/leviticus/issues/120)) ([#142](https://github.com/JoaoSipauba/leviticus/issues/142)) ([8c82fe9](https://github.com/JoaoSipauba/leviticus/commit/8c82fe958328c3416b90d291acdf4354744d9ad1))

### Correções

* **audio:** repeat-one cycle 2 — sanity check no timeupdate ([#116](https://github.com/JoaoSipauba/leviticus/issues/116)) ([#143](https://github.com/JoaoSipauba/leviticus/issues/143)) ([de529b6](https://github.com/JoaoSipauba/leviticus/commit/de529b625bacdf812f86c9478b2d16b4c327a31a))

## [0.12.1](https://github.com/JoaoSipauba/leviticus/compare/v0.12.0...v0.12.1) (2026-05-22)

## [0.12.0](https://github.com/JoaoSipauba/leviticus/compare/v0.11.0...v0.12.0) (2026-05-22)

### Funcionalidades

* add analytics module with durable event queue ([e810eea](https://github.com/JoaoSipauba/leviticus/commit/e810eea0367aa53159324e93265cc9810094fdb9))
* add analytics_events table for behavioral metrics ([00fc990](https://github.com/JoaoSipauba/leviticus/commit/00fc990fc2f8b84a99a2f274ab009a686311a7c1))
* add local analytics_queue table for durable event buffering ([ce9a61c](https://github.com/JoaoSipauba/leviticus/commit/ce9a61cbabb16d6a9086366c16d5155c9a929231))
* emit download_succeeded and download_failed analytics events ([23a5b09](https://github.com/JoaoSipauba/leviticus/commit/23a5b096a417ee76190a960e6d01bcbbea6235fb))
* emit song_completed analytics event on track end ([bdfd373](https://github.com/JoaoSipauba/leviticus/commit/bdfd3734bc7c053327830265e2ddbc903d434331))
* emit song_played analytics event ([60de19c](https://github.com/JoaoSipauba/leviticus/commit/60de19c8bf7a0054763341ff03031b681f79b167))
* findFileInFolder no provider Drive pra idempotencia de upload ([#122](https://github.com/JoaoSipauba/leviticus/issues/122)) ([981fae6](https://github.com/JoaoSipauba/leviticus/commit/981fae63dc2f29890206439e961460f3af29ec1c))
* flush analytics queue and emit app_opened event ([3523286](https://github.com/JoaoSipauba/leviticus/commit/3523286f7c56504f1e4a3aa6fd3c04f04276ffe8))
* **org:** abas revalidam em realtime quando o sync reativo ticka ([8ffea0b](https://github.com/JoaoSipauba/leviticus/commit/8ffea0b8bbda82d8e881be71373328ce849f08a9))
* **org:** refetch silencioso ao reativar aba (stale-while-revalidate) ([b291cd2](https://github.com/JoaoSipauba/leviticus/commit/b291cd29d200622895aa12a55f173e93e6ea8ba7)), closes [#110](https://github.com/JoaoSipauba/leviticus/issues/110)
* upload-session devolve alreadyExists quando arquivo ja existe ([#122](https://github.com/JoaoSipauba/leviticus/issues/122)) ([3b6db6c](https://github.com/JoaoSipauba/leviticus/commit/3b6db6cc0557520d84c7da086ff97d4f22fbccc8))

### Correções

* **a11y:** ConfirmModal com role=dialog e dispensa por teclado ([cabc75e](https://github.com/JoaoSipauba/leviticus/commit/cabc75e75d84e1a829b207d03804f791191f804d))
* client reconcilia upload quando arquivo ja existe no Drive ([#122](https://github.com/JoaoSipauba/leviticus/issues/122)) ([cdf407a](https://github.com/JoaoSipauba/leviticus/commit/cdf407a79a534711b595efc44f43e18a344e16b5))
* corrige aba de convites, revogação/exclusão e repeat-one ([8c07e44](https://github.com/JoaoSipauba/leviticus/commit/8c07e4481425be52420b5bc98aa8c1da31ee6e99)), closes [#116](https://github.com/JoaoSipauba/leviticus/issues/116) [#117](https://github.com/JoaoSipauba/leviticus/issues/117) [#118](https://github.com/JoaoSipauba/leviticus/issues/118)
* escapar backslash no findFileInFolder e reforcar teste ([#122](https://github.com/JoaoSipauba/leviticus/issues/122)) ([b0243fd](https://github.com/JoaoSipauba/leviticus/commit/b0243fdf56b2fe61f982397b527ddd70ad1b02f8))
* guard in-flight no upload pra evitar duplicata intra-device ([#122](https://github.com/JoaoSipauba/leviticus/issues/122)) ([bbff4ec](https://github.com/JoaoSipauba/leviticus/commit/bbff4ec97b580a72fb13cfb086f6216a5680ec24))
* **landing:** corrige feedback de review do dashboard admin ([378c31d](https://github.com/JoaoSipauba/leviticus/commit/378c31df8e482b9d59ebf285d4da8548339ee372))
* logar falha de refreshAccount pos-sync no boot ([#121](https://github.com/JoaoSipauba/leviticus/issues/121)) ([d9df921](https://github.com/JoaoSipauba/leviticus/commit/d9df921abc378ca49ba667b5de02f57018d4df20))
* **org:** carrega abas uma vez ao abrir Organização + corrige skeleton ([88c857d](https://github.com/JoaoSipauba/leviticus/commit/88c857de7f4126ae3b1ddd1c8c8321c5eea1e492))
* re-checar status de cloud apos syncOrg no boot ([#121](https://github.com/JoaoSipauba/leviticus/issues/121)) ([3578a26](https://github.com/JoaoSipauba/leviticus/commit/3578a267bfc3f8b3c0cbc140e2399ed0e1041c6c))
* refreshAccount distingue unknown de disconnected ([#121](https://github.com/JoaoSipauba/leviticus/issues/121)) ([01ab364](https://github.com/JoaoSipauba/leviticus/commit/01ab364624eea919bff647f86b316d425b7288f6))
* restaurar idempotencia server-side de handleUploadSession ([#122](https://github.com/JoaoSipauba/leviticus/issues/122)) ([b2b14b4](https://github.com/JoaoSipauba/leviticus/commit/b2b14b4b186f19a240db0f739a2d157d9a15c2fa))

## [0.11.0](https://github.com/JoaoSipauba/leviticus/compare/v0.10.0...v0.11.0) (2026-05-21)

### Funcionalidades

* **updater:** check no splash e download em background com auto-apply ([95580e4](https://github.com/JoaoSipauba/leviticus/commit/95580e481b54c3d2f1cfc76a28a6fdd11da17a56))

### Correções

* **sync:** grava last_sync com o início do sync, não o fim ([a59779a](https://github.com/JoaoSipauba/leviticus/commit/a59779a2c405af2dc4a397b478360b3ed14302f2))
* **updater:** timeout no download/check pra não travar splash nem checker ([8cb98bb](https://github.com/JoaoSipauba/leviticus/commit/8cb98bb492159c0e356a8c12db57e86dbf4af31f)), closes [#101](https://github.com/JoaoSipauba/leviticus/issues/101)

## [0.10.0](https://github.com/JoaoSipauba/leviticus/compare/v0.9.1...v0.10.0) (2026-05-20)

### Funcionalidades

* **culto:** adicionar música nova direto numa seção do culto ([1e4e858](https://github.com/JoaoSipauba/leviticus/commit/1e4e8583d7be99c476712ab6a26b52247a4d77b8))
* **culto:** indicador de músicas já na seção ([#67](https://github.com/JoaoSipauba/leviticus/issues/67) pt.2) ([65de6e4](https://github.com/JoaoSipauba/leviticus/commit/65de6e40a5380c7855e31e580fefef0b29940aa6))
* **doacao:** banner mensal de doação + link na sidebar ([f8b51dc](https://github.com/JoaoSipauba/leviticus/commit/f8b51dcac541842ebbc094aa179f51975ed799cd))
* **doacao:** move tab da igreja para abaixo do link de doação ([7c98329](https://github.com/JoaoSipauba/leviticus/commit/7c9832970e03b0c99f59dff5cdd449b0b6203312))
* **downloads:** AddSongModal enfileira em background (refs [#71](https://github.com/JoaoSipauba/leviticus/issues/71)) ([2a4e684](https://github.com/JoaoSipauba/leviticus/commit/2a4e684db608539c95eb8cf648f26c2cb822167a))
* **downloads:** DownloadDock com título, erro e animações ([4a77928](https://github.com/JoaoSipauba/leviticus/commit/4a7792895208f61cf244097190a60234f4cd923e))
* **downloads:** foundation pra background queue com retry + UI dock (refs [#71](https://github.com/JoaoSipauba/leviticus/issues/71)) ([8452802](https://github.com/JoaoSipauba/leviticus/commit/8452802d45e0c50b634a69438ca7bd78d3779c8f))
* **library:** banner de backup só sinaliza falha real de upload ([4eab27e](https://github.com/JoaoSipauba/leviticus/commit/4eab27ea0fb22896436c6baa57a24a50dd09ea0b))
* **org-info:** combobox filtrável de fuso horário (Closes [#86](https://github.com/JoaoSipauba/leviticus/issues/86)) ([2537389](https://github.com/JoaoSipauba/leviticus/commit/253738949c7abc187ec4f58d0a2bfea4a85bd070))
* **ux:** padroniza fechamento dos modais ([#91](https://github.com/JoaoSipauba/leviticus/issues/91)) ([a61a4d0](https://github.com/JoaoSipauba/leviticus/commit/a61a4d093b1944a0b6f26ea86684b8e903d4a72f))

### Correções

* **ci:** release-bump precisa de VITE_SUPABASE_URL/ANON_KEY no step Tests ([2b2b589](https://github.com/JoaoSipauba/leviticus/commit/2b2b58944a98e5de200dfffc637f4e62bd145094)), closes [#72](https://github.com/JoaoSipauba/leviticus/issues/72)
* **ci:** release.yml Tests step precisa VITE_SUPABASE_URL/ANON_KEY ([8e5a0c3](https://github.com/JoaoSipauba/leviticus/commit/8e5a0c3addb410dac1c8e44b9894d550d21497c2))
* **ci:** split Tauri build em 2 steps (macOS/Windows) — matrix invalid no shell field ([fddaca0](https://github.com/JoaoSipauba/leviticus/commit/fddaca0ce42e6f2a84b85ee45930a6f4b918a3c9))
* **downloads:** remove cache JS do ensureYtDlp ([b24e33c](https://github.com/JoaoSipauba/leviticus/commit/b24e33ca590a2b2f6e1b9cb47ef929666b81913a))
* **e2e:** espera tauri-driver abrir a porta 4444 antes da sessão ([ecd86c1](https://github.com/JoaoSipauba/leviticus/commit/ecd86c1a96e043688a7395a6f851822180fcaafb))
* **e2e:** spawn tauri-driver via node cli.js com caminho absoluto ([30f18f2](https://github.com/JoaoSipauba/leviticus/commit/30f18f2f540b7b2e57eee0499bcdf6cff24121bd))
* **ensure-owner-role:** bypass de service_role no RPC ([e6a6a01](https://github.com/JoaoSipauba/leviticus/commit/e6a6a013dd007751ad29212f7bf99b54cee28053))
* **integrations:** desabilita verify_jwt no cloud-storage-proxy pra renderizar HTML do callback OAuth ([43fbcd2](https://github.com/JoaoSipauba/leviticus/commit/43fbcd20c844bdeca21cf664f17b4fab55b1ab0b))
* **org-roles:** RPC ensure_owner_role idempotente + auto-recovery (Closes [#85](https://github.com/JoaoSipauba/leviticus/issues/85)) ([0f75d74](https://github.com/JoaoSipauba/leviticus/commit/0f75d74ea03fbce8dfc846610a0ee01629136f63))
* **release:** inline PLATFORM no script — env vars não chegam ao bash Windows self-hosted ([62e9129](https://github.com/JoaoSipauba/leviticus/commit/62e9129d5ccd64497b4bcff6adeb2b5dfa28108e))
* **review:** resolve comentários do Copilot no PR [#92](https://github.com/JoaoSipauba/leviticus/issues/92) ([1471315](https://github.com/JoaoSipauba/leviticus/commit/14713150d84d9678fb73725a8b255f250f745dc2))
* **yt-dlp:** evita unhandled rejection ao abortar fetch já concluído ([a5e5083](https://github.com/JoaoSipauba/leviticus/commit/a5e50838895737ff3a0e2667eec2bed08265f836))

## [0.8.0](https://github.com/JoaoSipauba/leviticus/compare/v0.7.3...v0.8.0) (2026-05-15)

### Funcionalidades

* aba Organização + suíte E2E completa + CI gate em main ([#17](https://github.com/JoaoSipauba/leviticus/issues/17)) ([5c32c48](https://github.com/JoaoSipauba/leviticus/commit/5c32c486beac6cfe34e55197981e85399a530de3))

## [0.7.3](https://github.com/JoaoSipauba/leviticus/compare/v0.7.2...v0.7.3) (2026-05-15)

### Correções

* **add-song:** parar prévia ao trocar de aba pesquisa↔URL ([#20](https://github.com/JoaoSipauba/leviticus/issues/20)) ([72f263e](https://github.com/JoaoSipauba/leviticus/commit/72f263ef89b163dbab178ef0b547d0d25efdda44))

## [0.7.2](https://github.com/JoaoSipauba/leviticus/compare/v0.7.1...v0.7.2) (2026-05-14)

### Correções

* **youtube:** search via HTML scrape + binários robustos ([#19](https://github.com/JoaoSipauba/leviticus/issues/19)) ([0dd3973](https://github.com/JoaoSipauba/leviticus/commit/0dd3973afb0988b079c7c9fdad344e285faff2de))

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
