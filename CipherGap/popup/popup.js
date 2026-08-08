// popup.js

const BALE_HOST = "web.bale.ai";
const EXCHANGE_STATUS_EXPIRY_MS = 10 * 60 * 1000;
const EXCHANGE_WAIT_TIMEOUT_MS = 60 * 1000;
const MASKED_KEY = "••••••••••••••••";

const versionNumber = document.getElementById("versionNumber");
const messengerCards = document.querySelectorAll(".messenger-card");
const baleStatus = document.getElementById("baleStatus");
const siteNameEl = document.getElementById("siteName");
const chatHint = document.getElementById("chatHint");
const contextBadge = document.getElementById("contextBadge");
const statusEl = document.getElementById("status");
const statusIcon = document.getElementById("statusIcon");
const statusText = document.getElementById("statusText");

const keyStateCard = document.getElementById("keyStateCard");
const keyTrustBadge = document.getElementById("keyTrustBadge");
const keyTrustDescription = document.getElementById("keyTrustDescription");
const fingerprintGroup = document.getElementById("fingerprintGroup");
const currentFingerprint = document.getElementById("currentFingerprint");
const oldFingerprint = document.getElementById("oldFingerprint");
const keyMaterial = document.getElementById("keyMaterial");
const savedKeyEl = document.getElementById("savedKey");
const revealKeyBtn = document.getElementById("revealKeyBtn");
const copyKeyBtn = document.getElementById("copyKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");

const incomingPanel = document.getElementById("incomingPanel");
const incomingFingerprint = document.getElementById("incomingFingerprint");
const acceptExchangeBtn = document.getElementById("acceptExchangeBtn");
const declineExchangeBtn = document.getElementById("declineExchangeBtn");

const sasPanel = document.getElementById("sasPanel");
const sasCode = document.getElementById("sasCode");
const sasFingerprint = document.getElementById("sasFingerprint");
const sasWarning = document.getElementById("sasWarning");
const sasVerifiedBtn = document.getElementById("sasVerifiedBtn");
const sasDismissBtn = document.getElementById("sasDismissBtn");

const staleWarning = document.getElementById("staleWarning");
const staleDismissBtn = document.getElementById("staleDismissBtn");

const setupDescription = document.getElementById("setupDescription");
const exchangeBtn = document.getElementById("exchangeBtn");
const cancelExchangeBtn = document.getElementById("cancelExchangeBtn");
const manualKeyDetails = document.getElementById("manualKeyDetails");
const manualKeyForm = document.getElementById("manualKeyForm");
const secretKeyInput = document.getElementById("secretKey");
const saveBtn = document.getElementById("saveBtn");
const autoDecryptToggle = document.getElementById("autoDecryptToggle");

const confirmationDialog = document.getElementById("confirmationDialog");
const confirmationTitle = document.getElementById("confirmationTitle");
const confirmationMessage = document.getElementById("confirmationMessage");
const confirmationActionBtn = document.getElementById("confirmationActionBtn");
const confirmationCancelBtn = document.getElementById("confirmationCancelBtn");

let currentHostname = null;
let currentChatId = null;
let storageKey = null;
let activeTabId = null;
let currentSecretKey = "";
let currentTrust = null;
let currentExchangeStatus = null;
let isKeyRevealed = false;
let dismissedSasNonce = null;
let cancelledExchangeNonce = null;
let storageListenerRegistered = false;

function get_trust_storage_key() {
    return storageKey ? `key_trust_${storageKey}` : null;
}

function get_exchange_storage_key() {
    return storageKey ? `exchange_status_${storageKey}` : null;
}

function can_manage_chat() {
    return Boolean(
        currentHostname === BALE_HOST &&
        currentChatId &&
        storageKey &&
        Number.isInteger(activeTabId)
    );
}

function get_error_message(error, fallback) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error) {
        return error;
    }
    return fallback;
}

function create_cancelled_exchange_error() {
    const error = new Error("The key exchange was cancelled.");
    error.name = "AbortError";
    return error;
}

function set_status(message, tone = "neutral") {
    const icons = {
        neutral: "•",
        progress: "…",
        success: "✓",
        warning: "!",
        error: "×"
    };

    statusEl.dataset.tone = tone;
    statusIcon.textContent = icons[tone] ?? icons.neutral;
    statusText.textContent = message;
}

function set_button_busy(button, busy) {
    if (busy) {
        button.setAttribute("aria-busy", "true");
        button.disabled = true;
        return;
    }

    button.removeAttribute("aria-busy");
}

function render_manifest_version() {
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version_name || manifest.version;
    versionNumber.textContent = `v${version}`;
    versionNumber.setAttribute("aria-label", `CipherGap version ${version}`);
}

function update_messenger_cards() {
    messengerCards.forEach((card) => {
        const messenger = card.dataset.messenger;
        const isCurrent = messenger === "bale" && currentHostname === BALE_HOST;

        card.classList.toggle("current", isCurrent);

        if (isCurrent) {
            card.setAttribute("aria-current", "true");
        } else {
            card.removeAttribute("aria-current");
        }
    });

    if (currentHostname === BALE_HOST && currentChatId) {
        baleStatus.textContent = "Ready";
    } else if (currentHostname === BALE_HOST) {
        baleStatus.textContent = "Open a chat";
    } else {
        baleStatus.textContent = "Supported";
    }
}

