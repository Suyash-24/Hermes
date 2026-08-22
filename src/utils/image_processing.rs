use crate::error::{BotError, BotResult};
use base64::{engine::general_purpose, Engine as _};
use bytes::Bytes;
use image::{imageops::FilterType, DynamicImage, ImageFormat};
use reqwest::Client;
use std::io::Cursor;
use tracing::info;

const MAX_SIZE_BYTES: usize = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION: u32 = 1024; // Resize to max 1024x1024 to save space

/// Download an image, compress/resize it if it's over 10MB, and return it as a Base64 Data URI
pub async fn download_and_process_image(url: &str) -> BotResult<String> {
    let client = Client::new();
    let resp = client.get(url).send().await.map_err(|e| BotError::Custom(format!("Failed to download image: {}", e)))?;
    
    let content_type = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| BotError::Custom(format!("Failed to read image bytes: {}", e)))?;
    
    // If the image is already under 10MB, we can just return it directly as base64!
    if bytes.len() <= MAX_SIZE_BYTES {
        info!("Image is {} bytes (under 10MB), using directly.", bytes.len());
        let b64 = general_purpose::STANDARD.encode(&bytes);
        return Ok(format!("data:{};base64,{}", content_type, b64));
    }

    info!("Image is {} bytes (over 10MB). Resizing...", bytes.len());

    // It's over 10MB, we need to resize it.
    // If it's a GIF, resizing is complex, but we'll try to just load it as a static image for now
    // (A 10MB+ gif is huge, converting to static might be the only safe way).
    let img = image::load_from_memory(&bytes)
        .map_err(|e| BotError::Custom(format!("Failed to decode image for resizing: {}", e)))?;

    // Resize
    let resized = img.resize(MAX_DIMENSION, MAX_DIMENSION, FilterType::Lanczos3);

    // Save back to memory as JPEG (to save space) or PNG
    let mut out_bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut out_bytes);
    
    // Convert to JPEG to compress it heavily
    resized.write_to(&mut cursor, ImageFormat::Jpeg)
        .map_err(|e| BotError::Custom(format!("Failed to encode resized image: {}", e)))?;

    info!("Resized image to {} bytes.", out_bytes.len());

    if out_bytes.len() > MAX_SIZE_BYTES {
        return Err(BotError::Custom("Image is still too large even after resizing!".to_string()));
    }

    let b64 = general_purpose::STANDARD.encode(&out_bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}
