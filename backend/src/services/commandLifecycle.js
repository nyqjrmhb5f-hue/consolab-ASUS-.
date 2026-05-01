export const lifecycleStates = [
  "received",
  "validated",
  "staged",
  "pending_approval",
  "approved",
  "dispatched",
  "executed",
  "sealed",
  "attested_sealed",
  "rejected",
  "rolled_back",
  "failed"
];

export const terminalLifecycleStates = ["attested_sealed", "sealed", "rejected", "failed", "rolled_back"];

export const allowedLifecycleTransitions = {
  received: ["validated"],
  validated: ["staged", "pending_approval", "rejected"],
  staged: ["dispatched"],
  pending_approval: ["pending_approval", "approved", "rejected"],
  approved: ["dispatched"],
  dispatched: ["executed", "failed"],
  executed: ["sealed", "failed"],
  sealed: ["attested_sealed"],
  failed: ["rolled_back", "rejected"],
  attested_sealed: [],
  rejected: [],
  rolled_back: []
};

export function canTransitionLifecycle(fromState, toState) {
  if (!toState) {
    return false;
  }

  if (!fromState) {
    return toState === "received";
  }

  return (allowedLifecycleTransitions[fromState] || []).includes(toState);
}

export function isTerminalLifecycleState(state) {
  return terminalLifecycleStates.includes(state);
}
