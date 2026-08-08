
// crypto.js

async function derive_ciphergap_message_key(password) {
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

async function encrypt_message(message, password, cachedCryptoKey = null) {
    const encoder = new TextEncoder();
    const cryptoKey = cachedCryptoKey ?? await derive_ciphergap_message_key(password);

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encoder.encode(message)
    );

    const encryptedArray = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return btoa(String.fromCharCode(...combined));
}

async function decrypt_message(encryptedMessage, password, cachedCryptoKey = null) {
    const decoder = new TextDecoder();
    const cryptoKey = cachedCryptoKey ?? await derive_ciphergap_message_key(password);

    const binary = atob(encryptedMessage.trim());
    const combined = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encryptedData
    );

    return decoder.decode(decryptedBuffer);
}
