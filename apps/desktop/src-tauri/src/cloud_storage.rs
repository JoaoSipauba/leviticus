use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use tokio::io::AsyncWriteExt;

/// Evento emitido pelo `cloud_storage_download_to_file` via Tauri Channel.
/// Cliente JS recebe via `new Channel<DownloadProgressEvent>()` e assina
/// `channel.onmessage`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub downloaded: u64,
    pub total: u64,
}

#[tauri::command]
pub async fn cloud_storage_hash_file(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let mut file = fs::File::open(&path).map_err(|e| format!("open: {e}"))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let n = file.read(&mut buffer).map_err(|e| format!("read: {e}"))?;
            if n == 0 { break }
            hasher.update(&buffer[..n]);
        }
        let result = hasher.finalize();
        Ok(hex::encode(result))
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn cloud_storage_rename_file(from: String, to: String) -> Result<(), String> {
    let from_path = PathBuf::from(&from);
    let to_path = PathBuf::from(&to);
    tokio::fs::rename(&from_path, &to_path)
        .await
        .map_err(|e| format!("rename {from} -> {to}: {e}"))
}

/// Retorna o tamanho em bytes de um arquivo no filesystem. Usado como
/// preflight do upload (sem precisar ler o arquivo todo no JS via Tauri fs).
#[tauri::command]
pub async fn cloud_storage_file_size(path: String) -> Result<u64, String> {
    let p = Path::new(&path);
    let meta = tokio::fs::metadata(p).await.map_err(|e| format!("stat {path}: {e}"))?;
    Ok(meta.len())
}

/// Baixa uma URL pra um arquivo local via reqwest streaming. Existe porque
/// o Tauri v2 plugin-http NÃO suporta `res.body.getReader()` direito — o
/// reader retorna `done: true` na primeira leitura entregando lixo (1024
/// bytes de NULL). Aqui no Rust o streaming funciona como esperado.
///
/// Retorna o tamanho final em bytes.
#[tauri::command]
pub async fn cloud_storage_download_to_file(
    url: String,
    dest_path: String,
    headers: Option<HashMap<String, String>>,
    // Channel não pode ser Option<...> em command args — Tauri faz CommandArg
    // só pra `Channel<T>` direto. Cliente sempre passa um Channel; quando
    // não quer progress, simplesmente não assina `.onmessage`.
    on_progress: Channel<DownloadProgressEvent>,
) -> Result<u64, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("client: {e}"))?;

    let mut req = client.get(&url);
    if let Some(h) = headers {
        for (k, v) in h.iter() {
            req = req.header(k, v);
        }
    }

    let res = req.send().await.map_err(|e| format!("request: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }

    // Total esperado pra calcular % no cliente. Pode vir None pra responses
    // sem content-length (raro em Drive, mas defensivo).
    let total_expected = res.content_length().unwrap_or(0);

    let dest = PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }

    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("create {dest_path}: {e}"))?;

    let mut stream = res.bytes_stream();
    let mut total: u64 = 0;
    // Throttle: emite no máximo a cada 100ms pra não inundar o IPC bridge.
    // Arquivos grandes (50MB+) podem gerar milhares de chunks pequenos.
    let mut last_emit = std::time::Instant::now();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("stream: {e}"))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("write: {e}"))?;
        total += bytes.len() as u64;
        if last_emit.elapsed().as_millis() >= 100 {
            let _ = on_progress.send(DownloadProgressEvent {
                downloaded: total,
                total: total_expected,
            });
            last_emit = std::time::Instant::now();
        }
    }
    file.flush().await.map_err(|e| format!("flush: {e}"))?;
    // Final event garantindo 100% mesmo se o último throttle pulou.
    let _ = on_progress.send(DownloadProgressEvent {
        downloaded: total,
        total: total_expected.max(total),
    });
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[tokio::test]
    async fn test_hash_known_content() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let path = tmp.path().to_string_lossy().to_string();
        tmp.as_file().write_all(b"hello").unwrap();
        let hash = cloud_storage_hash_file(path).await.unwrap();
        // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        assert_eq!(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    }
}
