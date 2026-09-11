## Problem

<!-- What is wrong for a researcher or agent? Name the observable consequence. -->

## Change

<!-- What changed? Prefer domain vocabulary over implementation details. -->

## Controls

<!-- What nearby behavior must remain unchanged? Name important boundaries and counterexamples. -->

## User-visible CLI behavior

<!--
Required when a linked issue has the `domain model` label. Otherwise delete this section.

Use fictional research names and data, but run every command against a disposable database. Do not
invent or paraphrase output. If the CLI output intentionally does not change, keep both transcripts
and explain that boundary below.
-->

### Use case

<!-- In one or two sentences: who is doing what, and why the current answer is wrong or incomplete. -->

### Establish the state

<!-- Include every command needed to reach the relevant state. These commands must be pasteable. -->

```console
$ labkit ...
...
```

### Before this change

<!--
Most important: show the final command the user types, immediately followed by the exact output from
`main`. Do not use ellipses or annotations inside the transcript.
-->

```console
$ labkit ...
<current output>
```

### After this change

<!--
Run the same final command against the same established state using this branch. Show its exact
output. If the command itself must change, explain why under Contract boundary.
-->

```console
$ labkit ...
<new output>
```

### Contract boundary

- Changed:
- Intentionally unchanged:

## Verification

<!-- Exact commands and observed results. CI is not a substitute for the before/after transcript. -->

- [ ] Setup commands above are pasteable into a clean disposable database.
- [ ] “Before” was captured from `main`.
- [ ] “After” was captured from this branch.
- [ ] Both transcripts show the command and its output, not a prose description.

## Linked issues

<!-- Use `Closes #N` when this Pull Request completes the issue; otherwise state the narrower link. -->