function update_current_chat_ui() {
    update_messenger_cards();

    if (can_manage_chat()) {
        siteNameEl.textContent = `Bale • Chat ${currentChatId}`;
        chatHint.textContent = "Keys and auto-decrypt settings apply only to this conversation.";
        contextBadge.textContent = "Ready";
        contextBadge.dataset.tone = "ready";
        return;
    }

    if (currentHostname === BALE_HOST) {
        siteNameEl.textContent = "Bale • No chat selected";
        chatHint.textContent = "Open a conversation in Bale, then reopen CipherGap.";
        contextBadge.textContent = "Choose chat";
        contextBadge.dataset.tone = "warning";
        return;
    }

    siteNameEl.textContent = currentHostname || "Unsupported browser page";
    chatHint.textContent = "CipherGap currently works only in an open Bale web chat.";
    contextBadge.textContent = "Unsupported";
    contextBadge.dataset.tone = "warning";
}

function get_effective_trust_state() {
    if (!currentSecretKey) {
        return "none";
    }

    // Explicit SAS verification is authoritative, including when the user has
    // approved a previously-changed TOFU fingerprint.
    if (currentTrust?.state === "verified") {
        return "verified";
    }

    if (currentTrust?.state === "changed" || currentExchangeStatus?.fingerprintWarning) {
        return "changed";
    }

    if (currentTrust?.state === "unverified") {
        return currentTrust.state;
    }

    return "unverified";
}

