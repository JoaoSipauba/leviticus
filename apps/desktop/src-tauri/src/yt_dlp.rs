// Setup do yt-dlp em runtime.
//
// Por que não bundlar? O yt-dlp_macos é um PyInstaller bundle (Python
// embutido). Ao colocar como sidecar/resource no .app, o Tauri roda
// `codesign --deep -s -` (ad-hoc) e re-assina TODOS os binários,
// inclusive o Python.framework dentro do yt-dlp. PyInstaller checa
// Team ID match no boot e recusa carregar — quebrando busca/download/
// preview de YouTube. Veja:
//   https://github.com/tauri-apps/tauri/issues (re-sign deep + PyInstaller)
//
// Solução: baixar pra $APPLOCALDATA/bin/yt-dlp(.exe) no primeiro uso.
// O binário fica FORA do .app, mantém a assinatura original do yt-dlp,
// Python carrega normalmente. Capability shell aponta pra esse path
// usando o placeholder $APPLOCALDATA.

use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// Pin de versão alinhado com scripts/fetch-binaries.mjs (legado, será
// removido). Atualizar manualmente quando subir.
const YT_DLP_VERSION: &str = "2026.03.17";

// Hashes oficiais publicados pelo yt-dlp em SHA2-256SUMS por release.
// Defesa supply-chain: mismatch = release alterada ou MITM.
fn asset_sha256(asset: &str) -> Option<&'static str> {
    match asset {
        "yt-dlp_macos" =>
            Some("e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5"),
        "yt-dlp.exe" =>
            Some("3db811b366b2da47337d2fcfdfe5bbd9a258dad3f350c54974f005df115a1545"),
        "yt-dlp_linux" =>
            Some("c2b0189f581fe4a2ddd41954f1bcb7d327db04b07ed0dea97e4f1b3e09b5dd8e"),
        _ => None,
    }
}

fn asset_for_platform() -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        Some("yt-dlp_macos")
    } else if cfg!(target_os = "windows") {
        Some("yt-dlp.exe")
    } else if cfg!(target_os = "linux") {
        Some("yt-dlp_linux")
    } else {
        None
    }
}

fn bin_name() -> &'static str {
    if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" }
}

fn bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("falha ao resolver appLocalDataDir: {e}"))?;
    Ok(data_dir.join("bin").join(bin_name()))
}

#[tauri::command]
pub async fn ensure_yt_dlp(app: AppHandle) -> Result<String, String> {
    let dest = bin_path(&app)?;

    // Caminho feliz: já baixado num boot anterior. Validação mínima
    // (file_exists + size > 0) — não basta exists() porque um download
    // interrompido pode ter deixado arquivo vazio/corrompido. Hash full
    // check é dispensável aqui pq o rename atômico abaixo só publica
    // em dest após o hash ter sido verificado (ver fluxo de escrita).
    if let Ok(meta) = tokio::fs::metadata(&dest).await {
        if meta.is_file() && meta.len() > 0 {
            return Ok(dest.to_string_lossy().into_owned());
        }
    }

    let asset = asset_for_platform().ok_or_else(|| {
        format!(
            "yt-dlp ainda não suportado nessa plataforma: os={} arch={}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;
    let url = format!(
        "https://github.com/yt-dlp/yt-dlp/releases/download/{YT_DLP_VERSION}/{asset}"
    );

    // Garante o diretório bin/
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("falha ao criar diretório {}: {e}", parent.display()))?;
    }

    let res = reqwest::get(&url)
        .await
        .map_err(|e| format!("falha de rede ao baixar yt-dlp: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("download retornou HTTP {} — release {} pode não existir", res.status(), YT_DLP_VERSION));
    }

    // yt-dlp_macos ~35MB, yt-dlp.exe ~17MB. Em memória é OK pro perfil.
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("falha lendo bytes do yt-dlp: {e}"))?;

    // Verifica hash ANTES de gravar — mismatch indica release adulterada.
    if let Some(expected) = asset_sha256(asset) {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let got = hex::encode(hasher.finalize());
        if got != expected {
            return Err(format!(
                "hash do yt-dlp não bate (esperado {expected}, obtido {got}) — release pode ter sido alterada"
            ));
        }
    }

    // Atomic write: tmp file primeiro, rename pra dest só no fim. Se o
    // processo morre no meio, sobra .partial órfão e dest nunca vê
    // estado parcial — próxima execução baixa de novo limpo.
    let tmp = dest.with_extension("partial");
    tokio::fs::write(&tmp, &bytes)
        .await
        .map_err(|e| format!("falha ao escrever {}: {e}", tmp.display()))?;

    // Em Unix precisa de +x. Em Windows o .exe já é executável pelo nome.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // 0o700: só o user dono lê/escreve/executa. O yt-dlp vive em
        // $APPLOCALDATA do próprio usuário — não há razão pra outros
        // usuários no sistema acessarem (ataque de elevação local).
        let mut perms = tokio::fs::metadata(&tmp)
            .await
            .map_err(|e| format!("falha lendo metadata: {e}"))?
            .permissions();
        perms.set_mode(0o700);
        tokio::fs::set_permissions(&tmp, perms)
            .await
            .map_err(|e| format!("falha em chmod 700: {e}"))?;
    }

    tokio::fs::rename(&tmp, &dest)
        .await
        .map_err(|e| format!("falha ao mover {} → {}: {e}", tmp.display(), dest.display()))?;

    Ok(dest.to_string_lossy().into_owned())
}
