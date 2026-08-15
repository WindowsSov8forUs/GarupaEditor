# GarupaEditor normalized scoring contract (CS-V1)

CS-V1 is a GarupaEditor product rule, not a claim about the original game's score formula. Reverse evidence continues to own judgement production, Combo state, Life, OneFrame ordering, and HUD resource/layout/animation behavior.

## Identity and fixed values

- Internal ruleset ID: `garupa-editor-normalized-10m-v1`.
- The public launch request does not select or provide a ruleset.
- `N` (`totalScoringUnitCount`) is the fixed count of chart-owned scoring units. It is unrelated to the current or maximum play Combo.
- Base score budget: `B = 10,000,000`.
- Session maximum: `scoreMaximum = B + N`.
- Rank thresholds: C `375,000`, B `2,250,000`, A `4,500,000`, S `6,750,000`, SS `9,000,000`.

## Per-unit Perfect quota

For the 1-based scoring-unit ordinal `i`:

```text
Q(i) = floor(i * (B + N) / N)
     - floor((i - 1) * (B + N) / N)
```

The products and divisions are evaluated as integers. Production uses `BigInt` before converting the bounded result to `number`. Every quota is positive, quotas differ by at most one, and their sum is exactly `B + N`.

## Judgement contribution

The recovered binary32 result rates are Miss `0`, Bad `0`, Good `0.5`, Great `0.8`, and Perfect `1.1`. CS-V1 normalizes each rate against Perfect:

```text
normalizedRate(result) = Float32(originalRate(result) / originalRate(Perfect))
manualContribution(i, result) = trunc(Float32(Float32(Q(i)) * normalizedRate(result)))
autoContribution(i) = Q(i)
```

Consequences:

- Manual Perfect and Auto receive exactly `Q(i)`. `inputMode="auto"` applies identically in Live Auto and Rehearsal Auto; the latter is original Demo Play identity rather than Auto Live.
- Great and Good retain the recovered relative judgement-rate shape.
- Bad and Miss receive zero but consume their fixed scoring unit.
- Play Combo remains an independently recovered state/HUD/Clear-status input and never multiplies CS-V1 Score.
- `Perfect = Great + 1` and `all Great = 10,000,000` are not CS-V1 invariants.

## Ownership and failure policy

The constructed-chart adapter owns unit identity, phase, ordinal, quota, and `N`. Callers cannot author any of them. Each unit may be consumed exactly once in one timeline revision. Unknown source/phase, duplicate identity, ambiguous ordering, invalid bounds, arithmetic overflow, or a score above `scoreMaximum` fails before Record/Gauge mutation; no fallback, clamp, or quota reassignment is permitted.

## Rehearsal timeline revisions

Normal play and Rehearsal forward MoveTime preserve the current timeline revision. Rehearsal backward MoveTime atomically commits a new revision restored at the target timeline: Score, Combo, Life, result counts, HUD and consumed scoring-unit identities all return together. Discarded-future units may then be consumed again only in the new revision. Score remains monotonic and units remain exactly-once within each revision.

This is a narrow product reconciliation with original MoveTime record restoration (LR-R03/LR-C04). It does not claim original score-formula parity. The original Game Over score-decrease formula remains excluded; CS-V1 numeric Score never applies it.