function format_verified_date(timestamp) {
    if (!Number.isFinite(timestamp)) {
        return "";
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(new Date(timestamp));
}

function render_key_material() {
    const hasKey = Boolean(currentSecretKey);
    keyMaterial.hidden = !hasKey;

    if (!hasKey) {
        savedKeyEl.textContent = "";
        savedKeyEl.setAttribute("aria-label", "No encryption key saved");
        revealKeyBtn.textContent = "Reveal";
        revealKeyBtn.setAttribute("aria-pressed", "false");
        return;
    }

    savedKeyEl.textContent = isKeyRevealed ? currentSecretKey : MASKED_KEY;
    savedKeyEl.setAttribute(
        "aria-label",
        isKeyRevealed ? `Encryption key: ${currentSecretKey}` : "Encryption key hidden"
    );
    revealKeyBtn.textContent = isKeyRevealed ? "Hide" : "Reveal";
    revealKeyBtn.setAttribute("aria-pressed", String(isKeyRevealed));
}

function render_key_state() {
    const state = get_effective_trust_state();
    const fingerprint = currentTrust?.fingerprint || currentExchangeStatus?.fingerprint || "";
    const previousFingerprint = currentTrust?.oldFingerprint || currentExchangeStatus?.oldFingerprint || "";

    keyStateCard.dataset.state = state;
    fingerprintGroup.hidden = !fingerprint;
    currentFingerprint.textContent = fingerprint;
    oldFingerprint.hidden = !previousFingerprint || state !== "changed";
    oldFingerprint.textContent = previousFingerprint
        ? `Previous fingerprint: ${previousFingerprint}`
        : "";

    if (state === "none") {
        keyTrustBadge.textContent = "No key";
        keyTrustBadge.dataset.tone = "neutral";
        keyTrustDescription.textContent = "No encryption key is saved for this chat.";
    } else if (state === "verified") {
        const verifiedAt = format_verified_date(currentTrust?.verifiedAt || currentTrust?.at);
        keyTrustBadge.textContent = "Verified";
        keyTrustBadge.dataset.tone = "success";
        keyTrustDescription.textContent = verifiedAt
            ? `Your partner was verified on ${verifiedAt}.`
            : "Your partner has been verified for this key.";
    } else if (state === "changed") {
        keyTrustBadge.textContent = "Fingerprint changed";
        keyTrustBadge.dataset.tone = "danger";
        keyTrustDescription.textContent = "The partner fingerprint changed. Verify the new six-digit code before sending sensitive messages.";
    } else if (currentTrust?.source === "manual") {
        keyTrustBadge.textContent = "Unverified";
        keyTrustBadge.dataset.tone = "warning";
        keyTrustDescription.textContent = "A manual key is saved. Confirm it with your partner through a trusted channel.";
    } else {
        keyTrustBadge.textContent = "Unverified";
        keyTrustBadge.dataset.tone = "warning";
        keyTrustDescription.textContent = "The key is stored, but your partner has not been verified yet.";
    }

    render_key_material();
    render_sas_panel();
    render_action_availability();
}

function render_action_availability() {
    const ready = can_manage_chat();
    const exchangeBusy = ["waiting", "incoming"].includes(currentExchangeStatus?.status);
    const exchangeButtonBusy = exchangeBtn.getAttribute("aria-busy") === "true";
    const cancelExchangeBusy = cancelExchangeBtn.getAttribute("aria-busy") === "true";
    const saveButtonBusy = saveBtn.getAttribute("aria-busy") === "true";
    const clearButtonBusy = clearKeyBtn.getAttribute("aria-busy") === "true";
    const autoDecryptBusy = autoDecryptToggle.getAttribute("aria-busy") === "true";
    const acceptBusy = acceptExchangeBtn.getAttribute("aria-busy") === "true";
    const declineBusy = declineExchangeBtn.getAttribute("aria-busy") === "true";

    secretKeyInput.disabled = !ready || exchangeBusy || saveButtonBusy;
    saveBtn.disabled = !ready || exchangeBusy || saveButtonBusy;
    autoDecryptToggle.disabled = !ready || autoDecryptBusy;
    revealKeyBtn.disabled = !ready || !currentSecretKey;
    copyKeyBtn.disabled = !ready || !currentSecretKey;
    clearKeyBtn.disabled = !ready || !currentSecretKey || exchangeBusy || clearButtonBusy;
    exchangeBtn.disabled = !ready || exchangeBusy || exchangeButtonBusy;
    cancelExchangeBtn.hidden = currentExchangeStatus?.status !== "waiting";
    cancelExchangeBtn.disabled = !ready || currentExchangeStatus?.status !== "waiting" || cancelExchangeBusy;
    acceptExchangeBtn.disabled = !ready || currentExchangeStatus?.status !== "incoming" || acceptBusy || declineBusy;
    declineExchangeBtn.disabled = !ready || currentExchangeStatus?.status !== "incoming" || acceptBusy || declineBusy;

    manualKeyDetails.classList.toggle("unavailable", !ready);

    if (!ready) {
        exchangeBtn.textContent = "Open a Bale chat to continue";
        setupDescription.textContent = "Secure key exchange is available in an open Bale web chat.";
    } else if (currentExchangeStatus?.status === "waiting") {
        exchangeBtn.textContent = "Waiting for partner…";
        setupDescription.textContent = "The request was sent. Keep Bale open while your partner responds.";
    } else if (currentExchangeStatus?.status === "incoming") {
        exchangeBtn.textContent = "Respond to the request above";
        setupDescription.textContent = "Accept or decline the incoming request before starting another exchange.";
    } else if (exchangeButtonBusy) {
        exchangeBtn.textContent = "Starting exchange…";
    } else {
        exchangeBtn.textContent = currentSecretKey
            ? "Replace with a new exchanged key"
            : "Exchange key securely";
        setupDescription.textContent = "Exchange a unique key with your partner, then verify the six-digit code together.";
    }
}

function render_sas_panel() {
    const entry = currentExchangeStatus;
    const state = get_effective_trust_state();
    const nonce = entry?.nonce || null;
    const wasHidden = sasPanel.hidden;
    const shouldShow = Boolean(
        currentSecretKey &&
        entry?.status === "complete" &&
        entry.sas &&
        state !== "verified" &&
        dismissedSasNonce !== nonce
    );

    sasPanel.hidden = !shouldShow;
    if (!shouldShow) {
        return;
    }

    const rawCode = String(entry.sas);
    const formattedCode = /^\d{6}$/.test(rawCode)
        ? `${rawCode.slice(0, 3)} ${rawCode.slice(3)}`
        : rawCode;

    sasCode.textContent = formattedCode;
    sasCode.setAttribute(
        "aria-label",
        `SAS verification code ${rawCode.split("").join(" ")}`
    );

    const fingerprint = currentTrust?.fingerprint || entry.fingerprint || "";
    sasFingerprint.hidden = !fingerprint;
    sasFingerprint.textContent = fingerprint ? `Fingerprint: ${fingerprint}` : "";
    sasWarning.hidden = state !== "changed";

    if (wasHidden) {
        requestAnimationFrame(() => sasPanel.focus());
    }
}

function render_incoming_panel() {
    const wasHidden = incomingPanel.hidden;
    const isIncoming = currentExchangeStatus?.status === "incoming";

    incomingPanel.hidden = !isIncoming;
    if (!isIncoming) {
        return;
    }

    incomingFingerprint.textContent = currentExchangeStatus.fingerprint || "Not available yet";

    if (wasHidden) {
        requestAnimationFrame(() => incomingPanel.focus());
    }
}

function render_exchange_panels() {
    render_incoming_panel();
    render_sas_panel();
    render_action_availability();
}

function is_exchange_expired(entry) {
    if (!entry || !Number.isFinite(entry.at)) {
        return false;
    }
    return Date.now() - entry.at > EXCHANGE_STATUS_EXPIRY_MS;
}

async function refresh_key_state() {
    if (!storageKey) {
        currentSecretKey = "";
        currentTrust = null;
        isKeyRevealed = false;
        render_key_state();
        return;
    }

    const trustStorageKey = get_trust_storage_key();
    const result = await chrome.storage.local.get([storageKey, trustStorageKey]);
    const nextKey = result[storageKey] || "";

    if (nextKey !== currentSecretKey) {
        isKeyRevealed = false;
    }

    currentSecretKey = nextKey;
    currentTrust = result[trustStorageKey] || null;
    render_key_state();
}

async function refresh_exchange_status({ announceStale = false } = {}) {
    if (!storageKey) {
        currentExchangeStatus = null;
        render_exchange_panels();
        return;
    }

    const exchangeStorageKey = get_exchange_storage_key();
    const result = await chrome.storage.local.get([exchangeStorageKey]);
    const entry = result[exchangeStorageKey] || null;

    if (entry && is_exchange_expired(entry)) {
        await chrome.storage.local.remove(exchangeStorageKey);
        currentExchangeStatus = null;
        render_exchange_panels();

        if (announceStale && ["waiting", "incoming"].includes(entry.status)) {
            staleWarning.hidden = false;
            set_status("The previous key exchange expired. You can safely try again.", "warning");
        }
        return;
    }

    currentExchangeStatus = entry;
    render_exchange_panels();
}

function register_storage_listener() {
    if (storageListenerRegistered) {
        return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        handle_storage_changes(changes, areaName).catch((error) => {
            console.error("[CipherGap] Popup storage refresh failed:", error);
            set_status("CipherGap could not refresh the latest chat state.", "error");
        });
    });
    storageListenerRegistered = true;
}

