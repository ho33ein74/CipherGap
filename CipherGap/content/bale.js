// bale.js

const BALE_MESSAGE_SCROLLER = "#message_list_scroller_id";
const BALE_CHAT_INPUT = "#editable-message-text";
const BALE_SEND_BUTTON = '[aria-label="send-button"]';
const BALE_MESSAGE_ITEM = '[data-sid][aria-label="message-item"]';
const IS_BALE_HOST = window.location.hostname === "web.bale.ai";
const CIPHERGAP_INTERNAL_FILE_INPUT = "ciphergapInternalFileInput";
const BALE_LIFECYCLE_SELECTOR = [
    BALE_MESSAGE_SCROLLER,
    BALE_CHAT_INPUT,
    "#chat_footer",
    "#ciphergap-btn"
].join(",");

// Flag: when true, sanitize_bale_input will skip stripping — prevents the
// sanitizer from eating exchange text while bale_send_message is using it.
let cg_sending = false;
let cg_notice_timeout = null;

function inject_ciphergap_content_styles() {
    if (document.getElementById("ciphergap-content-styles")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "ciphergap-content-styles";
    style.textContent = `
        .ciphergap-action:focus-visible {
            outline: 3px solid #fbbf24 !important;
            outline-offset: 2px !important;
        }
        #ciphergap-btn {
            box-sizing: border-box !important;
            flex: 0 0 auto !important;
            min-inline-size: 68px !important;
            block-size: 40px !important;
            margin-inline: 6px 2px !important;
            padding-inline: 12px !important;
            border: 0 !important;
            border-radius: 10px !important;
            background: #2563eb !important;
            color: #fff !important;
            cursor: pointer !important;
            font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        #ciphergap-btn:hover:not(:disabled) {
            background: #1d4ed8 !important;
        }
        #ciphergap-btn:disabled {
            cursor: wait !important;
            opacity: .68 !important;
        }
        [data-ciphergap-protocol-raw="true"] {
            display: none !important;
        }
        .ciphergap-chat-card {
            box-sizing: border-box !important;
            position: static !important;
            display: grid !important;
            float: none !important;
            clear: both !important;
            inline-size: min(238px, 100%) !important;
            min-inline-size: 0 !important;
            max-inline-size: 100% !important;
            margin: 2px 0 !important;
            padding: 8px 10px !important;
            gap: 4px !important;
            border: 1px solid rgba(15, 23, 42, .14) !important;
            border-inline-start-width: 3px !important;
            border-radius: 10px !important;
            background: rgba(255, 255, 255, .42) !important;
            color: inherit !important;
            direction: ltr !important;
            text-align: start !important;
            white-space: normal !important;
            overflow: hidden !important;
            font: 500 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-chat-card--exchange {
            border-inline-start-color: #2563eb !important;
        }
        .ciphergap-chat-card--sas {
            border-inline-start-color: #16a34a !important;
        }
        .ciphergap-chat-card__heading {
            display: flex !important;
            align-items: center !important;
            gap: 7px !important;
            min-inline-size: 0 !important;
            font: 700 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-chat-card__mark {
            box-sizing: border-box !important;
            display: inline-grid !important;
            place-items: center !important;
            flex: 0 0 22px !important;
            inline-size: 22px !important;
            block-size: 22px !important;
            border-radius: 7px !important;
            background: rgba(37, 99, 235, .13) !important;
            font: 800 9px/1 system-ui, sans-serif !important;
            letter-spacing: 0 !important;
        }
        .ciphergap-chat-card--sas .ciphergap-chat-card__mark {
            background: rgba(22, 163, 74, .14) !important;
        }
        .ciphergap-chat-card__code {
            display: block !important;
            max-inline-size: 100% !important;
            margin-block: 1px !important;
            overflow: hidden !important;
            color: inherit !important;
            font: 750 20px/1.25 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace !important;
            font-variant-numeric: tabular-nums !important;
            letter-spacing: .15em !important;
            white-space: nowrap !important;
            unicode-bidi: isolate !important;
        }
        .ciphergap-chat-card__meta {
            display: block !important;
            min-inline-size: 0 !important;
            max-inline-size: 100% !important;
            opacity: .7 !important;
            overflow-wrap: anywhere !important;
            font: 500 11px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-encrypted-details > code {
            max-block-size: 140px !important;
            overflow: auto !important;
            overscroll-behavior: contain !important;
        }
        .ciphergap-file-decrypt-wrap {
            box-sizing: border-box !important;
            display: grid !important;
            position: static !important;
            gap: 7px !important;
            inline-size: min(260px, 100%) !important;
            max-inline-size: 100% !important;
            margin-block-start: 7px !important;
            padding: 8px 10px !important;
            border: 1px solid rgba(15, 23, 42, .12) !important;
            border-radius: 10px !important;
            background: rgba(255, 255, 255, .36) !important;
            color: inherit !important;
            pointer-events: auto !important;
        }
        .ciphergap-file-decrypt-hint {
            display: block !important;
            opacity: .72 !important;
            font: 500 11px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        }
        .ciphergap-decrypt-button,
        .ciphergap-file-decrypt-button {
            min-block-size: 40px !important;
        }
        .ciphergap-file-decrypt-button[data-state="success"] {
            background: #15803d !important;
        }
        .ciphergap-file-decrypt-button[data-state="error"] {
            background: #b91c1c !important;
        }
        #ciphergap-live-notice {
            position: fixed;
            inset-inline-end: 16px;
            bottom: 82px;
            z-index: 2147483647;
            max-width: min(340px, calc(100vw - 32px));
            padding: 10px 14px;
            border: 1px solid rgba(255, 255, 255, .18);
            border-radius: 10px;
            background: #172033;
            box-shadow: 0 12px 30px rgba(15, 23, 42, .35);
            color: #f8fafc;
            font: 600 13px/1.45 system-ui, sans-serif;
        }
        #ciphergap-live-notice[data-kind="success"] { background: #166534; }
        #ciphergap-live-notice[data-kind="warning"] { background: #854d0e; }
        #ciphergap-live-notice[data-kind="error"] { background: #991b1b; }
        @media (prefers-color-scheme: dark) {
            .ciphergap-chat-card {
                border-color: rgba(255, 255, 255, .2) !important;
                background: rgba(15, 23, 42, .18) !important;
            }
            .ciphergap-chat-card--exchange {
                border-inline-start-color: #60a5fa !important;
            }
            .ciphergap-chat-card--sas {
                border-inline-start-color: #4ade80 !important;
            }
        }
        @media (forced-colors: active) {
            .ciphergap-chat-card {
                border: 1px solid CanvasText !important;
                border-inline-start-width: 3px !important;
                background: Canvas !important;
                color: CanvasText !important;
            }
        }
    `;
    document.head?.appendChild(style);
}

function show_ciphergap_notice(message, kind = "info", durationMs = 5000) {
    inject_ciphergap_content_styles();

    let notice = document.getElementById("ciphergap-live-notice");
    if (!notice) {
        notice = document.createElement("div");
        notice.id = "ciphergap-live-notice";
        notice.setAttribute("aria-atomic", "true");
        document.body.appendChild(notice);
    }

    notice.setAttribute("role", kind === "error" ? "alert" : "status");
    notice.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    notice.dataset.kind = kind;
    notice.textContent = message;
    notice.hidden = false;

    clearTimeout(cg_notice_timeout);
    cg_notice_timeout = setTimeout(() => {
        notice.hidden = true;
    }, durationMs);
}

function redispatch_file_selection(fileInput, files) {
    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    cg_redispatching = true;
    try {
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
        cg_redispatching = false;
    }
}

// =========================
// File upload interception
// =========================

// Track which file inputs we've already hooked so we don't double-wrap.
const hooked_file_inputs = new WeakSet();
// Reentrancy guard: while we're re-dispatching an encrypted change event,
// our own listener must ignore it (otherwise infinite loop).
let cg_redispatching = false;

// Intercept file selection: when a user picks files through Bale's
// attachment menu, encrypt them as .cgpe if a chat key exists.
//
// This listener runs SYNCHRONOUSLY first: it grabs the original files,
// replaces the input's files with an empty list (so Bale's React handler
// that runs right after us sees nothing), then asynchronously encrypts and
// re-dispatches a change event carrying the encrypted files.
function intercept_file_selection(fileInput) {
    if (
        hooked_file_inputs.has(fileInput) ||
        fileInput.dataset[CIPHERGAP_INTERNAL_FILE_INPUT] === "true"
    ) {
        return;
    }
    hooked_file_inputs.add(fileInput);

    fileInput.addEventListener("change", async (event) => {
        // Ignore our own re-dispatched event
        if (cg_redispatching || !get_chat_id_from_url()) {
            return;
        }

        const files = fileInput.files;
        if (!files || files.length === 0) {
            return;
        }

        // Synchronously snapshot the original files and clear the input so
        // Bale's subsequent handler sees an empty selection. We run in the
        // capture phase and stop propagation to fully suppress Bale's handler.
        const originalFiles = Array.from(files);

        const currentStorageKey = get_storage_key();
        const cacheMatchesCurrentChat =
            cg_cache_ready && cg_cached_storage_key === currentStorageKey;

        if (cacheMatchesCurrentChat && !cg_cached_key) {
            show_ciphergap_notice(
                "No CipherGap key is set. This attachment will not be encrypted.",
                "warning"
            );
            return;
        }

        // Suppress Bale's handler for THIS event (capture phase + stopPropagation)
        event.stopImmediatePropagation();
        event.stopPropagation();

        // Clear the input immediately so nothing leaks the originals
        const emptyDt = new DataTransfer();
        fileInput.files = emptyDt.files;

        // Resolve a cold or invalidated cache after the original event has
        // been stopped. This prevents a fast selection after SPA navigation
        // from leaking a file with the previous chat's key.
        try {
            if (!cacheMatchesCurrentChat) {
                if (cg_cached_storage_key !== currentStorageKey) {
                    invalidate_cg_chat_cache(currentStorageKey);
                }
                await refresh_cg_chat_cache();
            }

            if (get_storage_key() !== currentStorageKey) {
                throw new Error("The active chat changed before encryption finished.");
            }

            const secretKey = cg_cached_key;
            if (!secretKey) {
                redispatch_file_selection(fileInput, originalFiles);
                show_ciphergap_notice(
                    "No CipherGap key is set. The original attachment was restored unencrypted.",
                    "warning",
                    7000
                );
                return;
            }

            const totalSelectedBytes = originalFiles.reduce(
                (total, file) => total + file.size,
                0
            );
            if (totalSelectedBytes > CGPE_MAX_FILE_BYTES) {
                throw new Error(
                    "The selected files exceed CipherGap's 100 MB combined safety limit."
                );
            }

            const encryptedFiles = [];
            const fileCryptoKey = await derive_aes_key(secretKey);
            for (let i = 0; i < originalFiles.length; i++) {
                const encrypted = await encrypt_file(
                    originalFiles[i],
                    secretKey,
                    fileCryptoKey
                );
                encryptedFiles.push(encrypted);
            }

            // Put encrypted files back and re-dispatch a change event so
            // Bale's React handler picks them up.
            redispatch_file_selection(fileInput, encryptedFiles);

            show_ciphergap_notice(
                `${encryptedFiles.length} attachment${encryptedFiles.length === 1 ? "" : "s"} encrypted and ready to send.`,
                "success"
            );
        } catch (error) {
            console.error("[CipherGap] File encryption failed:", error);
            show_ciphergap_notice(
                `Attachment not sent: ${error.message}`,
                "error",
                7000
            );
        }
    }, true); // CAPTURE phase — runs before Bale's bubble-phase listener
}

// Per-chat runtime cache. File interception needs the raw key synchronously;
// message processing also reuses the auto-decrypt flag and derived CryptoKey.
let cg_cached_storage_key = null;
let cg_cached_key = null;
let cg_cached_auto_decrypt = false;
let cg_cached_message_key = null;
let cg_cache_ready = false;
let cg_cache_refresh_token = 0;
let cg_cache_refresh_promise = null;
let cg_cache_refresh_storage_key = null;

function invalidate_cg_chat_cache(storageKey = get_storage_key()) {
    cg_cache_refresh_token += 1;
    cg_cached_storage_key = storageKey;
    cg_cached_key = null;
    cg_cached_auto_decrypt = false;
    cg_cached_message_key = null;
    cg_cache_ready = false;
}

async function refresh_cg_chat_cache(force = false) {
    const storageKey = get_storage_key();

    if (cg_cached_storage_key !== storageKey) {
        invalidate_cg_chat_cache(storageKey);
    }

    if (!force && cg_cache_ready) {
        return;
    }

    if (
        !force &&
        cg_cache_refresh_promise &&
        cg_cache_refresh_storage_key === storageKey
    ) {
        return cg_cache_refresh_promise;
    }

    const refreshToken = ++cg_cache_refresh_token;
    const autoDecryptKey = `${storageKey}${AUTO_DECRYPT_SUFFIX}`;
    cg_cache_refresh_storage_key = storageKey;

    const refreshPromise = (async () => {
        const result = await chrome.storage.local.get([storageKey, autoDecryptKey]);
        const secretKey = result[storageKey] ?? null;
        const messageKey = secretKey
            ? await derive_ciphergap_message_key(secretKey)
            : null;

        if (
            refreshToken !== cg_cache_refresh_token ||
            get_storage_key() !== storageKey
        ) {
            return;
        }

        cg_cached_storage_key = storageKey;
        cg_cached_key = secretKey;
        cg_cached_auto_decrypt = Boolean(result[autoDecryptKey]);
        cg_cached_message_key = messageKey;
        cg_cache_ready = true;
    })();

    cg_cache_refresh_promise = refreshPromise;

    try {
        await refreshPromise;
    } finally {
        if (cg_cache_refresh_promise === refreshPromise) {
            cg_cache_refresh_promise = null;
            cg_cache_refresh_storage_key = null;
        }
    }
}

// Refresh only when the current chat's key or setting changes. Other local
// storage writes (nonces, fingerprints, other chats) no longer cause a read.
if (IS_BALE_HOST) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") {
            return;
        }

        const storageKey = get_storage_key();
        const autoDecryptKey = `${storageKey}${AUTO_DECRYPT_SUFFIX}`;
        if (changes[storageKey] || changes[autoDecryptKey]) {
            const chatKeyChanged = Boolean(changes[storageKey]);
            invalidate_cg_chat_cache(storageKey);
            refresh_cg_chat_cache(true)
                .then(() => {
                    if (chatKeyChanged && cg_cached_auto_decrypt && cg_cached_key) {
                        auto_decrypt_visible_messages().catch(() => {});
                    }
                })
                .catch(() => {});
        }
    });
}

