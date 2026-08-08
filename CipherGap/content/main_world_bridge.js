// main_world_bridge.js — runs in the PAGE'S MAIN WORLD (same context as Bale's JS)
// Cannot use chrome.* APIs. Communicates with the isolated-world content script
// via window.postMessage.
//
// Job: intercept Bale's file-download mechanism and report any .cgpe download
// URLs back to the content script so it can fetch + decrypt + save the file.
//
// Bale's download flow:
//   1. User clicks دانلود
//   2. Bale sends a WebSocket message (ai.bale.server.Files/GetNasimFileUrls)
//   3. Server replies over WS with a plaintext URL like:
//      https://file-gw6.ble.ir/proxy_download/<token>?u=<sig>&filename=...cgpe
//   4. Bale fetches that URL to download the file bytes
//
// We hook (a) WebSocket messages and (b) fetch/XHR to catch that URL in either step.

(function () {
    "use strict";

    const TAG = "[CipherGap MAIN]";

    // URL pattern for Bale's file download gateway.
    // Matches both ble.ir and bale.ai gateways, any file with .cgpe.
    const CGPE_DOWNLOAD_RE = /https?:\/\/[^"'\s]*proxy_download[^"'\s]*\.cgpe[^"'\s]*/i;
    // Broader fallback: any URL mentioning .cgpe filename
    const CGPE_URL_RE = /https?:\/\/[^"'\s]*\.cgpe[^"'\s]*/i;

    function extract_cgpe_urls(text) {
        if (!text) return [];
        const found = new Set();
        let m;
        const re1 = new RegExp(CGPE_DOWNLOAD_RE.source, "gi");
        while ((m = re1.exec(text)) !== null) {
            found.add(m[0]);
        }
        const re2 = new RegExp(CGPE_URL_RE.source, "gi");
        while ((m = re2.exec(text)) !== null) {
            found.add(m[0]);
        }
        return Array.from(found);
    }

    function report_urls(urls) {
        for (const url of urls) {
            console.log(TAG, "Detected .cgpe download URL:", url);
            window.postMessage({ source: "ciphergap-main", type: "cgpe_url", url }, "*");
        }
    }

    // =========================
    // 1. WebSocket interception
    // =========================

    const OriginalWebSocket = window.WebSocket;

    function PatchedWebSocket(url, protocols) {
        const ws = protocols !== undefined
            ? new OriginalWebSocket(url, protocols)
            : new OriginalWebSocket(url);

        // Wrap addEventListener so we can peek at every incoming message.
        const origAddEventListener = ws.addEventListener.bind(ws);
        ws.addEventListener = function (type, listener, options) {
            if (type === "message") {
                const wrapped = function (event) {
                    try {
                        const data = event.data;
                        let text = data;
                        if (data instanceof ArrayBuffer) {
                            text = new TextDecoder().decode(data);
                        } else if (data instanceof Blob) {
                            // Best-effort; async, so we handle separately
                            data.text().then((t) => {
                                const urls = extract_cgpe_urls(t);
                                if (urls.length) report_urls(urls);
                            }).catch(() => {});
                            return listener.call(this, event);
                        }
                        const urls = extract_cgpe_urls(text);
                        if (urls.length) report_urls(urls);
                    } catch (err) {
                        // Never break Bale's handler
                    }
                    return listener.call(this, event);
                };
                return origAddEventListener(type, wrapped, options);
            }
            return origAddEventListener(type, listener, options);
        };

        // Also wrap the onmessage property setter.
        try {
            let origOnMessage = null;
            Object.defineProperty(ws, "onmessage", {
                get() { return origOnMessage; },
                set(fn) {
                    origOnMessage = fn;
                    if (typeof fn === "function") {
                        ws.addEventListener("message", fn);
                    }
                },
                configurable: true
            });
        } catch (err) {
            // Property override failed; addEventListener path still works.
        }

        return ws;
    }

    // Copy static props so instanceof etc. still work.
    PatchedWebSocket.prototype = OriginalWebSocket.prototype;
    PatchedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    PatchedWebSocket.OPEN = OriginalWebSocket.OPEN;
    PatchedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    PatchedWebSocket.CLOSED = OriginalWebSocket.CLOSED;

    try {
        window.WebSocket = PatchedWebSocket;
        console.log(TAG, "WebSocket patched");
    } catch (err) {
        console.warn(TAG, "Could not patch WebSocket:", err);
    }

    // =========================
    // 2. fetch interception
    // =========================

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input?.url ?? "");
        const urls = extract_cgpe_urls(url);
        if (urls.length) report_urls(urls);

        const promise = originalFetch.apply(this, arguments);

        // If this fetch itself is fetching a .cgpe file, capture the bytes.
        if (CGPE_URL_RE.test(url)) {
            return promise.then(async (response) => {
                try {
                    const clone = response.clone();
                    const buf = await clone.arrayBuffer();
                    window.postMessage(
                        { source: "ciphergap-main", type: "cgpe_bytes", url, bytes: buf },
                        "*"
                    );
                } catch (err) {
                    // ignore — let the original response through
                }
                return response;
            });
        }

        return promise;
    };
    console.log(TAG, "fetch patched");

    // =========================
    // 3. XMLHttpRequest interception
    // =========================

    const OriginalXHRopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        const urls = extract_cgpe_urls(String(url));
        if (urls.length) report_urls(urls);

        // Capture bytes if this XHR is fetching a .cgpe file
        if (CGPE_URL_RE.test(String(url))) {
            this.addEventListener("load", function () {
                try {
                    if (this.response instanceof ArrayBuffer || this.response instanceof Blob) {
                        const buf = this.response instanceof Blob
                            ? this.response.arrayBuffer()
                            : this.response;
                        Promise.resolve(buf).then((b) => {
                            window.postMessage(
                                { source: "ciphergap-main", type: "cgpe_bytes", url: String(url), bytes: b },
                                "*"
                            );
                        }).catch(() => {});
                    }
                } catch (err) {
                    // ignore
                }
            });
        }

        return OriginalXHRopen.call(this, method, url, ...rest);
    };
    console.log(TAG, "XHR patched");

    console.log(TAG, "Main-world bridge ready");
})();
