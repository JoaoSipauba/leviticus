# Self-hosted runners — setup e troubleshooting

Documenta como os runners self-hosted Mac e Windows estão configurados pra rodar CI + Release pipelines. Migração feita em [#73](https://github.com/JoaoSipauba/leviticus/issues/73) pra escapar da quota de Ubuntu hosted runners (Free plan: 2000min/mês em repos privados).

## Visão geral

| Runner | Labels | Workloads |
|---|---|---|
| `leviticus-mac-arm64` | `[self-hosted, macOS, ARM64, leviticus]` | CI (typecheck + tests), release-bump, release build macOS, issue-status, release-close-issues |
| `leviticus-win-x64` | `[self-hosted, leviticus, Windows, X64]` | Release build Windows, E2E (quando reativar) |

Ambos rodam na máquina do desenvolvedor (Mac M1 + JOAO-PC Windows 11 Pro). Sem custo recorrente vs GitHub Actions hosted.

## Mac runner

### Instalação
- Pasta: `~/.actions-runner-leviticus-mac/`
- Service: `actions.runner.JoaoSipauba-leviticus.leviticus-mac-arm64` via launchctl
- Auto-start: plist em `~/Library/LaunchAgents/`

### Dependências instaladas
- Node 22 (toolcache do runner: `_work/_tool/node/22.22.3/`)
- pnpm (via corepack)
- Rust toolchain (rustup)
- jq, curl, git (default macOS)
- Docker Desktop pra Supabase local (necessário pro E2E quando reativado)

### Recuperar service após reboot
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/actions.runner.JoaoSipauba-leviticus.leviticus-mac-arm64.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/actions.runner.JoaoSipauba-leviticus.leviticus-mac-arm64.plist
```

## Windows runner

**IP estático**: `192.168.0.29` (configurado via PowerShell `Set-NetIPInterface -Dhcp Disabled`).
**SSH host alias** (no Mac): `ssh leviticus-win` — usa chave do Bitwarden SSH agent.

### CRÍTICO: runner DEVE rodar como user `joaos`, não SYSTEM

Tauri 2 builda OK em ambos os contextos, mas o **`makensis` (NSIS) falha com `error 0x2` quando o runner roda como SYSTEM** — bug conhecido ([tauri-apps/tauri#9895](https://github.com/tauri-apps/tauri/issues/9895)). NSIS é baixado pelo Tauri pro AppData do user que invoca, e o SYSTEM tem restrições de execução nesse path.

Estado atual: service Windows instalado, mas configurado pra StartupType=Manual. Roda em foreground via `run.cmd` numa sessão do user `joaos`.

**Pra subir após reboot**:
1. Logar no Windows como `joaos`
2. Abrir PowerShell normal (não admin)
3. ```powershell
   cd C:\actions-runner-leviticus
   .\run.cmd
   ```
4. Aguardar `√ Connected to GitHub` + `Listening for Jobs`
5. Deixar janela aberta

### Dependências instaladas

#### Via winget
- `Microsoft.VisualStudio.2022.BuildTools` — MSVC compiler + linker
  - Componentes: `Microsoft.VisualStudio.Workload.VCTools` + `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` + `Microsoft.VisualStudio.Component.Windows11SDK.22621`
- `Microsoft.VCRedist.2015+.x64` — runtime DLLs (vcruntime140, msvcp140, ucrtbase)
- `NSIS.NSIS` — installer maker pra `makensis` (Tauri baixa próprio mas pode dar problema)
- `jqlang.jq` — parser JSON usado nos scripts de upload do release.yml
- `Docker.DockerDesktop` — Supabase local

#### Via cargo
- `cargo-binstall` — installer de binários pré-compilados
- `tauri-driver` — WebDriver pra E2E

Localização: `C:\Users\joaos\.cargo\bin\` (espelhado em `C:\Windows\System32\config\systemprofile\.cargo\bin\` pra service compat).

#### Via npm global
- `edgedriver` — Microsoft Edge WebDriver wrapper (E2E)
- `msedgedriver.exe` (baixado manualmente do msedgedriver.microsoft.com pro `~/.cargo/bin/`)

#### Features Windows habilitadas (via dism)
- `Microsoft-Windows-Subsystem-Linux` (WSL2 kernel pro Docker)
- `VirtualMachinePlatform`
- `HypervisorPlatform` ← essencial pro Docker WSL2 backend

#### WSL2
- Instalado via `winget install Microsoft.WSL`
- Versão: 2.7.3 / kernel 6.6.114.1
- Docker Desktop usa WSL2 backend por default

## CI workflow specifics (Windows)

### Resolução de conflitos de PATH

#### `link.exe` (linker MSVC vs GNU)
Git for Windows tem um binário `link` (GNU coreutils, similar a `ln`) que aparece antes do MSVC `link.exe` no PATH. Cargo invoca o linker e pega o errado, falha com "extra operand".

**Fix**: em todo step que faz `cargo build` no Windows:
```yaml
- name: Resolve MSVC linker absolute path
  shell: powershell
  run: |
    $msvc = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
    $ver = (Get-ChildItem $msvc -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $linkPath = "$msvc\$ver\bin\Hostx64\x64\link.exe"
    "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=$linkPath" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding ASCII
```

#### MSVC environment
```yaml
- name: Setup MSVC environment (Windows only)
  if: matrix.platform_key == 'windows-x86_64'
  uses: ilammy/msvc-dev-cmd@v1
```
Importa INCLUDE, LIB, e adiciona MSVC bin no PATH. Necessário pra cargo achar headers C++.

#### Shell em Tauri build
Não use `shell: bash` em steps que chamam cargo no Windows — Git Bash + cargo = conflito de `link`. Use `shell: powershell` (5.1, não `pwsh` que não vem instalado).

#### Matrix context em campos parsed em load-time
`shell: ${{ matrix.X && 'A' || 'B' }}` **não funciona** — GitHub parsea `shell:` antes da matrix expansion. Solução: 2 steps separados com `if:`.

#### Env vars do step não chegam no bash Windows
Step env não é herdado pelo Git Bash em runner não-SYSTEM. Workaround: setar inline no `run:` script.
```yaml
run: |
  set -euo pipefail
  PLATFORM="${{ matrix.platform_key }}"
  # ...
```

## Branch protection

- `CI passed` é o único required status check
- PR não é mais obrigatório (release-bump.yml pode pushar `chore(release): vX.Y.Z` direto)
- enforce_admins: false (admin pode bypass se precisar)

## Troubleshooting checklist

Pra cada erro novo no CI Windows, considere:

1. **PATH issues**: o binário sendo invocado é o esperado? Use `Get-Command X | Select-Object Source`.
2. **Runner context (SYSTEM vs user)**: se erro envolver AppData, registry ou exes baixados → provável SYSTEM problem. Solução: rodar como user.
3. **Env vars não chegando**: usar inline expansion no script, não `env:` field.
4. **DLLs faltando**: erro `STATUS_DLL_NOT_FOUND` (-1073741515) → VC Redist ou outras deps. Instalar via winget.
5. **Tools no PATH errado**: copiar pro `~/.cargo/bin/` (sempre no PATH) ou `C:\Windows\System32\config\systemprofile\.cargo\bin\` se rodando como SYSTEM.