function hook_file_inputs_in_node(node) {
    if (!(node instanceof HTMLElement)) {
        return;
    }

    if (node.tagName === "INPUT" && node.type === "file") {
        intercept_file_selection(node);
    }

    node.querySelectorAll?.('input[type="file"]').forEach(intercept_file_selection);
}

function normalize_message_text(text) {
    return text
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\r\n]+/g, "")
        .trim();
}

function is_ciphergap_ui_element(element) {
    return Boolean(element?.closest?.("[data-ciphergap-ui]"));
}

function get_deepest_matching_payload(messageElement, parseCandidate) {
    const matches = [];
    const candidates = messageElement.querySelectorAll("span, p, div, a, [dir]");

    for (const element of candidates) {
        if (
            element === messageElement ||
            is_ciphergap_ui_element(element) ||
            element.closest('[role="checkbox"]') ||
            element.closest('[data-testid="message-state-icon"]') ||
            element.closest("svg")
        ) {
            continue;
        }

        const parsed = parseCandidate(element.textContent ?? "");
        if (parsed) {
            matches.push({ element, ...parsed });
        }
    }

    if (matches.length === 0) {
        return null;
    }

    // Bale can split a payload across nested nodes. Prefer the deepest strict
    // match so only the real payload is hidden, never its bubble or timestamp.
    return matches.find(({ element }) =>
        !matches.some(({ element: other }) =>
            other !== element && element.contains(other)
        )
    ) ?? matches[matches.length - 1];
}

