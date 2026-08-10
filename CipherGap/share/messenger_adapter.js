// messenger_adapter.js — platform-agnostic messenger interface

const messenger_adapters = {};
const REQUIRED_MESSENGER_ADAPTER_METHODS = Object.freeze([
    "is_active",
    "is_in_chat",
    "get_chat_storage_suffix",
    "send_message",
    "extract_message_text",
    "inject_ui",
    "observe_messages",
    "auto_decrypt_visible_messages"
]);

function register_messenger_adapter(name, adapter) {
    if (!name || typeof name !== "string") {
        throw new TypeError("A messenger adapter requires a stable name.");
    }
    if (!adapter || !Array.isArray(adapter.hostnames) || adapter.hostnames.length === 0) {
        throw new TypeError(`The ${name} adapter requires at least one hostname.`);
    }
    const missingMethod = REQUIRED_MESSENGER_ADAPTER_METHODS.find(
        (method) => typeof adapter[method] !== "function"
    );
    if (missingMethod) {
        throw new TypeError(
            `The ${name} adapter requires the ${missingMethod}() method.`
        );
    }
    const configuredMessenger = globalThis.CipherGapShared.messengers
        .definitions[name];
    if (!configuredMessenger) {
        throw new Error(
            `The ${name} adapter must be declared in share/config.js.`
        );
    }
    const adapterHostnames = [...new Set(
        adapter.hostnames.map((hostname) => hostname.toLowerCase())
    )].sort();
    const configuredHostnames = [...configuredMessenger.hostnames].sort();
    if (
        adapterHostnames.length !== configuredHostnames.length ||
        adapterHostnames.some(
            (hostname, index) => hostname !== configuredHostnames[index]
        )
    ) {
        throw new Error(
            `The ${name} adapter hostnames must match share/config.js.`
        );
    }
    if (messenger_adapters[name]) {
        throw new Error(`The ${name} messenger adapter is already registered.`);
    }
    messenger_adapters[name] = {
        ...adapter,
        name,
        hostnames: adapterHostnames
    };
}

function get_active_messenger_adapter() {
    for (const adapter of Object.values(messenger_adapters)) {
        if (adapter.is_active?.()) {
            return adapter;
        }
    }
    return null;
}

function get_messenger_adapter_by_hostname(hostname) {
    const normalizedHostname = String(hostname ?? "").toLowerCase();
    for (const adapter of Object.values(messenger_adapters)) {
        if (adapter.hostnames?.some(
            (candidate) => candidate.toLowerCase() === normalizedHostname
        )) {
            return adapter;
        }
    }
    return null;
}

function resolve_messenger_context(urlValue = window.location.href) {
    const url = urlValue instanceof URL ? urlValue : new URL(urlValue);
    const adapter = get_messenger_adapter_by_hostname(url.hostname);
    const chatId = adapter?.get_chat_storage_suffix?.(url) ?? null;
    const inChat = adapter?.is_in_chat
        ? Boolean(adapter.is_in_chat(url))
        : Boolean(chatId);

    return {
        adapter,
        supported: Boolean(adapter),
        messenger: adapter?.name ?? null,
        hostname: url.hostname,
        chatId,
        inChat,
        storageKey: globalThis.CipherGapShared.storage_keys.chat(
            url.hostname,
            chatId
        )
    };
}

globalThis.CipherGapShared.messenger_adapters = Object.freeze({
    required_methods: REQUIRED_MESSENGER_ADAPTER_METHODS,
    register: register_messenger_adapter,
    get_active: get_active_messenger_adapter,
    get_by_hostname: get_messenger_adapter_by_hostname,
    resolve_context: resolve_messenger_context
});
