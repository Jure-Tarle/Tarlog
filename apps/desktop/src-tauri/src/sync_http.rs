//! Narrow runtime capability for the native self-hosted sync transport.
//!
//! The official Tauri HTTP plugin requires URL scopes. Tarlog cannot know a
//! self-hosted origin at build time, so the UI first submits the explicit base
//! URL chosen by the user. This command validates it and adds a runtime
//! capability limited to that base URL's `/api/*` namespace. Capabilities are
//! monotonic for the process lifetime; disconnecting forgets the credential,
//! while a previously approved origin disappears on app restart.

use std::{
    collections::{hash_map::DefaultHasher, HashSet},
    hash::{Hash, Hasher},
    net::IpAddr,
    str::FromStr,
    sync::Mutex,
};

use tauri::{Manager, State};

#[derive(Default)]
pub struct SyncHttpScopes(Mutex<HashSet<String>>);

#[derive(Debug, PartialEq, Eq)]
struct ValidatedSyncUrl {
    base_url: String,
    api_scope: String,
}

fn is_loopback_host(host: &str) -> bool {
    let host = host
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host);
    host.eq_ignore_ascii_case("localhost")
        || host.to_ascii_lowercase().ends_with(".localhost")
        || IpAddr::from_str(host).is_ok_and(|address| address.is_loopback())
}

fn validate_base_url(input: &str) -> Result<ValidatedSyncUrl, String> {
    let mut url = tauri::Url::parse(input.trim())
        .map_err(|_| "Server-Adresse muss eine vollständige http(s)-URL sein.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Server-Adresse muss http:// oder https:// verwenden.".into());
    }
    if url.host_str().is_none() {
        return Err("Server-Adresse benötigt einen Hostnamen.".into());
    }
    if url.scheme() == "http" && !url.host_str().is_some_and(is_loopback_host) {
        return Err("Außerhalb dieses Geräts ist für Sync eine HTTPS-Adresse erforderlich.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Server-Adresse darf keine Zugangsdaten enthalten.".into());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("Server-Adresse darf keine Query oder Raute enthalten.".into());
    }
    if url
        .path()
        .chars()
        .any(|character| matches!(character, '*' | ':' | '{' | '}' | '(' | ')' | '\\'))
    {
        return Err("Server-Pfad enthält nicht unterstützte Sonderzeichen.".into());
    }

    // Match the TypeScript normalization and keep an optional reverse-proxy
    // prefix, e.g. https://host.example/tarlog -> .../tarlog/api/*.
    let trimmed_path = url.path().trim_end_matches('/').to_string();
    url.set_path(if trimmed_path.is_empty() {
        "/"
    } else {
        &trimmed_path
    });
    let base_url = url.as_str().trim_end_matches('/').to_string();
    Ok(ValidatedSyncUrl {
        api_scope: format!("{base_url}/api/*"),
        base_url,
    })
}

fn capability_identifier(base_url: &str) -> String {
    let mut hasher = DefaultHasher::new();
    base_url.hash(&mut hasher);
    format!("sync-http-{:016x}", hasher.finish())
}

/// Approve exactly one user-entered Tarlog base URL for native HTTP `/api/*` calls.
#[tauri::command]
pub fn allow_sync_server_http(
    app: tauri::AppHandle,
    state: State<'_, SyncHttpScopes>,
    base_url: String,
) -> Result<String, String> {
    let validated = validate_base_url(&base_url)?;
    let mut scopes = state
        .0
        .lock()
        .map_err(|_| "HTTP-Scope konnte nicht gesperrt werden.".to_string())?;
    if scopes.contains(&validated.base_url) {
        return Ok(validated.base_url);
    }

    let capability = serde_json::json!({
        "identifier": capability_identifier(&validated.base_url),
        "description": "Runtime scope for one explicitly configured Tarlog sync server.",
        "windows": ["main"],
        "permissions": [{
            "identifier": "http:default",
            "allow": [{ "url": validated.api_scope }]
        }]
    })
    .to_string();

    app.add_capability(capability)
        .map_err(|error| format!("HTTP-Scope konnte nicht aktiviert werden: {error}"))?;
    scopes.insert(validated.base_url.clone());
    Ok(validated.base_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scopes_exact_https_base_and_api_namespace() {
        let value = validate_base_url(" https://tarlog.example.com/ ").unwrap();
        assert_eq!(value.base_url, "https://tarlog.example.com");
        assert_eq!(value.api_scope, "https://tarlog.example.com/api/*");
    }

    #[test]
    fn preserves_local_port_and_reverse_proxy_prefix() {
        let value = validate_base_url("http://127.0.0.1:3001/tarlog/").unwrap();
        assert_eq!(value.base_url, "http://127.0.0.1:3001/tarlog");
        assert_eq!(value.api_scope, "http://127.0.0.1:3001/tarlog/api/*");
        assert!(validate_base_url("http://localhost:3001").is_ok());
        assert!(validate_base_url("http://[::1]:3001").is_ok());
        assert!(validate_base_url("http://tarlog.example.com").is_err());
    }

    #[test]
    fn rejects_non_http_credentials_and_url_suffixes() {
        assert!(validate_base_url("file:///tmp/tarlog").is_err());
        assert!(validate_base_url("https://user:secret@example.com").is_err());
        assert!(validate_base_url("https://example.com?target=other").is_err());
        assert!(validate_base_url("https://example.com/#fragment").is_err());
        assert!(validate_base_url("https://example.com/:tenant").is_err());
        assert!(validate_base_url("https://example.com/*/tarlog").is_err());
    }
}
