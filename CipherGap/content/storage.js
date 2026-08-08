
// storage.js

function get_storage_key() {
    const url = new URL(window.location.href);
    const hostname = url.hostname;
    const adapter = get_messenger_adapter_by_hostname(hostname);

    if (adapter?.get_chat_storage_suffix) {
        const suffix = adapter.get_chat_storage_suffix(url);
        if (suffix) {
            return `${hostname}_${suffix}`;
        }
    }

    if (hostname === "web.bale.ai") {
        const uid = url.searchParams.get("uid");
        if (uid) {
            return `${hostname}_${uid}`;
        }
    }

    return hostname;
}

async function get_secret_key() {
    const storageKey = get_storage_key();
    const storage = await chrome.storage.local.get([storageKey]);
    return storage[storageKey];
}

async function set_secret_key(key) {
    const storageKey = get_storage_key();
    await chrome.storage.local.set({ [storageKey]: key });
}

// =========================
// Auto-decrypt setting (per chat)
// =========================

const AUTO_DECRYPT_SUFFIX = "__auto_decrypt";

async function get_auto_decrypt() {
    const storageKey = get_storage_key();
    const result = await chrome.storage.local.get([`${storageKey}${AUTO_DECRYPT_SUFFIX}`]);
    return Boolean(result[`${storageKey}${AUTO_DECRYPT_SUFFIX}`]);
}

async function set_auto_decrypt(enabled) {
    const storageKey = get_storage_key();
    await chrome.storage.local.set({ [`${storageKey}${AUTO_DECRYPT_SUFFIX}`]: Boolean(enabled) });
}

// =========================
// Clear key for current chat
// =========================

async function clear_secret_key() {
    const storageKey = get_storage_key();
    await chrome.storage.local.remove([
        storageKey,
        `key_trust_${storageKey}`
    ]);
}

function is_in_chat() {
    const adapter = get_active_messenger_adapter();
    if (adapter?.is_in_chat) {
        return adapter.is_in_chat();
    }

    return get_storage_key().includes("_");
}

function get_chat_id_from_url() {
    const url = new URL(window.location.href);
    return url.searchParams.get("uid");
}

// =========================
// Handled exchange nonces (persistent)
// =========================

const HANDLED_NONCES_KEY = "cg_handled_nonces";
const HANDLED_NONCES_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours — nonces expire after this

// Load handled nonces from storage. Called once on page load.
async function load_handled_nonces() {
    const result = await chrome.storage.local.get([HANDLED_NONCES_KEY]);
    const entry = result[HANDLED_NONCES_KEY];
    if (!entry) {
        return new Set();
    }

    // Filter out expired nonces
    const now = Date.now();
    const nonces = new Set(
        entry.nonces.filter((item) => now - item.at < HANDLED_NONCES_EXPIRY_MS).map((item) => item.id)
    );

    // Save cleaned list back to storage
    await chrome.storage.local.set({
        [HANDLED_NONCES_KEY]: {
            nonces: entry.nonces.filter((item) => now - item.at < HANDLED_NONCES_EXPIRY_MS)
        }
    });

    return nonces;
}

// Persist a handled nonce to storage so it survives page refresh.
async function save_handled_nonce(nonceId) {
    const result = await chrome.storage.local.get([HANDLED_NONCES_KEY]);
    const entry = result[HANDLED_NONCES_KEY] ?? { nonces: [] };

    entry.nonces.push({ id: nonceId, at: Date.now() });

    await chrome.storage.local.set({ [HANDLED_NONCES_KEY]: entry });
}

// Remove expired handled nonces from storage (run periodically).
async function prune_handled_nonces() {
    const result = await chrome.storage.local.get([HANDLED_NONCES_KEY]);
    const entry = result[HANDLED_NONCES_KEY];
    if (!entry) {
        return;
    }

    const now = Date.now();
    const pruned = entry.nonces.filter((item) => now - item.at < HANDLED_NONCES_EXPIRY_MS);

    if (pruned.length !== entry.nonces.length) {
        await chrome.storage.local.set({ [HANDLED_NONCES_KEY]: { nonces: pruned } });
    }
}


// =========================
// Peer fingerprint (TOFU)
// =========================

async function save_peer_fingerprint(storageKey, fingerprint) {
    await chrome.storage.local.set({
        [`peer_fp_${storageKey}`]: {
            fingerprint,
            at: Date.now()
        }
    });
}

async function get_peer_fingerprint(storageKey) {
    const key = `peer_fp_${storageKey}`;
    const result = await chrome.storage.local.get([key]);
    return result[key] ?? null;
}

// =========================
// Stale exchange cleanup
// =========================

const EXCHANGE_STATUS_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Remove expired exchange_status_* entries from storage so they don't
// linger as phantom "waiting" states when the user returns to a chat later.
async function cleanup_stale_exchange_status(storageKey) {
    // Opportunistically prune expired nonces to keep storage bounded
    prune_handled_nonces().catch(() => {});

    const statusKey = `exchange_status_${storageKey}`;
    const result = await chrome.storage.local.get([statusKey]);
    const entry = result[statusKey];

    if (!entry) {
        return;
    }

    // Already complete — keep it, but only for a limited time
    if (entry.status === "complete" && Date.now() - entry.at > EXCHANGE_STATUS_EXPIRY_MS) {
        await chrome.storage.local.remove(statusKey);
        return;
    }

    // Pending outgoing and incoming requests share the same expiry policy.
    if (
        (entry.status === "waiting" || entry.status === "incoming") &&
        Date.now() - entry.at > EXCHANGE_STATUS_EXPIRY_MS
    ) {
        await chrome.storage.local.remove(statusKey);
    }
}