function parse_strict_exchange_payload(text) {
    const parsed = parse_exchange_message(text);
    if (!parsed) {
        return null;
    }

    if (parsed.type === "start" || parsed.type === "ack") {
        const nonce = parsed.nonce.replace(/\s+/g, "");
        const publicKeyB64 = parsed.publicKeyB64.replace(/\s+/g, "");
        const validNonce = /^[a-f0-9]{32}$/i.test(nonce);
        const validPublicKey =
            publicKeyB64.length >= 80 &&
            publicKeyB64.length <= 1024 &&
            publicKeyB64.length % 4 === 0 &&
            /^[A-Za-z0-9+/]+={0,2}$/.test(publicKeyB64);

        if (!validNonce || !validPublicKey) {
            return null;
        }

        const prefix = parsed.type === "start"
            ? EXCHANGE_START_PREFIX
            : EXCHANGE_ACK_PREFIX;
        return {
            parsed: { ...parsed, nonce, publicKeyB64 },
            protocolText: `${prefix} ${nonce}|${publicKeyB64}`,
            signature: `${parsed.type}:${nonce}`
        };
    }

    const sasMatch = normalize_exchange_text(text)
        .match(/^cg-sas\|(\d{6})\|([A-F0-9]{8})$/i);
    if (!sasMatch) {
        return null;
    }

    const sas = sasMatch[1];
    const fingerprint = sasMatch[2].toUpperCase();
    return {
        parsed: { type: "sas", sas, fingerprint },
        protocolText: `${EXCHANGE_SAS_PREFIX}|${sas}|${fingerprint}`,
        signature: `sas:${sas}:${fingerprint}`
    };
}

function find_exchange_protocol_payload(messageElement) {
    const aggregateText = (messageElement.textContent ?? "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .toLowerCase();
    if (
        !aggregateText.includes(EXCHANGE_START_PREFIX) &&
        !aggregateText.includes(EXCHANGE_ACK_PREFIX) &&
        !aggregateText.includes(`${EXCHANGE_SAS_PREFIX}|`)
    ) {
        return null;
    }

    return get_deepest_matching_payload(
        messageElement,
        parse_strict_exchange_payload
    );
}

async function bale_send_message(text) {
    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        throw new Error("Bale chat input not found.");
    }

    const sendButton = document.querySelector(BALE_SEND_BUTTON);
    if (!sendButton) {
        throw new Error("Bale send button not found.");
    }

    // Block the sanitizer while we fill the input and click send.
    cg_sending = true;

    input.textContent = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));

    sendButton.click();

    // Clear the input after sending so exchange/SAS messages don't linger
    // in the field and risk being re-processed or re-sent.
    setTimeout(() => {
        input.textContent = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        cg_sending = false;
    }, 150);
}

// Clear the chat input field (used after exchange success / SAS verification).
function clear_bale_input() {
    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        return false;
    }

    input.textContent = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
}

// Guard: strip any exchange/SAS text that may have lingered in the input.
// Called on input changes so a stray "cg-sas|..." never gets sent again.
function sanitize_bale_input() {
    if (cg_sending) {
        return; // Skip — bale_send_message is actively using the input
    }

    const input = document.querySelector(BALE_CHAT_INPUT);
    if (!input) {
        return;
    }

    const text = normalize_message_text(input.textContent ?? "");
    if (is_exchange_message(text)) {
        input.textContent = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        console.warn("[CipherGap] Stripped lingering exchange text from chat input.");
    }
}

function extract_bale_message_text(messageElement) {
    for (const span of messageElement.querySelectorAll("span")) {
        if (is_ciphergap_ui_element(span)) {
            continue;
        }
        const text = normalize_message_text(span.textContent ?? "");
        if (text) {
            return text;
        }
    }

    return normalize_message_text(messageElement.textContent ?? "");
}

// =========================
// Encrypt button
// =========================

