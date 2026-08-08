// file_crypto.js — Encrypt/decrypt files using AES-256-GCM
// Uses the same key derivation as crypto.js (SHA-256 of shared secret).
// Files are wrapped in a CGPE binary container so the receiver can
// identify and decrypt them.

const CGPE_MAGIC = new Uint8Array([0x43, 0x47, 0x50, 0x45]); // "CGPE"
const CGPE_VERSION = 0x01;
const CGPE_MAGIC_STRING = "CGPE";
// Version 1 encrypts whole files in memory. Keep a conservative ceiling so a
// large attachment cannot freeze or crash the messenger tab.
const CGPE_MAX_FILE_BYTES = 100 * 1024 * 1024;
const CGPE_MAX_FILENAME_BYTES = 4096;
const CGPE_MAX_MIME_BYTES = 1024;
const CGPE_GCM_TAG_BYTES = 16;

// =========================
// Helper: derive AES key from password (same logic as crypto.js)
// =========================

async function derive_aes_key(password) {
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    const passwordHash = await crypto.subtle.digest("SHA-256", passwordBytes);
    return crypto.subtle.importKey(
        "raw",
        passwordHash,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

// =========================
// Encrypt file → CGPE binary blob
// =========================

async function encrypt_file(file, password, existingAesKey = null) {
    if (
        !file ||
        typeof file.arrayBuffer !== "function" ||
        !Number.isFinite(file.size)
    ) {
        throw new Error("No valid file was selected.");
    }
    if (file.size > CGPE_MAX_FILE_BYTES) {
        throw new Error("This file is larger than CipherGap's 100 MB safety limit.");
    }

    const fileBuffer = await file.arrayBuffer();
    const aesKey = existingAesKey ?? await derive_aes_key(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        fileBuffer
    );

    // Encode original filename and MIME type as UTF-8
    const nameEncoder = new TextEncoder();
    const nameBytes = nameEncoder.encode(file.name);
    const mimeBytes = nameEncoder.encode(file.type || "application/octet-stream");

    if (nameBytes.length === 0 || nameBytes.length > CGPE_MAX_FILENAME_BYTES) {
        throw new Error("The selected file has an invalid or unusually long name.");
    }
    if (mimeBytes.length > CGPE_MAX_MIME_BYTES) {
        throw new Error("The selected file has an unusually long MIME type.");
    }

    // Calculate total size:
    // 4 (magic) + 1 (version) + 4 (name length) + nameBytes + 4 (mime length) + mimeBytes + 12 (IV) + ciphertext
    const headerSize = 4 + 1 + 4 + nameBytes.length + 4 + mimeBytes.length;
    const totalSize = headerSize + 12 + encryptedBuffer.byteLength;

    const cgpe = new Uint8Array(totalSize);
    let offset = 0;

    // Magic
    cgpe.set(CGPE_MAGIC, offset);
    offset += 4;

    // Version
    cgpe[offset] = CGPE_VERSION;
    offset += 1;

    // Original filename length (uint32 LE)
    cgpe[offset] = nameBytes.length & 0xFF;
    cgpe[offset + 1] = (nameBytes.length >> 8) & 0xFF;
    cgpe[offset + 2] = (nameBytes.length >> 16) & 0xFF;
    cgpe[offset + 3] = (nameBytes.length >> 24) & 0xFF;
    offset += 4;

    // Original filename
    cgpe.set(nameBytes, offset);
    offset += nameBytes.length;

    // Original MIME type length (uint32 LE)
    cgpe[offset] = mimeBytes.length & 0xFF;
    cgpe[offset + 1] = (mimeBytes.length >> 8) & 0xFF;
    cgpe[offset + 2] = (mimeBytes.length >> 16) & 0xFF;
    cgpe[offset + 3] = (mimeBytes.length >> 24) & 0xFF;
    offset += 4;

    // Original MIME type
    cgpe.set(mimeBytes, offset);
    offset += mimeBytes.length;

    // IV
    cgpe.set(iv, offset);
    offset += 12;

    // Ciphertext
    cgpe.set(new Uint8Array(encryptedBuffer), offset);

    // Return as a File object with .cgpe extension
    const encryptedName = file.name + ".cgpe";
    return new File([cgpe.buffer], encryptedName, {
        type: "application/octet-stream"
    });
}

// =========================
// Decrypt CGPE binary blob → original file
// =========================

async function decrypt_cgpe(arrayBuffer, password, existingAesKey = null) {
    const data = new Uint8Array(arrayBuffer);
    const maximumContainerBytes = CGPE_MAX_FILE_BYTES + 4 + 1 + 4 +
        CGPE_MAX_FILENAME_BYTES + 4 + CGPE_MAX_MIME_BYTES + 12 + CGPE_GCM_TAG_BYTES;

    if (data.length > maximumContainerBytes) {
        throw new Error("This encrypted file is larger than CipherGap's 100 MB safety limit.");
    }

    // Validate magic
    if (data.length < 4 + 1 + 4 + 4 + 12 + CGPE_GCM_TAG_BYTES ||
        data[0] !== 0x43 || data[1] !== 0x47 ||
        data[2] !== 0x50 || data[3] !== 0x45) {
        throw new Error("Not a valid CGPE file.");
    }

    // Validate version
    if (data[4] !== CGPE_VERSION) {
        throw new Error("Unsupported CGPE version: " + data[4]);
    }

    let offset = 5;

    // Read original filename length
    const nameLen = (data[offset] | (data[offset + 1] << 8) |
                     (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
    offset += 4;

    if (nameLen === 0 || nameLen > CGPE_MAX_FILENAME_BYTES ||
        offset + nameLen + 4 + 12 + CGPE_GCM_TAG_BYTES > data.length) {
        throw new Error("The CGPE filename metadata is invalid.");
    }

    // Read original filename
    const nameBytes = data.slice(offset, offset + nameLen);
    const decodedName = new TextDecoder().decode(nameBytes);
    const originalName = sanitize_cgpe_filename(decodedName);
    offset += nameLen;

    // Read original MIME type length
    const mimeLen = (data[offset] | (data[offset + 1] << 8) |
                     (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
    offset += 4;

    if (mimeLen > CGPE_MAX_MIME_BYTES ||
        offset + mimeLen + 12 + CGPE_GCM_TAG_BYTES > data.length) {
        throw new Error("The CGPE MIME metadata is invalid.");
    }

    // Read original MIME type
    const mimeBytes = data.slice(offset, offset + mimeLen);
    const originalMime = new TextDecoder().decode(mimeBytes) || "application/octet-stream";
    offset += mimeLen;

    // Read IV (12 bytes)
    const iv = data.slice(offset, offset + 12);
    offset += 12;

    // Remaining bytes are ciphertext
    const ciphertext = data.slice(offset);

    // Decrypt
    const aesKey = existingAesKey ?? await derive_aes_key(password);
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ciphertext
    );

    return {
        name: originalName,
        type: originalMime,
        data: decryptedBuffer
    };
}

// Do not let metadata from an encrypted file create path-like download names.
function sanitize_cgpe_filename(filename) {
    const leafName = filename.replace(/\\/g, "/").split("/").pop();
    const cleanName = leafName
        .replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
        .trim();
    return cleanName && cleanName !== "." && cleanName !== ".."
        ? cleanName
        : "decrypted-file";
}

// =========================
// Check if a File/Blob is a CGPE encrypted file
// =========================

async function is_cgpe_file(file) {
    if (!file) {
        return false;
    }

    // Quick check: does the filename end with .cgpe?
    if (file.name && file.name.toLowerCase().endsWith(".cgpe")) {
        return true;
    }

    // Fallback: read first 4 bytes and check magic
    try {
        const slice = file.slice(0, 4);
        const header = await slice.arrayBuffer();
        const view = new Uint8Array(header);
        return (
            view[0] === 0x43 && view[1] === 0x47 &&
            view[2] === 0x50 && view[3] === 0x45
        );
    } catch {
        return false;
    }
}
