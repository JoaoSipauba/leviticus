// Setup do ffmpeg em runtime (mesma estratégia do yt-dlp).
//
// Por que não bundlar? Pra macOS, mesma razão do yt-dlp: o ffmpeg
// estático contém libs internas com assinatura própria, que o
// codesign --deep do Tauri invalidaria. Pra Windows, simplesmente
// não temos ffmpeg pré-instalado no PATH dos usuários — antes a
// função exportSongToMp3 dependia de `/opt/homebrew/bin/ffmpeg`
// hardcoded.
//
// Fonte: github.com/eugeneware/ffmpeg-static, tag b6.0. Single-file
// binário, distribuído como .gz. ffmpeg 6.0 é suficiente pra
// conversão m4a/opus → mp3 (codecs estáveis há décadas).

use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const FFMPEG_STATIC_TAG: &str = "b6.0";

// Hashes esperados dos assets — defesa supply-chain. Mismatch indica:
// (a) release foi alterada após pin, ou (b) MITM. Em qualquer caso,
// recusamos executar. Hashes obtidos via:
//   curl -sSL <url> | sha256sum
fn asset_sha256(asset: &str) -> Option<&'static str> {
    match asset {
        "ffmpeg-darwin-arm64.gz" =>
            Some("6be74d6f449889c2e87a75873894f8520cad56c08ac76f2a628d85b0519daaca"),
        "ffmpeg-win32-x64.gz" =>
            Some("450d66226c79405c724e821f291cab0911e934bfa9fa2231adcab587f3e07b50"),
        // Outros assets ainda não pinados — adicionar sob demanda.
        _ => None,
    }
}

fn asset_for_platform() -> Option<&'static str> {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        Some("ffmpeg-darwin-arm64.gz")
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        Some("ffmpeg-darwin-x64.gz")
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        Some("ffmpeg-win32-x64.gz")
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some("ffmpeg-linux-x64.gz")
    } else {
        None
    }
}

fn bin_name() -> &'static str {
    if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" }
}

fn bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("falha ao resolver appLocalDataDir: {e}"))?;
    Ok(data_dir.join("bin").join(bin_name()))
}

#[tauri::command]
pub async fn ensure_ffmpeg(app: AppHandle) -> Result<String, String> {
    let dest = bin_path(&app)?;

    if dest.exists() {
        return Ok(dest.to_string_lossy().into_owned());
    }

    let asset = asset_for_platform()
        .ok_or_else(|| "plataforma não suportada para ffmpeg".to_string())?;
    let url = format!(
        "https://github.com/eugeneware/ffmpeg-static/releases/download/{FFMPEG_STATIC_TAG}/{asset}"
    );

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("falha ao criar diretório {}: {e}", parent.display()))?;
    }

    let res = reqwest::get(&url)
        .await
        .map_err(|e| format!("falha de rede ao baixar ffmpeg: {e}"))?;
    if !res.status().is_success() {
        return Err(format!(
            "download retornou HTTP {} — asset {} pode não existir na tag {}",
            res.status(),
            asset,
            FFMPEG_STATIC_TAG
        ));
    }

    // Baixa gz completo (18-27MB) em memória. ffmpeg descompactado dá
    // 43-77MB. Pico aceitável pra um download que roda 1x na vida do app.
    let gz_bytes = res
        .bytes()
        .await
        .map_err(|e| format!("falha lendo bytes do ffmpeg: {e}"))?;

    // Verifica hash ANTES de descomprimir e gravar. Pinado em
    // asset_sha256() — mismatch indica release adulterada ou MITM.
    if let Some(expected) = asset_sha256(asset) {
        let mut hasher = Sha256::new();
        hasher.update(&gz_bytes);
        let got = hex::encode(hasher.finalize());
        if got != expected {
            return Err(format!(
                "hash do ffmpeg não bate (esperado {expected}, obtido {got}) — release pode ter sido alterada"
            ));
        }
    }

    // Descompressão é CPU-bound + bloqueante. spawn_blocking devolve o
    // thread async pro runtime durante o ~1s de gunzip. Decomprime em
    // memória (não-streaming) pra simplicidade; pico ~80MB pontual.
    let decompressed = tokio::task::spawn_blocking(move || {
        let mut decoder = flate2::read::GzDecoder::new(std::io::Cursor::new(gz_bytes));
        let mut out = Vec::with_capacity(80 * 1024 * 1024);
        decoder.read_to_end(&mut out).map(|_| out)
    })
    .await
    .map_err(|e| format!("task de descompressão falhou: {e}"))?
    .map_err(|e| format!("falha descomprimindo gz do ffmpeg: {e}"))?;

    tokio::fs::write(&dest, &decompressed)
        .await
        .map_err(|e| format!("falha ao escrever {}: {e}", dest.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&dest)
            .await
            .map_err(|e| format!("falha lendo metadata: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(&dest, perms)
            .await
            .map_err(|e| format!("falha em chmod +x: {e}"))?;
    }

    Ok(dest.to_string_lossy().into_owned())
}
