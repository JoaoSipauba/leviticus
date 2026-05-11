#!/usr/bin/env node
// Baixa o binário do yt-dlp pra o triple do host atual e coloca em
// src-tauri/binaries/yt-dlp-<triple>(.exe). Tauri sidecar resolve o
// nome dinamicamente em tauri dev/build.
//
// Uso:
//   pnpm fetch:binaries          (host triple)
//   pnpm fetch:binaries <triple> (override pra CI fazer cross-bundle)
//
// Versões disponíveis: https://github.com/yt-dlp/yt-dlp/releases

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const YT_DLP_VERSION = '2026.03.17' // pin pra evitar surpresas — atualizar manualmente

const __dirname = dirname(fileURLToPath(import.meta.url))
const BINARIES_DIR = join(__dirname, '..', 'src-tauri', 'binaries')

function detectHostTriple() {
  // node não expõe rust triple — derivar de process.platform + process.arch
  const { platform, arch } = process
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin'
  if (platform === 'darwin' && arch === 'x64')   return 'x86_64-apple-darwin'
  if (platform === 'win32' && arch === 'x64')    return 'x86_64-pc-windows-msvc'
  if (platform === 'linux' && arch === 'x64')    return 'x86_64-unknown-linux-gnu'
  throw new Error(`triple desconhecido pra ${platform}/${arch}`)
}

function ytDlpAsset(triple) {
  if (triple.includes('darwin'))  return 'yt-dlp_macos'
  if (triple.includes('windows')) return 'yt-dlp.exe'
  if (triple.includes('linux'))   return 'yt-dlp_linux'
  throw new Error(`asset desconhecido pra triple ${triple}`)
}

async function main() {
  const triple = process.argv[2] || detectHostTriple()
  const isWindows = triple.includes('windows')
  const asset = ytDlpAsset(triple)
  const ext = isWindows ? '.exe' : ''
  const destPath = join(BINARIES_DIR, `yt-dlp-${triple}${ext}`)

  if (existsSync(destPath)) {
    console.log(`ja existe: ${destPath}`)
    return
  }

  mkdirSync(BINARIES_DIR, { recursive: true })

  const url = `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${asset}`
  console.log(`Baixando ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(destPath, buf)
  if (!isWindows) chmodSync(destPath, 0o755)
  console.log(`salvo em ${destPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)

  // Verificacao rapida pra macOS — so de garantir que rode
  if (!isWindows && triple === detectHostTriple()) {
    try {
      const out = execFileSync(destPath, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim()
      console.log(`  versao: ${out}`)
    } catch {
      console.warn('  (nao conseguiu rodar --version — pode ser sandbox ou binario corrompido)')
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