async function handle_storage_changes(changes, areaName) {
    if (areaName !== "local" || !storageKey) {
        return;
    }

    const exchangeStorageKey = get_exchange_storage_key();
    const trustStorageKey = get_trust_storage_key();
    const exchangeChanged = Object.hasOwn(changes, exchangeStorageKey);
    const keyChanged = Object.hasOwn(changes, storageKey);
    const trustChanged = Object.hasOwn(changes, trustStorageKey);

    if (exchangeChanged) {
        const entry = changes[exchangeStorageKey].newValue || null;

        if (entry && is_exchange_expired(entry)) {
            await refresh_exchange_status({ announceStale: true });
        } else {
            currentExchangeStatus = entry;
            render_exchange_panels();
        }
    }

    if (exchangeChanged || keyChanged || trustChanged) {
        await refresh_key_state();
    }

    if (currentExchangeStatus?.status === "incoming") {
        set_status("Your partner requested a key exchange. Accept only if you expect it.", "warning");
    } else if (currentExchangeStatus?.status === "complete" && get_effective_trust_state() !== "verified") {
        set_status("Key exchange complete. Compare the six-digit code with your partner.", "warning");
    }
}

async function send_tab_message(message) {
    if (!Number.isInteger(activeTabId)) {
        throw new Error("Open a Bale chat, then reopen CipherGap.");
    }

    try {
        return await chrome.tabs.sendMessage(activeTabId, message);
    } catch (error) {
        console.error("[CipherGap] Could not reach the Bale content script:", error);
        throw new Error("CipherGap is not ready on this Bale tab. Reload Bale and try again.");
    }
}

function show_confirmation({ title, message, confirmLabel }) {
    if (confirmationDialog.open) {
        confirmationDialog.close("cancel");
    }

    confirmationTitle.textContent = title;
    confirmationMessage.textContent = message;
    confirmationActionBtn.textContent = confirmLabel;
    confirmationDialog.returnValue = "cancel";
    confirmationDialog.showModal();

    queueMicrotask(() => confirmationCancelBtn.focus());

    return new Promise((resolve) => {
        confirmationDialog.addEventListener(
            "close",
            () => resolve(confirmationDialog.returnValue === "confirm"),
            { once: true }
        );
    });
}

async function copy_secret_key() {
    if (!currentSecretKey) {
        return;
    }

    try {
        await navigator.clipboard.writeText(currentSecretKey);
    } catch {
        const helper = document.createElement("textarea");
        helper.className = "clipboard-helper";
        helper.value = currentSecretKey;
        helper.setAttribute("readonly", "");
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        copyKeyBtn.focus();

        if (!copied) {
            throw new Error("The browser blocked clipboard access.");
        }
    }

    set_status("Key copied. Keep it private and clear your clipboard when finished.", "success");
}

function create_manual_trust() {
    return {
        state: "unverified",
        source: "manual",
        at: Date.now()
    };
}

