# Provenance

Derived from a private production system for agentic software development by Richard Ertl, in development since 2026-07-07.

| Item | Value |
|---|---|
| Manifest SHA-256 | `065cdeba6b9af4edcc86c19426ab543a77915b12f3ea8de794746b0dab680058` |
| Bundle SHA-256 | `e6edad622e8c253797f6fba49126cd2bd511eb3d0b47287c607ca46e0f21c96c` |
| First commit on the main line | 2026-07-07T02:41:49+02:00 |
| Manifest created | 2026-10-08T18:50:37.149Z |

## Timestamps

| Proof | Issuer | Time (UTC) | Binds |
|---|---|---|---|
| OpenTimestamps (Bitcoin) | public calendars, Bitcoin blockchain | stamped 2026-10-08; the proof is upgraded once the Bitcoin block is confirmed, the proof file is held privately | SHA-256 of `manifest.json` |
| RFC 3161 time-stamp token | FreeTSA (freetsa.org) | 2026-10-08 18:50:41 | SHA-512 of `manifest.json` |
| Qualified electronic time stamp (eIDAS Art. 42) with qualified electronic signature of Richard Ertl | A-Trust GmbH, `a-sign-premium-timestamping-09` (EU trusted list, AT) | 2026-10-08 18:57:46 | the manifest rendered as PDF, which carries the manifest SHA-256 in plain text |

The signed PDF validates as PAdES-BASELINE-T / QESig with a qualified time stamp in the EU DSS validator (report archived privately).

## How to verify

This package ships this file, not the anchored artefacts: the manifest (`manifest.json`), the git
bundle, the signed manifest PDF and the timestamp proofs (OpenTimestamps `.ots`, RFC 3161
`.tsq`/`.tsr`) are held privately and can be produced on request. The anchored file is
`manifest.json` (SHA-256 shown above); the RFC 3161 token binds its SHA-512. With the files in hand:

- Confirm that `sha256sum manifest.json` equals the manifest hash above, and that the SHA-256 of the bundle equals the bundle hash listed in the manifest.
- OpenTimestamps: `ots verify manifest.json.ots` (manifest file next to the proof).
- RFC 3161: `openssl ts -verify -in manifest.tsr -queryfile manifest.tsq -CAfile cacert.pem -untrusted tsa.crt` (FreeTSA publishes `cacert.pem` and `tsa.crt`).
- Qualified time stamp: validate the signed manifest PDF at https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo (Validate a signature); expected: QESig, PAdES-BASELINE-T, Timestamps → Qualified timestamp, issuer A-Trust.
