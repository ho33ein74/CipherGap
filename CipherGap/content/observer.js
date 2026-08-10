// observer.js

const DOM_DETECTION_DEBOUNCE_MS = 150;
const MESSENGER_UI_SELECTOR = [
    "footer",
    "form",
    "textarea",
    "input",
    "button",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='textbox']"
].join(",");

let ciphergap_dom_observer = null;
let messenger_detection_timer = null;

function node_may_contain_messenger_ui(node, ignoreCipherGapNode = false) {
    if (!(node instanceof Element)) {
        return false;
    }

    // UI inserted by CipherGap itself is already initialized and should not
    // cause another detection pass.
    if (
        ignoreCipherGapNode &&
        node.matches?.("[id^='ciphergap-'], [class^='ciphergap-'], [class*=' ciphergap-']")
    ) {
        return false;
    }

    return (
        node.matches?.(MESSENGER_UI_SELECTOR) ||
        Boolean(node.querySelector?.(MESSENGER_UI_SELECTOR))
    );
}

function mutations_may_change_messenger_ui(mutations) {
    return mutations.some((mutation) => {
        if (mutation.type !== "childList") {
            return false;
        }

        const relevantAddition = [...mutation.addedNodes]
            .some((node) => node_may_contain_messenger_ui(node, true));
        const relevantRemoval = [...mutation.removedNodes]
            .some((node) => node_may_contain_messenger_ui(node));

        return relevantAddition || relevantRemoval;
    });
}

function schedule_messenger_detection() {
    clearTimeout(messenger_detection_timer);
    messenger_detection_timer = setTimeout(() => {
        messenger_detection_timer = null;
        messenger_detection();
    }, DOM_DETECTION_DEBOUNCE_MS);
}

function start_dom_observer() {
    if (ciphergap_dom_observer || !document.body) {
        return ciphergap_dom_observer;
    }

    // Do not install a generic page-wide observer on hosts for which no
    // adapter has been registered.
    const registeredAdapter = globalThis.CipherGapShared.messenger_adapters
        .get_by_hostname(window.location.hostname);
    if (!registeredAdapter) {
        return null;
    }

    // Adapters with their own SPA lifecycle already reconcile their UI and
    // message roots. Avoid a second page-wide observer for those platforms.
    if (registeredAdapter.observe_messages) {
        registeredAdapter.observe_messages();
        return null;
    }

    ciphergap_dom_observer = new MutationObserver((mutations) => {
        if (mutations_may_change_messenger_ui(mutations)) {
            schedule_messenger_detection();
        }
    });

    ciphergap_dom_observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    return ciphergap_dom_observer;
}