async function handle_manual_key_submit(event) {
    event.preventDefault();

    if (!can_manage_chat()) {
        set_status("Open a Bale chat before saving a key.", "error");
        return;
    }

    if (["waiting", "incoming"].includes(currentExchangeStatus?.status)) {
        set_status("Finish or decline the current key exchange before saving a manual key.", "warning");
        return;
    }

    const key = secretKeyInput.value.trim();
    if (!key) {
        set_status("Enter a shared key before saving.", "error");
        secretKeyInput.focus();
        return;
    }

    if (currentSecretKey && key === currentSecretKey) {
        secretKeyInput.value = "";
        manualKeyDetails.open = false;
        set_status(
            get_effective_trust_state() === "verified"
                ? "That key is already saved. Its verified state was preserved."
                : "That key is already saved. Its trust state was left unchanged.",
            get_effective_trust_state() === "verified" ? "success" : "warning"
        );
        return;
    }

    if (currentSecretKey && key !== currentSecretKey) {
        const shouldReplace = await show_confirmation({
            title: "Replace the current key?",
            message: "Existing encrypted messages may no longer decrypt with the new key. Continue only if your partner will use the same replacement key.",
            confirmLabel: "Replace key"
        });

        if (!shouldReplace) {
            secretKeyInput.focus();
            return;
        }
    }

    if (["waiting", "incoming"].includes(currentExchangeStatus?.status)) {
        set_status("The exchange state changed while you were reviewing the replacement. Finish that exchange first.", "warning");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.setAttribute("aria-busy", "true");
    set_status("Saving the manual key…", "progress");

    try {
        const trustStorageKey = get_trust_storage_key();
        const exchangeStorageKey = get_exchange_storage_key();

        await chrome.storage.local.set({
            [storageKey]: key,
            [trustStorageKey]: create_manual_trust()
        });
        await chrome.storage.local.remove(exchangeStorageKey);

        currentExchangeStatus = null;
        dismissedSasNonce = null;
        secretKeyInput.value = "";
        manualKeyDetails.open = false;
        incomingPanel.hidden = true;
        sasPanel.hidden = true;
        staleWarning.hidden = true;
        await refresh_key_state();
        set_status("Manual key saved. It remains unverified until you confirm it with your partner.", "warning");
    } catch (error) {
        console.error("[CipherGap] Manual key save failed:", error);
        set_status(get_error_message(error, "The key could not be saved."), "error");
    } finally {
        saveBtn.removeAttribute("aria-busy");
        render_action_availability();
    }
}

async function handle_clear_key() {
    if (!currentSecretKey) {
        return;
    }

    const keyBeingCleared = currentSecretKey;

    const shouldClear = await show_confirmation({
        title: "Clear this chat key?",
        message: "You will not be able to read or send encrypted messages in this chat until you set up another key.",
        confirmLabel: "Clear key"
    });

    if (!shouldClear) {
        return;
    }

    if (
        currentSecretKey !== keyBeingCleared ||
        ["waiting", "incoming"].includes(currentExchangeStatus?.status)
    ) {
        set_status("The key or exchange state changed while you were reviewing this action. Check the current state and try again.", "warning");
        return;
    }

    set_button_busy(clearKeyBtn, true);
    set_status("Clearing this chat key…", "progress");

    try {
        const response = await send_tab_message({ action: "clear_key" });
        if (!response?.ok) {
            throw new Error(response?.error || "The key could not be cleared.");
        }

        await chrome.storage.local.remove([
            get_trust_storage_key(),
            get_exchange_storage_key()
        ]);

        currentSecretKey = "";
        currentTrust = null;
        currentExchangeStatus = null;
        isKeyRevealed = false;
        dismissedSasNonce = null;
        secretKeyInput.value = "";
        incomingPanel.hidden = true;
        sasPanel.hidden = true;
        staleWarning.hidden = true;
        render_key_state();
        set_status("Key cleared for this chat.", "warning");
    } catch (error) {
        console.error("[CipherGap] Clear key failed:", error);
        set_status(get_error_message(error, "The key could not be cleared."), "error");
    } finally {
        clearKeyBtn.removeAttribute("aria-busy");
        render_action_availability();
    }
}

function resolve_exchange_result(key, entry, trust) {
    return {
        key,
        status: entry,
        trust,
        sas: entry?.sas || null,
        fingerprint: trust?.fingerprint || entry?.fingerprint || null,
        fingerprintWarning: trust?.state === "changed" || Boolean(entry?.fingerprintWarning)
    };
}

function wait_for_exchange_complete(key, timeoutMs = EXCHANGE_WAIT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const exchangeStorageKey = `exchange_status_${key}`;
        const trustStorageKey = `key_trust_${key}`;
        let settled = false;
        let timeoutId = null;

        const cleanup = () => {
            chrome.storage.onChanged.removeListener(on_storage_changed);
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        };

        const finish = (callback, value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            callback(value);
        };

        const inspect_status = async (entry) => {
            if (!entry || settled) {
                return;
            }

            if (["declined", "cancelled", "error"].includes(entry.status)) {
                if (entry.status === "cancelled" && entry.nonce === cancelledExchangeNonce) {
                    finish(reject, create_cancelled_exchange_error());
                } else {
                    finish(reject, new Error(entry.error || "The key exchange was declined."));
                }
                return;
            }

            if (entry.status !== "complete") {
                return;
            }

            try {
                const result = await chrome.storage.local.get([
                    key,
                    exchangeStorageKey,
                    trustStorageKey
                ]);
                const completedEntry = result[exchangeStorageKey] || entry;

                if (result[key]) {
                    finish(
                        resolve,
                        resolve_exchange_result(
                            result[key],
                            completedEntry,
                            result[trustStorageKey] || null
                        )
                    );
                }
            } catch (error) {
                finish(reject, error);
            }
        };

        function on_storage_changed(changes, areaName) {
            if (areaName !== "local" || !changes[exchangeStorageKey]) {
                return;
            }

            const change = changes[exchangeStorageKey];
            if (
                !change.newValue &&
                change.oldValue?.status === "waiting" &&
                change.oldValue.nonce === cancelledExchangeNonce
            ) {
                finish(reject, create_cancelled_exchange_error());
                return;
            }

            inspect_status(change.newValue).catch((error) => {
                finish(reject, error);
            });
        }

        chrome.storage.onChanged.addListener(on_storage_changed);

        timeoutId = setTimeout(async () => {
            try {
                const latest = await chrome.storage.local.get([exchangeStorageKey]);
                const entry = latest[exchangeStorageKey];

                if (entry?.status === "complete") {
                    await inspect_status(entry);
                    if (settled) {
                        return;
                    }
                }

                if (entry?.status === "waiting") {
                    const cancelResponse = await send_tab_message({
                        action: "cancel_key_exchange",
                        nonce: entry.nonce
                    }).catch((error) => {
                        console.warn("[CipherGap] Content-side exchange cancellation failed:", error);
                        return null;
                    });

                    if (cancelResponse?.completed) {
                        const completed = await chrome.storage.local.get([exchangeStorageKey]);
                        await inspect_status(completed[exchangeStorageKey]);
                        if (settled) {
                            return;
                        }
                    }
                }

                const afterCancellation = await chrome.storage.local.get([exchangeStorageKey]);
                const remainingEntry = afterCancellation[exchangeStorageKey];
                if (remainingEntry?.status === "complete") {
                    await inspect_status(remainingEntry);
                    if (settled) {
                        return;
                    }
                }
                if (
                    remainingEntry?.status === "waiting" &&
                    remainingEntry.nonce === entry?.nonce
                ) {
                    await chrome.storage.local.remove(exchangeStorageKey);
                }
            } catch (error) {
                console.warn("[CipherGap] Could not clean up timed-out exchange status:", error);
            }
            finish(
                reject,
                new Error("The key exchange timed out. Ask your partner to keep this Bale chat open, then try again.")
            );
        }, timeoutMs);

        chrome.storage.local
            .get([exchangeStorageKey])
            .then((result) => inspect_status(result[exchangeStorageKey]))
            .catch((error) => finish(reject, error));
    });
}