function inject_encrypt_button_bale() {
    if (document.getElementById("ciphergap-btn")) {
        return;
    }

    const chatFooter = document.getElementById("chat_footer");
    if (!chatFooter) {
        return;
    }

    const sendControl = chatFooter.querySelector(BALE_SEND_BUTTON);
    if (!sendControl) {
        return;
    }

    const sendSlot = sendControl.closest("button") ?? sendControl;
    const buttonContainer = sendSlot.parentElement;
    if (!buttonContainer) {
        return;
    }

    const button = document.createElement("button");
    button.id = "ciphergap-btn";
    button.className = "ciphergap-action";
    button.type = "button";
    button.innerText = "Encrypt";
    button.setAttribute("aria-label", "Encrypt and send with CipherGap");
    button.title = "Encrypt and send with CipherGap";

    button.addEventListener("click", async () => {
        try {
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            button.setAttribute("aria-label", "Encrypting and sending with CipherGap");
            button.innerText = "Sending…";

            const input = document.querySelector(BALE_CHAT_INPUT);
            if (!input) {
                return;
            }

            const plainText = input.textContent?.trim();
            if (!plainText) {
                return;
            }

            await refresh_cg_chat_cache();
            const secretKey = cg_cached_key;
            if (!secretKey) {
                show_ciphergap_notice(
                    "No key is set for this chat. Open CipherGap to exchange or add one.",
                    "warning",
                    7000
                );
                return;
            }

            const encryptedMessage = await encrypt_message(
                plainText,
                secretKey,
                cg_cached_message_key
            );
            const finalMessage = build_ciphergap_packet(encryptedMessage);

            await bale_send_message(finalMessage);
            show_ciphergap_notice("Encrypted message sent.", "success", 3000);
        } catch (error) {
            console.error("[CipherGap] Encrypt failed:", error);
            show_ciphergap_notice(
                "Message not sent because encryption failed. Please try again.",
                "error",
                7000
            );
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.setAttribute("aria-label", "Encrypt and send with CipherGap");
            button.innerText = "Encrypt";
        }
    });
    buttonContainer.insertBefore(button, sendSlot);
}

// =========================
// Encrypted packet helpers
// =========================

function is_ciphergap_packet(text) {
    return Boolean(text?.trim().startsWith("CGP|"));
}

function find_cgp_span(messageElement) {
    return get_deepest_matching_payload(messageElement, (text) => {
        const normalized = normalize_message_text(text);
        return is_ciphergap_packet(normalized) ? { normalized } : null;
    })?.element ?? null;
}

function extract_cgp_packet_text(messageElement) {
    const span = find_cgp_span(messageElement);
    if (!span) {
        return "";
    }

    let text = normalize_message_text(span.textContent ?? "");

    if (text.includes("---")) {
        text = text.split("---")[0].trim();
    }

    return is_ciphergap_packet(text) ? text : "";
}

function replace_message_visual(messageElement, encryptedText, decryptedText) {
    const span = find_cgp_span(messageElement);
    if (!span) {
        return;
    }

    span.textContent = "";

    const plaintext = document.createElement("span");
    plaintext.className = "ciphergap-plaintext";
    plaintext.dir = "auto";
    plaintext.style.display = "block";
    plaintext.style.whiteSpace = "pre-wrap";
    plaintext.textContent = decryptedText;

    const encryptedDetails = document.createElement("details");
    encryptedDetails.className = "ciphergap-encrypted-details";
    encryptedDetails.style.marginTop = "6px";
    encryptedDetails.style.fontSize = "11px";
    encryptedDetails.style.opacity = "0.72";

    const summary = document.createElement("summary");
    summary.textContent = "Encrypted message";
    summary.style.cursor = "pointer";

    const ciphertext = document.createElement("code");
    ciphertext.dir = "ltr";
    ciphertext.style.display = "block";
    ciphertext.style.marginTop = "4px";
    ciphertext.style.whiteSpace = "pre-wrap";
    ciphertext.style.overflowWrap = "anywhere";
    ciphertext.textContent = encryptedText;

    encryptedDetails.appendChild(summary);
    encryptedDetails.appendChild(ciphertext);
    span.appendChild(plaintext);
    span.appendChild(encryptedDetails);
}

function create_decrypt_button() {
    const button = document.createElement("button");
    button.className = "ciphergap-action ciphergap-decrypt-button";
    button.type = "button";
    button.innerText = "Decrypt";
    button.setAttribute("aria-label", "Decrypt this CipherGap message");
    Object.assign(button.style, {
        display: "block",
        marginTop: "6px",
        padding: "7px 12px",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "650",
        background: "#16a34a",
        color: "white",
        position: "relative",
        zIndex: "10",
        pointerEvents: "auto"
    });
    return button;
}

function attach_decrypt_button(messageElement, decryptButton) {
    const cgpSpan = find_cgp_span(messageElement);
    const container = cgpSpan?.parentElement ?? messageElement;

    const wrapper = document.createElement("div");
    wrapper.className = "ciphergap-decrypt-wrap";
    wrapper.style.pointerEvents = "auto";
    wrapper.appendChild(decryptButton);
    container.appendChild(wrapper);
}

async function handle_decrypt_click(event, messageElement, decryptButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
        decryptButton.disabled = true;
        decryptButton.setAttribute("aria-busy", "true");
        await refresh_cg_chat_cache();
        await decrypt_message_element(
            messageElement,
            cg_cached_key,
            cg_cached_message_key
        );
        decryptButton.remove();
    } catch (error) {
        console.error("[CipherGap] Decrypt failed:", error);
        decryptButton.innerText = "Try again";
        show_ciphergap_notice(
            "Could not decrypt this message. Check the chat key and try again.",
            "error",
            7000
        );
    } finally {
        decryptButton.disabled = false;
        decryptButton.removeAttribute("aria-busy");
    }
}

// Core decryption routine shared by manual click and auto-decrypt.
// Returns true on success, throws on failure.
async function decrypt_message_element(
    messageElement,
    providedSecretKey = null,
    cachedCryptoKey = null
) {
    const currentText = extract_cgp_packet_text(messageElement);
    if (!is_ciphergap_packet(currentText)) {
        throw new Error("Could not read encrypted message from this bubble.");
    }

    const secretKey = providedSecretKey ?? await get_secret_key();
    if (!secretKey) {
        throw new Error("No encryption key set for this chat.");
    }

    const packet = parse_ciphergap_packet(currentText);
    if (!packet?.data) {
        throw new Error("Invalid CipherGap packet format.");
    }

    const decryptedText = await decrypt_message(
        packet.data,
        secretKey,
        cachedCryptoKey
    );
    replace_message_visual(messageElement, currentText, decryptedText);
    messageElement.dataset.ciphergapDecrypted = "true";
    return true;
}

const bale_decrypt_queue = [];
const bale_decrypt_queued = new WeakSet();
let bale_decrypt_worker_running = false;

function wait_for_main_thread() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function queue_bale_message_decryption(messageElement, storageKey = get_storage_key()) {
    if (
        bale_decrypt_queued.has(messageElement) ||
        messageElement.dataset.ciphergapDecrypted === "true"
    ) {
        return;
    }

    bale_decrypt_queued.add(messageElement);
    bale_decrypt_queue.push({ messageElement, storageKey });
    drain_bale_decrypt_queue().catch((error) => {
        console.error("[CipherGap] Decrypt queue failed:", error);
    });
}

