# 04_EVIDENCE_ROOM

Primary engine: `LEDGERD`

This room is the append-only proof vault for ConsoleLab. It stores public hashes, attestations, proofs, timelines, and audit trails while keeping private source records out of public view.

Key flows:
- `tx_hashes/` proves existence
- `attestations/` proves authorship
- `proofs/` proves inclusion
- `runtime_journals/` preserves replayable black-box history
