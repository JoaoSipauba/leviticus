use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

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