async function drain_bale_decrypt_queue() {
    if (bale_decrypt_worker_running) {
        return;
    }

    bale_decrypt_worker_running = true;
    try {
        while (bale_decrypt_queue.length > 0) {
            const { messageElement, storageKey } = bale_decrypt_queue.shift();
            try {
                if (
                    !messageElement.isConnected ||
                    storageKey !== get_storage_key() ||
                    messageElement.dataset.ciphergapDecrypted === "true"
                ) {
                    continue;
                }

                await refresh_cg_chat_cache();
                if (
                    cg_cached_storage_key !== storageKey ||
                    !cg_cached_key
                ) {
                    throw new Error("No encryption key set for this chat.");
                }

                await decrypt_message_element(
                    messageElement,
                    cg_cached_key,
                    cg_cached_message_key
                );
                messageElement.querySelector(".ciphergap-decrypt-wrap")?.remove();
            } catch (error) {
                console.warn("[CipherGap] Auto-decrypt failed, falling back to button:", error);
                if (messageElement.isConnected && storageKey === get_storage_key()) {
                    attach_decrypt_button_to(messageElement);
                }
            } finally {
                bale_decrypt_queued.delete(messageElement);
            }

            // Keep large chat restores responsive instead of starting every
            // WebCrypto operation in the same task.
            await wait_for_main_thread();
        }
    } finally {
        bale_decrypt_worker_running = false;
        if (bale_decrypt_queue.length > 0) {
            drain_bale_decrypt_queue().catch(() => {});
        }
    }
}

function process_encrypted_bale_message(messageElement) {
    if (messageElement.dataset.ciphergapProcessed) {
        return;
    }

    const text = extract_cgp_packet_text(messageElement);
    if (!is_ciphergap_packet(text) || messageElement.dataset.ciphergapDecrypted === "true") {
        return;
    }

    messageElement.dataset.ciphergapProcessed = "true";
    const messageStorageKey = get_storage_key();

    // All messages share one in-flight cache refresh, avoiding one storage
    // read and one key import per bubble during the initial scan.
    refresh_cg_chat_cache().then(() => {
        if (
            !messageElement.isConnected ||
            messageStorageKey !== get_storage_key()
        ) {
            delete messageElement.dataset.ciphergapProcessed;
            return;
        }

        if (cg_cached_auto_decrypt && cg_cached_key) {
            queue_bale_message_decryption(messageElement, messageStorageKey);
        } else {
            attach_decrypt_button_to(messageElement);
        }
    }).catch((error) => {
        console.warn("[CipherGap] Could not load decrypt settings:", error);
        if (messageElement.isConnected && messageStorageKey === get_storage_key()) {
            attach_decrypt_button_to(messageElement);
        }
    });
}

// Creates and attaches a manual Decrypt button to a message element.
function attach_decrypt_button_to(messageElement) {
    if (
        messageElement.dataset.ciphergapDecrypted === "true" ||
        messageElement.querySelector(".ciphergap-decrypt-wrap")
    ) {
        return;
    }

    const decryptButton = create_decrypt_button();

    decryptButton.addEventListener(
        "click",
        (event) => handle_decrypt_click(event, messageElement, decryptButton),
        true
    );
    decryptButton.addEventListener(
        "mousedown",
        (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
        },
        true
    );

    try {
        attach_decrypt_button(messageElement, decryptButton);
    } catch (error) {
        console.error("[CipherGap] Failed to attach decrypt button:", error);
    }
}

// When auto-decrypt is enabled, immediately decrypt all currently-visible
// encrypted messages that haven't been decrypted yet.
async function auto_decrypt_visible_messages() {
    const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
    if (!scroller) {
        return;
    }

    await refresh_cg_chat_cache(true);
    if (!cg_cached_key) {
        return;
    }

    const messageElements = Array.from(scroller.querySelectorAll(BALE_MESSAGE_ITEM));
    for (let index = 0; index < messageElements.length; index += 1) {
        const messageElement = messageElements[index];
        if (
            messageElement.dataset.ciphergapDecrypted === "true" ||
            !bind_bale_message_to_storage(
                messageElement,
                cg_cached_storage_key
            )
        ) {
            continue;
        }
        const text = extract_cgp_packet_text(messageElement);
        if (!is_ciphergap_packet(text)) {
            continue;
        }

        queue_bale_message_decryption(messageElement, cg_cached_storage_key);
        if ((index + 1) % 25 === 0) {
            await wait_for_main_thread();
        }
    }
}

// =========================
// Encrypted file detection (receiving side)
// =========================

// Return the deepest filename/carrier that mentions a .cgpe attachment.
function find_cgpe_file_in_message(messageElement) {
    if (!(messageElement.textContent ?? "").toLowerCase().includes(".cgpe")) {
        return null;
    }

    return get_deepest_matching_payload(messageElement, (text) => {
        const normalized = normalize_message_text(text);
        return normalized.toLowerCase().includes(".cgpe")
            ? { normalized }
            : null;
    });
}

// Create a "Decrypt File" button for encrypted file attachments.
function create_file_decrypt_button() {
    const button = document.createElement("button");
    button.className = "ciphergap-action ciphergap-file-decrypt-button";
    button.type = "button";
    button.innerText = "Decrypt file";
    button.setAttribute("aria-label", "Choose and decrypt this CipherGap file");
    Object.assign(button.style, {
        display: "block",
        marginTop: "6px",
        padding: "6px 12px",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "600",
        background: "#2563eb",
        color: "white",
        position: "relative",
        zIndex: "10",
        pointerEvents: "auto"
    });
    return button;
}

