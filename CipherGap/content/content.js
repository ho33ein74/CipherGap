// content.js

console.log(`CipherGap version ${get_manifest_info().version} loaded`);

let ciphergap_content_initialized = false;

function initialize_ciphergap_content() {
    if (ciphergap_content_initialized || !document.body) {
        return false;
    }

    ciphergap_content_initialized = true;
    messenger_detection();
    start_dom_observer();
    return true;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize_ciphergap_content, { once: true });
} else {
    initialize_ciphergap_content();
}

window.addEventListener("focus", () => {
    if (!initialize_ciphergap_content()) {
        messenger_detection();
    }
});
