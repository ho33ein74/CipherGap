// Shared ECDH key exchange primitives via Web Crypto API.

function get_exchange_crypto_context(codecOrId = null) {
    const registry = globalThis.CipherGapShared.formats.exchange;
    const codecId = codecOrId
        ? (typeof codecOrId === "string" ? codecOrId : codecOrId.id)
        : registry.write_codec;
    const format = registry.codecs[codecId];
    const cryptoProfile = format
        ? globalThis.CipherGapShared.formats.crypto.profiles[
            format.crypto_profile
        ]
        : null;

    if (!format || !cryptoProfile) {
        throw new Error("Unsupported key-exchange crypto profile.");
    }

    return { format, cryptoProfile };
}

async function generate_ecdh_keypair(codecOrId = null) {
    const { cryptoProfile } = get_exchange_crypto_context(codecOrId);
    return crypto.subtle.generateKey(
        {
            name: cryptoProfile.key_algorithm,
            namedCurve: cryptoProfile.named_curve
        },
        true,
        ["deriveBits"]
    );
}

async function export_public_key_b64(publicKey) {
    const spki = await crypto.subtle.exportKey("spki", publicKey);
    return globalThis.CipherGapShared.encoding.bytes_to_base64(spki);
}

async function import_public_key_b64(publicKeyB64, codecOrId = null) {
    const { cryptoProfile } = get_exchange_crypto_context(codecOrId);
    const binary = globalThis.CipherGapShared.encoding
        .base64_to_bytes(publicKeyB64);
    return crypto.subtle.importKey(
        "spki",
        binary,
        {
            name: cryptoProfile.key_algorithm,
            namedCurve: cryptoProfile.named_curve
        },
        true,
        []
    );
}

async function derive_shared_secret_string(
    privateKey,
    peerPublicKeyB64,
    codecOrId = null
) {
    const { cryptoProfile } = get_exchange_crypto_context(codecOrId);
    const peerPublicKey = await import_public_key_b64(
        peerPublicKeyB64,
        codecOrId
    );
    const sharedBits = await crypto.subtle.deriveBits(
        { name: cryptoProfile.key_algorithm, public: peerPublicKey },
        privateKey,
        cryptoProfile.derive_bits
    );
    const hash = await crypto.subtle.digest(
        cryptoProfile.hash_algorithm,
        sharedBits
    );
    return globalThis.CipherGapShared.encoding.bytes_to_base64(hash);
}

async function create_dh_session(codecOrId = null) {
    const { format } = get_exchange_crypto_context(codecOrId);
    const keyPair = await generate_ecdh_keypair(format);
    const publicKeyB64 = await export_public_key_b64(keyPair.publicKey);
    const nonce = generate_exchange_nonce(format);
    return {
        privateKey: keyPair.privateKey,
        publicKeyB64,
        nonce,
        codecId: format.id
    };
}

function generate_exchange_nonce(codecOrId = null) {
    const { format } = get_exchange_crypto_context(codecOrId);
    const byteLength = format.nonce_hex_length / 2;
    return globalThis.CipherGapShared.encoding.bytes_to_hex(
        crypto.getRandomValues(new Uint8Array(byteLength))
    );
}

// Derive the configured Short Authentication String (SAS) from the shared secret.
// Both parties independently compute the same SAS and compare it out-of-band
// (e.g. voice call) to verify no MITM occurred during key exchange.
async function derive_sas(sharedSecretB64, codecOrId = null) {
    const { format, cryptoProfile } = get_exchange_crypto_context(codecOrId);
    const sasDigits = format.sas_digits;
    const secretBytes = globalThis.CipherGapShared.encoding
        .base64_to_bytes(sharedSecretB64);
    const hash = await crypto.subtle.digest(
        cryptoProfile.hash_algorithm,
        secretBytes
    );
    const hashArray = new Uint8Array(hash);
    const entropyBits = cryptoProfile.sas_entropy_bits;
    const entropyBytes = Math.ceil(entropyBits / 8);
    if (
        !Number.isInteger(entropyBits) ||
        entropyBits < 1 ||
        entropyBytes > hashArray.length
    ) {
        throw new Error("The key-exchange SAS profile is invalid.");
    }

    let value = 0n;
    for (let index = 0; index < entropyBytes; index++) {
        value = (value << 8n) | BigInt(hashArray[index]);
    }
    value >>= BigInt(entropyBytes * 8 - entropyBits);

    const decimalRange = 10n ** BigInt(sasDigits);
    return (value % decimalRange).toString().padStart(sasDigits, "0");
}

// Compute a short fingerprint for a public key (first 8 hex chars of SHA-256).
// Used for TOFU (Trust On First Use) to detect future key changes.
async function compute_key_fingerprint(publicKeyB64, codecOrId = null) {
    const { format, cryptoProfile } = get_exchange_crypto_context(codecOrId);
    const keyBytes = globalThis.CipherGapShared.encoding
        .base64_to_bytes(publicKeyB64);
    const hash = await crypto.subtle.digest(
        cryptoProfile.hash_algorithm,
        keyBytes
    );
    return globalThis.CipherGapShared.encoding.bytes_to_hex(hash)
        .slice(0, format.fingerprint_hex_length)
        .toUpperCase();
}

globalThis.CipherGapShared.ecdh = Object.freeze({
    generate_ecdh_keypair,
    export_public_key_b64,
    import_public_key_b64,
    derive_shared_secret_string,
    create_dh_session,
    generate_exchange_nonce,
    derive_sas,
    compute_key_fingerprint
});
