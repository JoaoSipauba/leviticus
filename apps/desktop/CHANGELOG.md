# Changelog

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