// Trigger a browser download of a decrypted file (Blob → download).
function download_decrypted_file(decrypted) {
    const blob = new Blob([decrypted.data], { type: decrypted.type });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = decrypted.name;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

// Decrypt a CGPE file from a Blob/ArrayBuffer and trigger download.
async function decrypt_and_download_file(
    encryptedBuffer,
    secretKey,
    statusButton,
    fileCryptoKey = null
) {
    const decrypted = await decrypt_cgpe(encryptedBuffer, secretKey, fileCryptoKey);
    download_decrypted_file(decrypted);
    if (statusButton) {
        statusButton.innerText = "Downloaded";
        statusButton.setAttribute("aria-label", "CipherGap file decrypted");
        statusButton.dataset.state = "success";
    }
    show_ciphergap_notice(`${decrypted.name} was decrypted and downloaded.`, "success");
}

// Primary decrypt path: open a hidden file picker so the user can select
// the .cgpe file they downloaded via Bale's own دانلود button.
function handle_file_decrypt_click(event, messageElement, decryptButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".cgpe,application/octet-stream";
    fileInput.style.display = "none";
    fileInput.dataset[CIPHERGAP_INTERNAL_FILE_INPUT] = "true";
    fileInput.setAttribute("aria-hidden", "true");

    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            return;
        }

        try {
            decryptButton.disabled = true;
            decryptButton.innerText = "Decrypting…";
            delete decryptButton.dataset.state;
            decryptButton.setAttribute("aria-busy", "true");
            decryptButton.setAttribute("aria-label", "Decrypting CipherGap file");

            await refresh_cg_chat_cache();
            const secretKey = cg_cached_key;
            if (!secretKey) {
                throw new Error("No encryption key set for this chat.\nSet a key or exchange keys first.");
            }

            const maxContainerBytes =
                CGPE_MAX_FILE_BYTES +
                4 + 1 + 4 + CGPE_MAX_FILENAME_BYTES +
                4 + CGPE_MAX_MIME_BYTES + 12 + CGPE_GCM_TAG_BYTES;
            if (file.size > maxContainerBytes) {
                throw new Error("This encrypted file exceeds CipherGap's 100 MB safety limit.");
            }

            const encryptedBuffer = await file.arrayBuffer();
            await decrypt_and_download_file(
                encryptedBuffer,
                secretKey,
                decryptButton,
                cg_cached_message_key
            );
        } catch (error) {
            console.error("[CipherGap] File decrypt failed:", error);
            decryptButton.innerText = "Try again";
            decryptButton.setAttribute("aria-label", "CipherGap file decryption failed");
            decryptButton.dataset.state = "error";
            show_ciphergap_notice(
                `File decryption failed: ${error.message}`,
                "error",
                7000
            );
        } finally {
            decryptButton.disabled = false;
            decryptButton.removeAttribute("aria-busy");
            fileInput.remove();
        }
    }, { once: true });

    document.body.appendChild(fileInput);
    fileInput.click();
    // Clean up the hidden input shortly after
    setTimeout(() => fileInput.remove(), 60000);
}

// Attach a Decrypt File button next to the filename inside Bale's bubble.
function attach_file_decrypt_button(messageElement, filePayload) {
    if (!filePayload?.element?.parentElement) {
        return;
    }

    const signature = `cgpe:${filePayload.normalized}`;
    if (
        messageElement.dataset.ciphergapFileSignature === signature &&
        messageElement.querySelector('[data-ciphergap-ui="file-action"]')
    ) {
        return;
    }

    messageElement.querySelector('[data-ciphergap-ui="file-action"]')?.remove();
    messageElement.dataset.ciphergapFileSignature = signature;

    const decryptButton = create_file_decrypt_button();

    decryptButton.addEventListener(
        "click",
        (event) => handle_file_decrypt_click(event, messageElement, decryptButton),
        true
    );
    decryptButton.addEventListener(
        "mousedown",
        (event) => {
            event.stopPropagation();
            event.stopImmediatePropagation();
        },
        true
    );

    // Add a small instruction text above the button
    const hint = document.createElement("span");
    hint.className = "ciphergap-file-decrypt-hint";
    hint.innerText = "Download the .cgpe attachment from Bale, then choose it here.";
    hint.dir = "auto";

    const wrapper = document.createElement("span");
    wrapper.className = "ciphergap-file-decrypt-wrap";
    wrapper.dataset.ciphergapUi = "file-action";
    wrapper.appendChild(hint);
    wrapper.appendChild(decryptButton);

    // The filename carrier gives us a semantic in-bubble anchor and avoids
    // Bale's generated class names and fragile parent-count traversal.
    const interactiveAttachment = filePayload.element.closest("a, button");
    const mountAnchor = interactiveAttachment && messageElement.contains(interactiveAttachment)
        ? interactiveAttachment
        : filePayload.element;
    mountAnchor.insertAdjacentElement("afterend", wrapper);
}

// Scan a message element for .cgpe encrypted file attachments.
function process_cgpe_file_message(messageElement) {
    const filePayload = find_cgpe_file_in_message(messageElement);
    if (filePayload) {
        attach_file_decrypt_button(messageElement, filePayload);
        return;
    }

    messageElement.querySelector('[data-ciphergap-ui="file-action"]')?.remove();
    delete messageElement.dataset.ciphergapFileSignature;
}

// =========================
// Hide exchange protocol messages
// =========================

function create_chat_card_heading(title) {
    const heading = document.createElement("span");
    heading.className = "ciphergap-chat-card__heading";

    const mark = document.createElement("span");
    mark.className = "ciphergap-chat-card__mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "CG";

    const titleElement = document.createElement("span");
    titleElement.textContent = title;

    heading.append(mark, titleElement);
    return heading;
}

function create_exchange_chat_card(parsed, signature) {
    const isStart = parsed.type === "start";
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--exchange";
    card.dataset.ciphergapUi = "protocol";
    card.dataset.ciphergapProtocolKind = parsed.type;
    card.dataset.ciphergapProtocolSignature = signature;
    card.appendChild(create_chat_card_heading(
        isStart ? "Key exchange request" : "Key exchange response"
    ));

    const meta = document.createElement("span");
    meta.className = "ciphergap-chat-card__meta";
    meta.textContent = isStart
        ? "Open CipherGap to review this request."
        : "Open CipherGap to verify the code.";
    card.appendChild(meta);
    return card;
}

function create_sas_chat_card(parsed, signature) {
    const card = document.createElement("span");
    card.className = "ciphergap-chat-card ciphergap-chat-card--sas";
    card.dataset.ciphergapUi = "protocol";
    card.dataset.ciphergapProtocolKind = "sas";
    card.dataset.ciphergapProtocolSignature = signature;
    card.setAttribute("role", "group");
    card.appendChild(create_chat_card_heading("Verification code"));

    const code = document.createElement("span");
    code.className = "ciphergap-chat-card__code";
    code.dir = "ltr";
    code.setAttribute("aria-label", parsed.sas.split("").join(" "));
    code.textContent = `${parsed.sas.slice(0, 3)} ${parsed.sas.slice(3)}`;
    card.appendChild(code);

    const compareHint = document.createElement("span");
    compareHint.className = "ciphergap-chat-card__meta";
    compareHint.textContent = "Compare this code in CipherGap.";
    card.appendChild(compareHint);

    const fingerprint = document.createElement("span");
    fingerprint.className = "ciphergap-chat-card__meta";
    fingerprint.dir = "ltr";
    fingerprint.textContent =
        `Key fingerprint · ${parsed.fingerprint.slice(0, 4)} ${parsed.fingerprint.slice(4)}`;
    card.appendChild(fingerprint);
    return card;
}

function clear_legacy_protocol_row_styles(messageElement) {
    const border = messageElement.style.borderInlineStart;
    if (border.includes("34, 197, 94") || border.includes("#22c55e")) {
        messageElement.style.removeProperty("border-inline-start");
    }
    if (messageElement.style.paddingInlineStart === "10px") {
        messageElement.style.removeProperty("padding-inline-start");
    }
}

