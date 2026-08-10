// Shared namespace for classic Manifest V3 content scripts and popup modules.
// Keep this file dependency-free and load it before every other shared utility.

if (!globalThis.CipherGapShared) {
    globalThis.CipherGapShared = {};
}
