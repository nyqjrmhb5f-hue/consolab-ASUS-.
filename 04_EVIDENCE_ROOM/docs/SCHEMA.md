# Evidence Room Schema

- `tx_hashes/`: public receipt fingerprints
- `attestations/`: signed proof from the central signer
- `proofs/`: Merkle inclusion paths
- `runtime_journals/`: append-only black-box replay
- `snapshots/`: published root hashes
- `audit_trails/`: chain-of-custody records
- `evidence_refs/`: links to private or external source records

Public verification should resolve against hashes, proofs, and attestations without exposing private raw transaction data.