async function handle_start_exchange() {
    if (!can_manage_chat()) {
        set_status("Open a Bale chat before exchanging keys.", "error");
        return;
    }

    if (currentSecretKey) {
        const shouldReplace = await show_confirmation({
            title: "Replace the current key?",
            message: "A new exchange will replace this chat's current encryption key. Older messages may require the previous key.",
            confirmLabel: "Start new exchange"
        });

        if (!shouldReplace) {
            return;
        }
    }

    if (["waiting", "incoming"].includes(currentExchangeStatus?.status)) {
        set_status("Finish or decline the current key exchange before starting another one.", "warning");
        return;
    }

    set_button_busy(exchangeBtn, true);
    exchangeBtn.textContent = "Starting exchange…";
    set_status("Starting a secure key exchange…", "progress");
    cancelledExchangeNonce = null;
    dismissedSasNonce = null;
    staleWarning.hidden = true;

    try {
        const response = await send_tab_message({ action: "start_key_exchange" });
        if (!response?.ok) {
            throw new Error(response?.error || "The key exchange could not start.");
        }

        set_status("Request sent. Waiting for your partner to respond…", "progress");
        const result = await wait_for_exchange_complete(storageKey);

        currentExchangeStatus = result.status;
        currentTrust = result.trust;
        await refresh_key_state();
        render_exchange_panels();

        if (result.fingerprintWarning) {
            set_status("The partner fingerprint changed. Verify the six-digit code before sending sensitive messages.", "warning");
        } else if (result.sas) {
            set_status("Key exchanged. Compare the six-digit code with your partner.", "warning");
        } else {
            set_status("Key exchanged and saved. Partner verification is still recommended.", "warning");
        }
    } catch (error) {
        currentExchangeStatus = null;
        if (error?.name === "AbortError") {
            set_status("Pending key exchange cancelled.", "neutral");
        } else {
            console.error("[CipherGap] Exchange failed:", error);
            set_status(get_error_message(error, "The key exchange failed."), "error");
        }
    } finally {
        cancelledExchangeNonce = null;
        exchangeBtn.removeAttribute("aria-busy");
        await refresh_exchange_status().catch(() => {});
        render_action_availability();
    }
}

