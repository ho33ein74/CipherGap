# CipherGap 🔒

**CipherGap** is an open-source Chrome extension that adds client-side encryption to **Bale Web**. Rubika, Eitaa, and Telegram integrations are planned but are not active yet.

Messages are encrypted locally in your browser before being sent, ensuring that only users with the shared secret can read the original content.

## Features

* AES-256-GCM message and attachment encryption in the browser
* Per-chat keys and optional automatic message decryption
* ECDH P-256 key exchange with a six-digit SAS verification step
* Persistent peer-fingerprint change warnings (TOFU)
* Explicit accept/decline controls for incoming key exchanges
* Manifest V3 with no external servers or cloud processing

## Installation

### Manual Installation

```bash
git clone https://github.com/alisharify7/CipherGap.git
```

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the inner `CipherGap/` directory that contains `manifest.json`

The extension is now ready to use.

## Usage

1. Open a conversation in [Bale Web](https://web.bale.ai/).
2. Open CipherGap and choose **Exchange key securely**.
3. The other participant opens CipherGap and accepts the incoming request.
4. Compare the six-digit verification code over a trusted channel, then mark the key verified.
5. Use the injected **Encrypt** button to send an encrypted message. Attachments are encrypted as `.cgpe` files when the chat key is available.

A manually shared key is available under **Advanced**, but it remains marked unverified.

## Tech Stack

* JavaScript
* HTML/CSS
* Chrome Extensions API (Manifest V3)
* AES Encryption

## Architecture

Messenger-independent code lives in `CipherGap/share/`. It is the single source
of truth for message and key-exchange formats, AES/ECDH utilities, the CGPE file
container, storage-key names, and adapter registration. Bale-specific selectors,
DOM observers, composer behavior, and rendering stay in `CipherGap/content/bale.js`.

Future Eitaa, Rubika, and Telegram integrations should implement the messenger
adapter contract documented in `CipherGap/share/README.md`; they must not copy
encryption or packet-format code. Format upgrades add a new immutable codec and
keep old readers registered, so existing messages and files remain compatible.

## Security

* Encryption and decryption occur entirely on the client side.
* Incoming key exchanges require explicit approval and remain unverified until the SAS codes are compared.
* Peer fingerprints are retained when a chat key is cleared so unexpected identity changes can still be detected.
* CGPE v1 processes complete files in memory and therefore applies a 100 MB safety limit.
* CipherGap has no backend; plaintext processing happens locally before ciphertext is sent through Bale.
* Source code is publicly available for review and auditing.

> CipherGap improves privacy on supported messaging platforms, but users should independently review the cryptographic implementation before relying on it for highly sensitive communications.

## Contributing

Contributions, bug reports, and feature requests are welcome.

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

Released under the MIT License.

---

⭐ If you find CipherGap useful, consider starring the repository.