function hide_exchange_protocol_message(messageElement, payload) {
    const { element: rawPayload, parsed, signature } = payload;
    if (!rawPayload?.parentElement) {
        return false;
    }

    clear_legacy_protocol_row_styles(messageElement);
    rawPayload.hidden = true;
    rawPayload.setAttribute("aria-hidden", "true");
    rawPayload.dataset.ciphergapProtocolRaw = "true";

    // Remove components created by the previous outer-row renderer if the
    // page is upgraded without a full navigation.
    messageElement.querySelectorAll(
        ".ciphergap-exchange-notice, .ciphergap-sas-display"
    ).forEach((legacyCard) => legacyCard.remove());

    const existingCards = messageElement.querySelectorAll(
        '[data-ciphergap-ui="protocol"]'
    );
    for (const existing of existingCards) {
        if (existing.dataset.ciphergapProtocolSignature !== signature) {
            existing.remove();
        }
    }

    let card = [...existingCards].find(
        (existing) =>
            existing.dataset.ciphergapProtocolSignature === signature
    );
    if (!card) {
        card = parsed.type === "sas"
            ? create_sas_chat_card(parsed, signature)
            : create_exchange_chat_card(parsed, signature);
    }

    // The raw payload's parent is Bale's real text container. Mounting here
    // keeps the card inside the native bubble without generated class names.
    if (card.parentElement !== rawPayload.parentElement || card.previousElementSibling !== rawPayload) {
        rawPayload.insertAdjacentElement("afterend", card);
    }
    return true;
}

function clear_stale_protocol_ui(messageElement) {
    messageElement.querySelectorAll('[data-ciphergap-ui="protocol"]')
        .forEach((card) => card.remove());
    messageElement.querySelectorAll('[data-ciphergap-protocol-raw="true"]')
        .forEach((rawPayload) => {
            rawPayload.hidden = false;
            rawPayload.removeAttribute("aria-hidden");
            delete rawPayload.dataset.ciphergapProtocolRaw;
        });
    delete messageElement.dataset.ciphergapExchangeHandled;
    clear_legacy_protocol_row_styles(messageElement);
}

function process_bale_message(
    messageElement,
    expectedStorageKey = get_storage_key()
) {
    if (
        !messageElement?.matches?.(BALE_MESSAGE_ITEM) ||
        !get_chat_id_from_url() ||
        expectedStorageKey !== get_storage_key() ||
        !bind_bale_message_to_storage(messageElement, expectedStorageKey)
    ) {
        return;
    }

    // Check for encrypted file attachments (.cgpe)
    process_cgpe_file_message(messageElement);

    const protocolPayload = find_exchange_protocol_payload(messageElement);
    if (protocolPayload) {
        hide_exchange_protocol_message(messageElement, protocolPayload);

        if (
            messageElement.dataset.ciphergapExchangeHandled !==
            protocolPayload.signature
        ) {
            messageElement.dataset.ciphergapExchangeHandled =
                protocolPayload.signature;
            handle_incoming_exchange_message(protocolPayload.protocolText)
                .catch((error) => {
                    if (
                        messageElement.dataset.ciphergapExchangeHandled ===
                        protocolPayload.signature
                    ) {
                        delete messageElement.dataset.ciphergapExchangeHandled;
                    }
                    console.warn(
                        "[CipherGap] Ignored an invalid key exchange message:",
                        error
                    );
                });
        }
        return;
    }

    clear_stale_protocol_ui(messageElement);

    const text = extract_bale_message_text(messageElement);
    if (!text) {
        return;
    }

    if (is_ciphergap_packet(text)) {
        process_encrypted_bale_message(messageElement);
    }
}

let bale_lifecycle_started = false;
let bale_lifecycle_observer = null;
let bale_lifecycle_timer = null;
let bale_message_observer = null;
let bale_observed_scroller = null;
let bale_observed_chat_input = null;
let bale_active_storage_key = null;
let bale_scan_generation = 0;
const BALE_MESSAGE_BINDING_LIMIT = 10000;
const bale_message_storage_bindings = new Map();
const bale_message_processing_queue = new Map();
let bale_message_processing_frame = null;
let bale_message_processing_timer = null;

function bind_bale_message_to_storage(messageElement, storageKey) {
    const sid = messageElement.getAttribute("data-sid");
    if (!sid || !storageKey) {
        return false;
    }

    const knownStorageKey = bale_message_storage_bindings.get(sid);
    if (knownStorageKey) {
        return knownStorageKey === storageKey;
    }

    bale_message_storage_bindings.set(sid, storageKey);
    if (bale_message_storage_bindings.size > BALE_MESSAGE_BINDING_LIMIT) {
        const oldestSid = bale_message_storage_bindings.keys().next().value;
        bale_message_storage_bindings.delete(oldestSid);
    }
    return true;
}

function flush_bale_message_processing_queue() {
    if (bale_message_processing_frame !== null) {
        cancelAnimationFrame(bale_message_processing_frame);
        bale_message_processing_frame = null;
    }
    if (bale_message_processing_timer !== null) {
        clearTimeout(bale_message_processing_timer);
        bale_message_processing_timer = null;
    }

    const queuedMessages = [...bale_message_processing_queue.entries()];
    bale_message_processing_queue.clear();
    queuedMessages.forEach(([messageElement, storageKey]) => {
        if (
            storageKey === get_storage_key() &&
            messageElement.isConnected &&
            messageElement.closest(BALE_MESSAGE_SCROLLER) === bale_observed_scroller &&
            bind_bale_message_to_storage(messageElement, storageKey)
        ) {
            process_bale_message(messageElement, storageKey);
        }
    });
}

function schedule_bale_message_processing(
    messageElement,
    storageKey = get_storage_key()
) {
    if (
        !messageElement?.matches?.(BALE_MESSAGE_ITEM) ||
        !get_chat_id_from_url() ||
        storageKey !== get_storage_key() ||
        !bind_bale_message_to_storage(messageElement, storageKey)
    ) {
        return;
    }

    bale_message_processing_queue.set(messageElement, storageKey);
    if (bale_message_processing_frame === null) {
        // Run just before paint so a raw protocol payload does not flash while
        // still allowing Bale's incremental React render to finish first.
        bale_message_processing_frame = requestAnimationFrame(
            flush_bale_message_processing_queue
        );
        // requestAnimationFrame pauses in a background tab; keep a timer as a
        // fallback so messages are ready when that tab becomes visible again.
        bale_message_processing_timer = setTimeout(
            flush_bale_message_processing_queue,
            100
        );
    }
}

function schedule_messages_from_node(node, storageKey = get_storage_key()) {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element || is_ciphergap_ui_element(element)) {
        return;
    }

    schedule_bale_message_processing(
        element.closest(BALE_MESSAGE_ITEM),
        storageKey
    );
    if (element.matches(BALE_MESSAGE_ITEM)) {
        schedule_bale_message_processing(element, storageKey);
    }
    element.querySelectorAll?.(BALE_MESSAGE_ITEM)
        .forEach((messageElement) =>
            schedule_bale_message_processing(messageElement, storageKey)
        );
}