async function handle_cancel_exchange() {
    if (currentExchangeStatus?.status !== "waiting") {
        set_status("There is no pending outgoing exchange to cancel.", "neutral");
        return;
    }

    const nonce = currentExchangeStatus.nonce;
    cancelledExchangeNonce = nonce;
    set_button_busy(cancelExchangeBtn, true);
    set_status("Cancelling the pending key exchange…", "progress");

    try {
        const response = await send_tab_message({
            action: "cancel_key_exchange",
            nonce
        });

        if (!response?.ok) {
            throw new Error(response?.error || "The pending exchange could not be cancelled.");
        }

        if (response.completed) {
            cancelledExchangeNonce = null;
            await refresh_exchange_status();
            await refresh_key_state();
            render_exchange_panels();
            set_status(
                "The exchange completed before cancellation. Verify the six-digit code before using the new key.",
                "warning"
            );
            return;
        }

        if (!response.cancelled) {
            throw new Error("The pending exchange could not be cancelled.");
        }

        currentExchangeStatus = null;
        dismissedSasNonce = null;
        render_exchange_panels();
        set_status("Pending key exchange cancelled.", "neutral");
    } catch (error) {
        cancelledExchangeNonce = null;
        console.error("[CipherGap] Exchange cancellation failed:", error);
        set_status(get_error_message(error, "The pending exchange could not be cancelled."), "error");
    } finally {
        cancelExchangeBtn.removeAttribute("aria-busy");
        render_action_availability();
    }
}

async function handle_incoming_response(accept) {
    if (currentExchangeStatus?.status !== "incoming") {
        set_status("This exchange request is no longer available.", "warning");
        return;
    }

    const requestedNonce = currentExchangeStatus.nonce;

    if (accept && currentSecretKey) {
        const shouldReplace = await show_confirmation({
            title: "Accept and replace the current key?",
            message: "Accepting this request will replace this chat's encryption key. Confirm that you expect your partner to start a new exchange.",
            confirmLabel: "Accept and replace"
        });

        if (!shouldReplace) {
            return;
        }
    }

    if (
        currentExchangeStatus?.status !== "incoming" ||
        currentExchangeStatus.nonce !== requestedNonce
    ) {
        set_status("This exchange request changed while you were reviewing it. Check the current request and try again.", "warning");
        return;
    }

    const nonce = requestedNonce;
    const activeButton = accept ? acceptExchangeBtn : declineExchangeBtn;
    set_button_busy(activeButton, true);
    acceptExchangeBtn.disabled = true;
    declineExchangeBtn.disabled = true;
    set_status(
        accept ? "Accepting the key exchange…" : "Declining the key exchange…",
        "progress"
    );

    try {
        const response = await send_tab_message({
            action: "respond_key_exchange",
            accept,
            nonce
        });

        if (!response?.ok) {
            throw new Error(response?.error || "The exchange response could not be sent.");
        }

        if (!accept) {
            currentExchangeStatus = null;
            incomingPanel.hidden = true;
            await refresh_exchange_status();
            set_status("Key exchange request declined.", "neutral");
            return;
        }

        incomingPanel.hidden = true;
        set_status("Exchange accepted. Finishing secure key setup…", "progress");
        const result = await wait_for_exchange_complete(storageKey);

        currentExchangeStatus = result.status;
        currentTrust = result.trust;
        await refresh_key_state();
        render_exchange_panels();

        if (result.fingerprintWarning) {
            set_status("The partner fingerprint changed. Verify the six-digit code before sending sensitive messages.", "warning");
        } else {
            set_status("Key exchanged. Compare the six-digit code with your partner.", "warning");
        }
    } catch (error) {
        console.error("[CipherGap] Incoming exchange response failed:", error);
        set_status(get_error_message(error, "The exchange response failed."), "error");
    } finally {
        activeButton.removeAttribute("aria-busy");
        render_action_availability();
    }
}

async function handle_sas_verified() {
    const nonce = currentExchangeStatus?.nonce || currentTrust?.nonce || null;
    set_button_busy(sasVerifiedBtn, true);
    sasDismissBtn.disabled = true;
    set_status("Saving partner verification…", "progress");

    try {
        const message = { action: "mark_key_verified" };
        if (nonce) {
            message.nonce = nonce;
        }

        const response = await send_tab_message(message);
        if (!response?.ok) {
            throw new Error(response?.error || "Partner verification could not be saved.");
        }

        await refresh_key_state();
        if (get_effective_trust_state() !== "verified") {
            throw new Error("Verification was not saved. Reload Bale and try again.");
        }

        sasPanel.hidden = true;

        try {
            const confirmationResponse = await send_tab_message({ action: "send_confirmation" });
            if (!confirmationResponse?.ok) {
                throw new Error(confirmationResponse?.error || "Confirmation was not sent.");
            }
            set_status("Partner verified. An encrypted confirmation was sent.", "success");
        } catch (confirmationError) {
            console.warn("[CipherGap] Verification saved, but confirmation failed:", confirmationError);
            set_status("Partner verified locally, but the confirmation message could not be sent.", "warning");
        }
    } catch (error) {
        console.error("[CipherGap] SAS verification failed:", error);
        set_status(get_error_message(error, "Partner verification could not be saved."), "error");
    } finally {
        sasVerifiedBtn.removeAttribute("aria-busy");
        sasVerifiedBtn.disabled = false;
        sasDismissBtn.disabled = false;
        render_action_availability();
    }
}

async function load_auto_decrypt() {
    if (!can_manage_chat()) {
        autoDecryptToggle.checked = false;
        return;
    }

    try {
        const response = await send_tab_message({ action: "get_auto_decrypt" });
        autoDecryptToggle.checked = Boolean(response?.ok && response.enabled);
    } catch {
        autoDecryptToggle.checked = false;
    }
}

