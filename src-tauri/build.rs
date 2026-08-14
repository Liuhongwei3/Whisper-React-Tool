use std::{env, fs, path::PathBuf};

const ICON_SIZE: usize = 512;

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            crc = if crc & 1 == 1 {
                (crc >> 1) ^ 0xedb8_8320
            } else {
                crc >> 1
            };
        }
    }
    !crc
}

fn adler32(bytes: &[u8]) -> u32 {
    const MOD_ADLER: u32 = 65_521;
    let mut a = 1_u32;
    let mut b = 0_u32;
    for byte in bytes {
        a = (a + u32::from(*byte)) % MOD_ADLER;
        b = (b + a) % MOD_ADLER;
    }
    (b << 16) | a
}

fn append_chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    png.extend_from_slice(kind);
    png.extend_from_slice(data);

    let mut checksum_data = Vec::with_capacity(kind.len() + data.len());
    checksum_data.extend_from_slice(kind);
    checksum_data.extend_from_slice(data);
    png.extend_from_slice(&crc32(&checksum_data).to_be_bytes());
}

fn default_icon() -> Vec<u8> {
    let mut raw_pixels = Vec::with_capacity(ICON_SIZE * (1 + ICON_SIZE * 4));
    for _ in 0..ICON_SIZE {
        raw_pixels.push(0);
        for _ in 0..ICON_SIZE {
            raw_pixels.extend_from_slice(&[79, 70, 229, 255]);
        }
    }

    let mut compressed = vec![0x78, 0x01];
    for (index, chunk) in raw_pixels.chunks(u16::MAX as usize).enumerate() {
        let is_last = index == raw_pixels.len().div_ceil(u16::MAX as usize) - 1;
        compressed.push(u8::from(is_last));
        let length = chunk.len() as u16;
        compressed.extend_from_slice(&length.to_le_bytes());
        compressed.extend_from_slice(&(!length).to_le_bytes());
        compressed.extend_from_slice(chunk);
    }
    compressed.extend_from_slice(&adler32(&raw_pixels).to_be_bytes());

    let mut png = vec![137, 80, 78, 71, 13, 10, 26, 10];
    let mut header = Vec::with_capacity(13);
    header.extend_from_slice(&(ICON_SIZE as u32).to_be_bytes());
    header.extend_from_slice(&(ICON_SIZE as u32).to_be_bytes());
    header.extend_from_slice(&[8, 6, 0, 0, 0]);
    append_chunk(&mut png, b"IHDR", &header);
    append_chunk(&mut png, b"IDAT", &compressed);
    append_chunk(&mut png, b"IEND", &[]);
    png
}

fn ensure_default_icon() {
    let icon_path = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("缺少 Cargo 清单目录"))
        .join("icons")
        .join("icon.png");
    println!("cargo:rerun-if-changed={}", icon_path.display());
    if icon_path.exists() {
        return;
    }

    fs::create_dir_all(icon_path.parent().expect("图标路径缺少父目录"))
        .expect("无法创建默认图标目录");
    fs::write(icon_path, default_icon()).expect("无法写入默认应用图标");
}

fn main() {
    ensure_default_icon();
    tauri_build::build()
}
