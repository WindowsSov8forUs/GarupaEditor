# GarupaEditor Runtime Contract Policy

## Purpose

GarupaEditor separates reconstructed original-game facts from deterministic product behavior and from integrity enforcement. A missing Reverse observation is useful engineering information, but it is not by itself a reason to reject a valid user action, terminate a Simulator session, or replace the application with an error page.

## Terms

- **Reverse fact**: behavior confirmed by committed and pushed evidence from the locked `jp.co.craftegg.band` 10.1.4 / 230 / ARM64 sample.
- **Product semantics**: deterministic GarupaEditor behavior explicitly documented and tested without claiming original-game equivalence.
- **Evidence notice**: an internal, read-only description that a product semantic is not a Reverse fact. A notice never controls production flow.
- **Action unavailable**: the requested action cannot start because a required resource or platform capability is absent. The current stable application state remains active.
- **Integrity failure**: bytes, persistent state, ownership, transaction boundaries, or security guarantees are no longer trustworthy.
- **Terminal fault**: consistency cannot be maintained and no atomic rollback or stable return path exists.

## Runtime rules

1. Production failures never use `evidence-required` as a failure code, launch gate, session terminal reason, or user-facing error.
2. Every evidence gap reached by a valid action has one explicit product-semantic identity. The action follows that behavior and may emit an internal evidence notice.
3. A product semantic may not be described as original behavior. Reverse evidence continues to identify which behavior is reconstructed.
4. Required resource absence blocks only the requested action. It does not clear editor state, mutate the current project, or open a half-prepared player.
5. Corrupt bytes, unsafe paths, digest mismatches, broken ownership, non-atomic persistence, and unrecoverable backend state remain typed failures.
6. A running session ends as a terminal fault only when it cannot continue consistently and cannot atomically return to a stable host state.
7. Normal duplicate input, late events, field order, plain-versus-frozen objects, and serialization round trips are not integrity failures.
8. Tolerance never means silent/default/nearest resource substitution, fabricated original-game effects, unbounded numeric repair, or partial transaction commit.

## Product-semantic registration

A product semantic must record:

- a stable `productSemanticsId`;
- the valid trigger;
- the state transition or visible result;
- whether an evidence notice is emitted;
- the atomic rollback/return behavior;
- an executable behavior-level regression test.

Generic `ignore`, `continue`, or `fallback` rules are not sufficient unless the exact event class and owner are named. Examples include Auto non-control pointer consumption, nested Android Back returning to the parent Pause menu, and atomic landscape surface reconstruction.

## Failure scopes

| Scope | Allowed result |
| --- | --- |
| Evidence gap with a registered product semantic | Continue the action; internal notice only |
| Missing required resource/capability before ownership transfer | Action unavailable; retain current UI/state |
| Invalid or corrupt external bytes | Reject the current action; quarantine when applicable |
| Recoverable runtime/platform change | Rebuild, resume, or atomically return to host according to the registered product semantic |
| Internal invariant with complete rollback | Release the attempted generation and retain the prior stable owner |
| Unrecoverable consistency/security/ownership failure | Terminal fault with complete best-effort cleanup report |

Public Simulator request Schema 12 remains `{ chartData, presentation, config }`; diagnostics and resource identities do not become Public business fields.