async function handle_auto_decrypt_change() {
    const enabled = autoDecryptToggle.checked;
    autoDecryptToggle.disabled = true;
    autoDecryptToggle.setAttribute("aria-busy", "true");

    try {
        const response = await send_tab_message({
            action: "set_auto_decrypt",
            enabled
        });
        if (!response?.ok) {
            throw new Error(response?.error || "The auto-decrypt setting could not be saved.");
        }

        if (enabled) {
            await send_tab_message({ action: "auto_decrypt_sweep" }).catch(() => {});
        }

        set_status(
            enabled
                ? "Auto-decrypt enabled for this chat."
                : "Auto-decrypt disabled for this chat.",
            enabled ? "success" : "neutral"
        );
    } catch (error) {
        console.error("[CipherGap] Auto-decrypt update failed:", error);
        autoDecryptToggle.checked = !enabled;
        set_status(get_error_message(error, "The auto-decrypt setting could not be saved."), "error");
    } finally {
        autoDecryptToggle.removeAttribute("aria-busy");
        render_action_availability();
    }
}

function render_ready_status() {
    if (!can_manage_chat()) {
        if (currentHostname === BALE_HOST) {
            set_status("Open a Bale chat to manage encryption.", "warning");
        } else {
            set_status("This page is unsupported. CipherGap currently works only with Bale.", "warning");
        }
        return;
    }

    if (!staleWarning.hidden) {
        set_status("The previous key exchange expired. You can safely try again.", "warning");
        return;
    }

    if (currentExchangeStatus?.status === "incoming") {
        set_status("Your partner requested a key exchange. Accept only if you expect it.", "warning");
        return;
    }

    if (currentExchangeStatus?.status === "waiting") {
        set_status("Waiting for your partner to respond to the key exchange…", "progress");
        return;
    }

    const state = get_effective_trust_state();
    if (state === "verified") {
        set_status("Encryption is ready for this verified chat.", "success");
    } else if (state === "changed") {
        set_status("Fingerprint changed. Verify the new code before sending sensitive messages.", "warning");
    } else if (state === "unverified") {
        set_status("A key is saved, but partner verification is still needed.", "warning");
    } else {
        set_status("Set up a key to start encrypted messaging in this chat.", "neutral");
    }
}

async function init() {
    render_manifest_version();
    render_key_state();

    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        activeTabId = Number.isInteger(tab?.id) ? tab.id : null;

        if (!tab?.url) {
            throw new Error("The active browser page could not be read.");
        }

        let url;
        try {
            url = new URL(tab.url);
        } catch {
            throw new Error("The active browser page has an unsupported address.");
        }

        currentHostname = url.hostname || url.protocol.replace(":", "");
        currentChatId = url.searchParams.get("uid");
        update_messenger_cards();

        if (!["http:", "https:"].includes(url.protocol) || currentHostname !== BALE_HOST) {
            currentChatId = null;
            storageKey = null;
            update_current_chat_ui();
            render_key_state();
            render_ready_status();
            return;
        }

        storageKey = currentChatId
            ? `${currentHostname}_${currentChatId}`
            : currentHostname;

        update_current_chat_ui();

        if (!currentChatId) {
            render_key_state();
            render_ready_status();
            return;
        }

        register_storage_listener();
        await refresh_exchange_status({ announceStale: true });
        await refresh_key_state();
        await load_auto_decrypt();
        render_ready_status();
    } catch (error) {
        console.error("[CipherGap] Popup initialization failed:", error);
        currentChatId = null;
        storageKey = null;
        update_current_chat_ui();
        render_key_state();
        set_status(get_error_message(error, "CipherGap could not inspect the active page."), "error");
    }
}

manualKeyForm.addEventListener("submit", handle_manual_key_submit);

revealKeyBtn.addEventListener("click", () => {
    isKeyRevealed = !isKeyRevealed;
    render_key_material();
});

copyKeyBtn.addEventListener("click", () => {
    copy_secret_key().catch((error) => {
        console.error("[CipherGap] Copy key failed:", error);
        set_status(get_error_message(error, "The key could not be copied."), "error");
    });
});

clearKeyBtn.addEventListener("click", handle_clear_key);
exchangeBtn.addEventListener("click", handle_start_exchange);
cancelExchangeBtn.addEventListener("click", handle_cancel_exchange);
acceptExchangeBtn.addEventListener("click", () => handle_incoming_response(true));
declineExchangeBtn.addEventListener("click", () => handle_incoming_response(false));
sasVerifiedBtn.addEventListener("click", handle_sas_verified);

sasDismissBtn.addEventListener("click", () => {
    dismissedSasNonce = currentExchangeStatus?.nonce || null;
    sasPanel.hidden = true;
    set_status("Verification postponed. This key remains unverified.", "warning");
});

staleDismissBtn.addEventListener("click", () => {
    staleWarning.hidden = true;
    render_ready_status();
});

autoDecryptToggle.addEventListener("change", handle_auto_decrypt_change);

init();
