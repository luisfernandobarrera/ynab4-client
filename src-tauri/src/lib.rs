use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use walkdir::WalkDir;
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::Rng;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

// Store PKCE verifier between auth steps
#[allow(dead_code)]
static CODE_VERIFIER: Mutex<Option<String>> = Mutex::new(None);

// Port for OAuth callback server
const OAUTH_CALLBACK_PORT: u16 = 8742;

#[derive(Debug, Serialize, Deserialize)]
pub struct BudgetInfo {
    pub name: String,
    pub path: String,
}

/// Find YNAB4 budgets in common locations
#[tauri::command]
fn find_ynab_budgets() -> Vec<BudgetInfo> {
    find_ynab_budgets_in_paths(vec![])
}

/// Find YNAB4 budgets in specified paths
#[tauri::command]
fn find_ynab_budgets_in_paths(custom_paths: Vec<String>) -> Vec<BudgetInfo> {
    let mut budgets = Vec::new();
    let mut search_paths: Vec<std::path::PathBuf> = Vec::new();
    
    // Use custom paths if provided
    if !custom_paths.is_empty() {
        for path_str in custom_paths {
            search_paths.push(std::path::PathBuf::from(path_str));
        }
    } else {
        // Default: search common YNAB locations
        if let Some(home) = dirs::home_dir() {
            search_paths.push(home.join("Dropbox").join("YNAB"));
            search_paths.push(home.join("Dropbox").join("Apps").join("YNAB"));
            search_paths.push(home.join("Documents").join("YNAB"));
        }
    }
    
    for search_path in search_paths {
        if search_path.exists() {
            // Look for .ynab4 directories
            for entry in WalkDir::new(&search_path)
                .max_depth(2)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(ext) = path.extension() {
                        if ext == "ynab4" {
                            if let Some(name) = path.file_stem() {
                                let name_str = name.to_string_lossy().to_string();
                                // Clean name (remove ~GUID suffix)
                                let clean_name = if let Some(idx) = name_str.find('~') {
                                    name_str[..idx].to_string()
                                } else {
                                    name_str
                                };
                                
                                // Avoid duplicates
                                let path_string = path.to_string_lossy().to_string();
                                if !budgets.iter().any(|b: &BudgetInfo| b.path == path_string) {
                                    budgets.push(BudgetInfo {
                                        name: clean_name,
                                        path: path_string,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    budgets
}

/// Get the Dropbox path if it exists
#[tauri::command]
fn get_dropbox_path() -> Option<String> {
    if let Some(home) = dirs::home_dir() {
        let dropbox_path = home.join("Dropbox");
        if dropbox_path.exists() {
            return Some(dropbox_path.to_string_lossy().to_string());
        }
    }
    None
}

// ============================================================================
// Dropbox OAuth Commands
// ============================================================================

/// Generate PKCE code verifier
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

/// Generate code challenge from verifier (SHA-256, base64url)
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    URL_SAFE_NO_PAD.encode(result)
}

#[derive(Debug, Serialize)]
pub struct DropboxAuthUrl {
    pub url: String,
    pub state: String,
}

/// Start Dropbox OAuth - returns URL to open in browser
#[tauri::command]
fn dropbox_start_auth(client_id: String, redirect_uri: String) -> DropboxAuthUrl {
    let verifier = generate_code_verifier();
    let challenge = generate_code_challenge(&verifier);
    let state = format!("{:x}", rand::random::<u64>());
    
    // Store verifier for later
    if let Ok(mut stored) = CODE_VERIFIER.lock() {
        *stored = Some(verifier);
    }
    
    let url = format!(
        "https://www.dropbox.com/oauth2/authorize?\
        client_id={}&\
        redirect_uri={}&\
        response_type=code&\
        code_challenge={}&\
        code_challenge_method=S256&\
        token_access_type=offline&\
        state={}",
        client_id, redirect_uri, challenge, state
    );
    
    DropboxAuthUrl { url, state }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DropboxTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    pub uid: Option<String>,
    pub account_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DropboxErrorResponse {
    pub error: String,
    pub error_description: Option<String>,
}

/// Exchange authorization code for tokens
#[tauri::command]
async fn dropbox_exchange_code(
    client_id: String,
    code: String,
    redirect_uri: String,
) -> Result<DropboxTokenResponse, String> {
    // Get stored verifier
    let verifier = {
        let stored = CODE_VERIFIER.lock().map_err(|e| e.to_string())?;
        stored.clone().ok_or("No code verifier found - start auth first")?
    };
    
    // Build request
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.dropboxapi.com/oauth2/token")
        .form(&[
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;
    
    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Read error: {}", e))?;
    
    if status.is_success() {
        let token: DropboxTokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Parse error: {} - body: {}", e, body))?;
        
        // Clear verifier
        if let Ok(mut stored) = CODE_VERIFIER.lock() {
            *stored = None;
        }
        
        Ok(token)
    } else {
        let error: DropboxErrorResponse = serde_json::from_str(&body)
            .unwrap_or(DropboxErrorResponse {
                error: "unknown".to_string(),
                error_description: Some(body),
            });
        Err(format!("{}: {:?}", error.error, error.error_description))
    }
}

/// Refresh access token
#[tauri::command]
async fn dropbox_refresh_token(
    client_id: String,
    refresh_token: String,
) -> Result<DropboxTokenResponse, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.dropboxapi.com/oauth2/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
            ("client_id", client_id.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;
    
    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Read error: {}", e))?;
    
    if status.is_success() {
        let token: DropboxTokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Parse error: {}", e))?;
        Ok(token)
    } else {
        Err(format!("Token refresh failed: {}", body))
    }
}

// Android deep link redirect URI
const ANDROID_REDIRECT_URI: &str = "ynab4viewer://oauth/callback";

/// Open URL in browser (works on all platforms including Android)
#[tauri::command]
async fn open_url_in_browser(url: String) -> Result<(), String> {
    log::info!("Opening URL in browser: {}", url);
    
    #[cfg(target_os = "android")]
    {
        // On Android, use the opener crate which handles intents properly
        opener::open_browser(&url).map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    Ok(())
}

/// Get the OAuth authorization URL for Android (deep link flow)
/// Returns the URL and stores the PKCE verifier for later
#[tauri::command]
fn dropbox_get_auth_url(client_id: String) -> Result<DropboxAuthUrl, String> {
    let verifier = generate_code_verifier();
    let challenge = generate_code_challenge(&verifier);
    let state = format!("{:x}", rand::random::<u64>());
    
    // Store verifier for later token exchange
    if let Ok(mut stored) = CODE_VERIFIER.lock() {
        *stored = Some(verifier);
    }
    
    let url = format!(
        "https://www.dropbox.com/oauth2/authorize?\
        client_id={}&\
        redirect_uri={}&\
        response_type=code&\
        code_challenge={}&\
        code_challenge_method=S256&\
        token_access_type=offline&\
        state={}",
        client_id,
        urlencoding::encode(ANDROID_REDIRECT_URI),
        challenge,
        state
    );
    
    Ok(DropboxAuthUrl { url, state })
}

/// Exchange code for tokens using stored PKCE verifier (for Android deep link flow)
#[tauri::command]
async fn dropbox_exchange_code_android(
    client_id: String,
    code: String,
) -> Result<DropboxTokenResponse, String> {
    // Get stored verifier
    let verifier = {
        let stored = CODE_VERIFIER.lock().map_err(|e| e.to_string())?;
        stored.clone().ok_or("No code verifier found - start auth first")?
    };
    
    log::info!("Exchanging code for tokens (Android flow)...");
    
    // Build request
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.dropboxapi.com/oauth2/token")
        .form(&[
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("client_id", client_id.as_str()),
            ("redirect_uri", ANDROID_REDIRECT_URI),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;
    
    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Read error: {}", e))?;
    
    if status.is_success() {
        let token: DropboxTokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Parse error: {} - body: {}", e, body))?;
        
        // Clear verifier
        if let Ok(mut stored) = CODE_VERIFIER.lock() {
            *stored = None;
        }
        
        log::info!("Token exchange successful!");
        Ok(token)
    } else {
        let error: DropboxErrorResponse = serde_json::from_str(&body)
            .unwrap_or(DropboxErrorResponse {
                error: "unknown".to_string(),
                error_description: Some(body),
            });
        Err(format!("{}: {:?}", error.error, error.error_description))
    }
}

/// Complete OAuth flow with local callback server (Desktop only)
/// This opens the browser, waits for callback, exchanges code for tokens
#[tauri::command]
#[cfg(not(target_os = "android"))]
async fn dropbox_oauth_flow(
    client_id: String,
) -> Result<DropboxTokenResponse, String> {
    let redirect_uri = format!("http://localhost:{}/callback", OAUTH_CALLBACK_PORT);
    
    // Generate PKCE
    let verifier = generate_code_verifier();
    let challenge = generate_code_challenge(&verifier);
    let state = format!("{:x}", rand::random::<u64>());
    
    // Build authorization URL
    let _auth_url = format!(
        "https://www.dropbox.com/oauth2/authorize?\
        client_id={}&\
        redirect_uri={}&\
        response_type=code&\
        code_challenge={}&\
        code_challenge_method=S256&\
        token_access_type=offline&\
        state={}",
        client_id,
        urlencoding::encode(&redirect_uri),
        challenge,
        state
    );
    
    // Start local server to receive callback
    let listener = TcpListener::bind(format!("127.0.0.1:{}", OAUTH_CALLBACK_PORT))
        .await
        .map_err(|e| format!("Failed to start callback server: {}", e))?;
    
    log::info!("OAuth callback server listening on port {}", OAUTH_CALLBACK_PORT);
    
    // Open browser using system command
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&_auth_url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &_auth_url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&_auth_url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    // Wait for callback (with timeout)
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(300), // 5 minute timeout
        wait_for_oauth_callback(&listener, &state)
    )
    .await
    .map_err(|_| "OAuth timeout - no response received within 5 minutes")?
    .map_err(|e| format!("OAuth callback error: {}", e))?;
    
    log::info!("Received OAuth code, exchanging for tokens...");
    
    // Exchange code for tokens
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.dropboxapi.com/oauth2/token")
        .form(&[
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange HTTP error: {}", e))?;
    
    let status = response.status();
    let body = response.text().await.map_err(|e| format!("Read error: {}", e))?;
    
    if status.is_success() {
        let token: DropboxTokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Parse error: {} - body: {}", e, body))?;
        Ok(token)
    } else {
        let error: DropboxErrorResponse = serde_json::from_str(&body)
            .unwrap_or(DropboxErrorResponse {
                error: "unknown".to_string(),
                error_description: Some(body),
            });
        Err(format!("{}: {:?}", error.error, error.error_description))
    }
}

/// Android version - just returns error telling to use the deep link flow
#[tauri::command]
#[cfg(target_os = "android")]
async fn dropbox_oauth_flow(
    _client_id: String,
) -> Result<DropboxTokenResponse, String> {
    Err("Use dropbox_get_auth_url and dropbox_exchange_code_android for Android".to_string())
}

/// Wait for OAuth callback and extract the code
async fn wait_for_oauth_callback(listener: &TcpListener, expected_state: &str) -> Result<String, String> {
    loop {
        let (mut socket, _) = listener.accept()
            .await
            .map_err(|e| format!("Accept error: {}", e))?;
        
        let mut buffer = [0u8; 4096];
        let n = socket.read(&mut buffer)
            .await
            .map_err(|e| format!("Read error: {}", e))?;
        
        let request = String::from_utf8_lossy(&buffer[..n]);
        
        // Parse GET request
        if let Some(line) = request.lines().next() {
            if line.starts_with("GET /callback") {
                // Extract query parameters
                if let Some(query_start) = line.find('?') {
                    let query_end = line.find(" HTTP").unwrap_or(line.len());
                    let query = &line[query_start + 1..query_end];
                    
                    let mut code = None;
                    let mut state = None;
                    let mut error = None;
                    
                    for param in query.split('&') {
                        if let Some((key, value)) = param.split_once('=') {
                            match key {
                                "code" => code = Some(value.to_string()),
                                "state" => state = Some(value.to_string()),
                                "error" => error = Some(value.to_string()),
                                _ => {}
                            }
                        }
                    }
                    
                    // Check for error
                    if let Some(err) = error {
                        let html = format!(r#"<!DOCTYPE html>
<html><head><title>Error</title><style>
body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; 
justify-content: center; align-items: center; height: 100vh; margin: 0; 
background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; }}
.container {{ text-align: center; padding: 2rem; }}
h1 {{ color: #ff6b6b; }}
</style></head><body>
<div class="container">
<h1>❌ Error de Autorización</h1>
<p>{}</p>
<p>Puedes cerrar esta ventana.</p>
</div></body></html>"#, err);
                        
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(), html
                        );
                        let _ = socket.write_all(response.as_bytes()).await;
                        return Err(format!("OAuth error: {}", err));
                    }
                    
                    // Verify state
                    if let Some(s) = &state {
                        if s != expected_state {
                            continue; // Invalid state, wait for another request
                        }
                    }
                    
                    // Return code
                    if let Some(c) = code {
                        let html = r#"<!DOCTYPE html>
<html><head><title>¡Conectado!</title><style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; 
justify-content: center; align-items: center; height: 100vh; margin: 0; 
background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; }
.container { text-align: center; padding: 2rem; }
h1 { color: #4ade80; }
.check { font-size: 4rem; margin-bottom: 1rem; }
</style></head><body>
<div class="container">
<div class="check">✓</div>
<h1>¡Conectado a Dropbox!</h1>
<p>Puedes cerrar esta ventana y volver a la aplicación.</p>
</div></body></html>"#;
                        
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(), html
                        );
                        let _ = socket.write_all(response.as_bytes()).await;
                        
                        return Ok(c);
                    }
                }
            }
        }
        
        // For any other request, return 404
        let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = socket.write_all(response.as_bytes()).await;
    }
}

// Store the last deep link URL
static LAST_DEEP_LINK: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Get the last received deep link URL (for debugging)
#[tauri::command]
fn get_last_deep_link() -> Option<String> {
    LAST_DEEP_LINK.lock().ok().and_then(|guard| guard.clone())
}

/// Clear the stored deep link
#[tauri::command]
fn clear_deep_link() {
    if let Ok(mut guard) = LAST_DEEP_LINK.lock() {
        *guard = None;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // Set up deep link handler
      #[cfg(any(target_os = "android", target_os = "ios"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        let handle = app.handle().clone();
        app.deep_link().on_open_url(move |event| {
            let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
            log::info!("Deep link received: {:?}", urls);
            
            // Store the URL
            if let Some(url) = urls.first() {
                if let Ok(mut guard) = LAST_DEEP_LINK.lock() {
                    *guard = Some(url.clone());
                }
                // Emit event to frontend
                let _ = handle.emit("deep-link-url", url.clone());
            }
        });
      }
      
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
        .invoke_handler(tauri::generate_handler![
            find_ynab_budgets,
            find_ynab_budgets_in_paths,
            get_dropbox_path,
            dropbox_start_auth,
            dropbox_exchange_code,
            dropbox_refresh_token,
            dropbox_oauth_flow,
            dropbox_get_auth_url,
            dropbox_exchange_code_android,
            open_url_in_browser,
            get_last_deep_link,
            clear_deep_link
        ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