async function scan_bale_messages(
    scroller,
    scanGeneration,
    storageKey = get_storage_key()
) {
    // Bale normally opens at the newest messages. Bind/process those first so
    // a rapid chat switch cannot leave the visible rows unassociated.
    const messageElements = Array.from(
        scroller.querySelectorAll(BALE_MESSAGE_ITEM)
    ).reverse();

    if (
        !get_chat_id_from_url() ||
        storageKey !== get_storage_key() ||
        scanGeneration !== bale_scan_generation ||
        scroller !== bale_observed_scroller ||
        !scroller.isConnected
    ) {
        return;
    }

    // Bind every discovered row before the first yield. Even if the user
    // switches chats between batches, an unprocessed old row cannot later be
    // mistaken for a message from the new storage key.
    [...messageElements].reverse().forEach((messageElement) => {
        bind_bale_message_to_storage(messageElement, storageKey);
    });

    for (let index = 0; index < messageElements.length; index += 25) {
        if (
            scanGeneration !== bale_scan_generation ||
            scroller !== bale_observed_scroller ||
            !scroller.isConnected ||
            storageKey !== get_storage_key()
        ) {
            return;
        }

        messageElements
            .slice(index, index + 25)
            .forEach((messageElement) =>
                process_bale_message(messageElement, storageKey)
            );
        await wait_for_main_thread();
    }
}

function observe_current_bale_scroller(scroller) {
    bale_message_observer?.disconnect();
    bale_message_observer = null;
    bale_observed_scroller = scroller;
    bale_scan_generation += 1;

    if (!scroller) {
        return;
    }

    bale_message_observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (is_ciphergap_ui_element(
                mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement
            )) {
                continue;
            }

            if (mutation.type === "characterData") {
                schedule_messages_from_node(mutation.target);
                continue;
            }

            if (mutation.type === "attributes") {
                schedule_messages_from_node(mutation.target);
                continue;
            }

            if (mutation.removedNodes.length > 0) {
                const targetElement = mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement;
                schedule_bale_message_processing(
                    targetElement?.closest?.(BALE_MESSAGE_ITEM)
                );
            }

            for (const node of mutation.addedNodes) {
                schedule_messages_from_node(node);
            }
        }
    });

    bale_message_observer.observe(scroller, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-sid", "aria-label"]
    });
    const scanGeneration = bale_scan_generation;
    // Protocol cards do not need the chat key, so scan immediately instead of
    // leaving raw public-key payloads visible while storage/WebCrypto resolve.
    scan_bale_messages(scroller, scanGeneration).catch(() => {});
    refresh_cg_chat_cache().catch(() => {});
}

function observe_current_bale_input(chatInput) {
    if (chatInput === bale_observed_chat_input) {
        return;
    }

    if (bale_observed_chat_input) {
        bale_observed_chat_input.removeEventListener("input", sanitize_bale_input);
        bale_observed_chat_input.removeEventListener("focus", sanitize_bale_input);
    }

    bale_observed_chat_input = chatInput;
    if (!chatInput) {
        return;
    }

    chatInput.dataset.ciphergapSanitized = "true";
    chatInput.addEventListener("input", sanitize_bale_input);
    chatInput.addEventListener("focus", sanitize_bale_input);
}

function reconcile_bale_lifecycle() {
    bale_lifecycle_timer = null;
    if (!IS_BALE_HOST) {
        return;
    }

    const storageKey = get_storage_key();
    const chatChanged = storageKey !== bale_active_storage_key;
    if (chatChanged) {
        bale_active_storage_key = storageKey;
        invalidate_cg_chat_cache(storageKey);
        refresh_cg_chat_cache().catch(() => {});
        cleanup_stale_exchange_status(storageKey).catch(() => {});
    }

    inject_encrypt_button_bale();

    const chatInput = document.querySelector(BALE_CHAT_INPUT);
    observe_current_bale_input(chatInput);

    const scroller = document.querySelector(BALE_MESSAGE_SCROLLER);
    if (scroller !== bale_observed_scroller) {
        observe_current_bale_scroller(scroller);
    } else if (chatChanged && scroller) {
        const scanGeneration = ++bale_scan_generation;
        scan_bale_messages(scroller, scanGeneration).catch(() => {});
        refresh_cg_chat_cache().catch(() => {});
    }
}

function queue_bale_lifecycle_reconcile() {
    if (bale_lifecycle_timer !== null) {
        return;
    }

    bale_lifecycle_timer = setTimeout(reconcile_bale_lifecycle, 50);
}

function node_may_change_bale_lifecycle(node) {
    if (!(node instanceof Element)) {
        return false;
    }

    return node.matches(BALE_LIFECYCLE_SELECTOR) ||
        Boolean(node.querySelector(BALE_LIFECYCLE_SELECTOR));
}

function start_bale_lifecycle() {
    if (!IS_BALE_HOST || bale_lifecycle_started) {
        return;
    }
    bale_lifecycle_started = true;
    inject_ciphergap_content_styles();

    document.querySelectorAll('input[type="file"]').forEach(intercept_file_selection);

    bale_lifecycle_observer = new MutationObserver((mutations) => {
        let shouldReconcile = get_storage_key() !== bale_active_storage_key;

        for (const mutation of mutations) {
            mutation.addedNodes.forEach((node) => {
                hook_file_inputs_in_node(node);
                shouldReconcile ||= node_may_change_bale_lifecycle(node);
            });
            shouldReconcile ||= [...mutation.removedNodes]
                .some(node_may_change_bale_lifecycle);
            shouldReconcile ||= mutation.target instanceof Element &&
                Boolean(mutation.target.closest("#chat_footer"));
        }

        if (shouldReconcile) {
            queue_bale_lifecycle_reconcile();
        }
    });
    bale_lifecycle_observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", queue_bale_lifecycle_reconcile);
    window.addEventListener("hashchange", queue_bale_lifecycle_reconcile);
    reconcile_bale_lifecycle();
}

const bale_adapter = {
    hostnames: ["web.bale.ai"],

    is_active() {
        return (
            window.location.hostname === "web.bale.ai" &&
            Boolean(document.querySelector(BALE_CHAT_INPUT))
        );
    },

    is_in_chat() {
        return Boolean(new URL(window.location.href).searchParams.get("uid"));
    },

    get_chat_storage_suffix(url) {
        return url.searchParams.get("uid");
    },

    send_message: bale_send_message,
    extract_message_text: extract_bale_message_text,
    inject_ui: inject_encrypt_button_bale,
    observe_messages: start_bale_lifecycle
};

register_messenger_adapter("bale", bale_adapter);
if (IS_BALE_HOST) {
    start_bale_lifecycle();
}

// Listen for auto-decrypt toggle from the popup so we can immediately
// decrypt all visible messages when the user enables the feature.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "auto_decrypt_sweep") {
        auto_decrypt_visible_messages()
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (message.action === "clear_input") {
        // Clear any lingering exchange/SAS text from the chat input.
        try {
            const cleared = clear_bale_input();
            sendResponse({ ok: true, cleared });
        } catch (err) {
            sendResponse({ ok: false, error: err.message });
        }
        return false;
    }
});
