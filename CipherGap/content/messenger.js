// messenger.js

function messenger_detection() {
    const adapter = globalThis.CipherGapShared.messenger_adapters
        .get_by_hostname(window.location.hostname);

    if (adapter?.is_active?.()) {
        adapter.inject_ui?.();
        return {
            detected: true,
            messenger: adapter.name
        };
    }

    return {
        detected: false,
        messenger: null
    };
}
