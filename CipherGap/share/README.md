# CipherGap shared core

This directory is the messenger-independent source of truth. Bale, Eitaa,
Rubika, Telegram, and future adapters must call these utilities instead of
defining their own CipherGap formats or cryptography.

There is no bundler in this project. The files are classic scripts loaded in
manifest order and publish a documented facade on `globalThis.CipherGapShared`.
The old global function names are kept for the current runtime while adapters
are migrated incrementally.

## Modules

- `namespace.js` creates the shared facade.
- `config.js` owns protocol versions, markers, algorithms, sizes, timeouts, and
  storage-key factories plus the popup's supported-messenger metadata.
- `encoding.js` owns UTF-8, Base64, byte concatenation, and hexadecimal helpers.
- `protocol.js` builds and parses CGP, exchange start/ACK, and SAS messages. It
  also owns strict validation and display formatting for protocol identifiers.
- `crypto.js` owns the single SHA-256 → AES-GCM key derivation and message
  encryption/decryption implementation.
- `file_crypto.js` owns the CGPE container and file encryption/decryption.
- `dh_crypto.js` owns P-256 ECDH, shared-secret derivation, SAS, and fingerprints.
- `messenger_adapter.js` owns adapter registration and chat-context resolution.

## Adapter boundary

A messenger adapter may:

- identify its hostname and stable chat ID;
- locate the composer, send control, messages, and attachments;
- send text through the messenger;
- observe SPA/DOM changes;
- render CipherGap controls next to messenger content.

An adapter must not contain literals such as `CGP`, `CGPE`, `AESGCM`,
`start exchange key:`, or `cg-sas`. It should pass extracted text to
`CipherGapShared.protocol` and use `CipherGapShared.crypto`,
`CipherGapShared.file_crypto`, and the shared storage-key factories.

The current adapter interface is:

```js
register_messenger_adapter("example", {
    hostnames: ["web.example.test"],
    is_active() {},
    is_in_chat(url) {},
    get_chat_storage_suffix(url) {},
    send_message(text) {},
    extract_message_text(element) {},
    inject_ui() {},
    observe_messages() {},
    auto_decrypt_visible_messages() {},
    clear_input() {} // optional
});
```

All methods above except `clear_input` are required and validated during
registration. The shared runtime routes popup actions such as auto-decrypt to
the active adapter, so a new adapter does not need a second popup listener.

Add the messenger metadata (`id`, display name, and hostnames) to
`share/config.js` as well as registering its adapter. The popup uses this
metadata before asking the content script for the authoritative chat context.
Its compatibility list and roadmap are rendered from that same configuration,
so adapter files must not add messenger-specific popup branches.
The adapter hostnames, config hostnames, and explicit manifest matches must
agree.

Keep the suffix stable and opaque. The shared resolver produces
`<hostname>_<suffix>`, preserving existing Bale keys such as
`web.bale.ai_49589703`.

## Changing a format

Add an immutable codec entry under `formats.<type>.codecs` in `config.js`, then
point that type's `write_codec` at the new entry. Never edit or remove an old
codec merely to change what is written: the codec registry is also the reader
registry. Keep CGP v1, CGPE v1, their crypto profile, and the legacy exchange
strings readable. Every exchange codec must name both its ECDH derivation
profile and the message codec used for encrypted confirmations. The exchange
controller carries the matched codec ID through pending and stored state so a
legacy request receives a legacy ACK, SAS, and confirmation. Update
`tests/shared_core.test.js` with fixed old and new golden vectors.

Messenger host permissions and content-script matches remain explicit Chrome
manifest entries. Add them only when that messenger has a tested adapter.
