
# Feature: MCP Server - Agent Facing Toolset

## User to ChatGPT

Merged into `main`.

\~200 ish commits.
More markdown ceremony, but not *quite* as bad as Bonsai.
Work generating side-quests generating work... almost as if labkit needed labkit to track it all.


## ChatGPT to User

That is probably the most useful signal to come out of the whole build.

The failure mode is no longer “we cannot represent the research process.” It is closer to:

> the machinery for explaining why the research is in its current state is itself generating enough state that humans and agents need machinery to explain why the machinery is in its current state.

Which is, inconveniently, a very good argument for LabKit.

The interesting test now is not another ontology exercise. It is dogfooding LabKit on LabKit, but narrowly. I would not migrate two hundred commits and every journal entry. I would start with the things that created the most recursive work:

- open design questions and their discriminators
- review findings that spawn follow-up work
- decisions that close or narrow those findings
- known boundaries versus actionable defects
- tasks that exist only because another task exposed something
- “do not build this yet” conclusions and what would reopen them

That is precisely where the Markdown became a coordination mechanism rather than documentation.

If LabKit can absorb those without recreating all the ceremony in structured form, that is strong evidence the control plane is earning its keep. If using LabKit to track LabKit still requires a parallel `TASKS.md`, ledger, journals, session logs, prediction documents and wrap notes to explain what LabKit means, then the project has found its next product problem.

There is also a fairly brutal success criterion available now:

```text
Before dogfooding:
agent needs to read N markdown files to answer
"what should I investigate next, and why?"

After dogfooding:
agent asks LabKit and gets the same answer,
with the supporting chain and the things deliberately not being done.
```

Not “replace Markdown.” The prose is valuable because it preserves argument. The target is replacing duplicated state hiding inside prose.

And there is a nice irony in the side quests. The project spent a lot of effort distinguishing:

```text
new scientific work
new evidence about existing work
repair of the research process
repair of the machinery supporting the research process
```

Then the implementation itself started producing exactly those categories.

That makes LabKit itself a much harsher corpus than Bonsai was. Bonsai supplied the scientific complexity. LabKit now supplies the institutional complexity. If the same 13-noun model survives that too, I would trust it considerably more.

## User to ChatGPT

> The SDK and Zod are already dependencies, so the four tool schemas can be narrow and explicit.

I think a narrow and explicit mcp tool surface isn't ready for dog-fooding.

That was three days' work.

Was the objective of this branch fully completed?
What remains outstanding?


## ChatGPT to User

The feat/domain-consumer branch objective was completed in the narrow sense it actually defined for itself. It was not completed in the stronger sense of “LabKit is now ready to dogfood as an agent-facing research control plane.”

That distinction matters.

The original consumer-contract brief explicitly called itself a precursor. Its stated aim was to derive an ontology-blind contract, then implement a thin read surface and see where the existing model failed. It also explicitly limited itself to read-only pressure and warned that write-side concepts could not be strongly validated there. 

Against that objective, the branch did finish:

- cold Stage A / Stage B contract derivation;
- blinded synthesis and mapping;
- running-code vertical-slice probes;
- row Z resolved with durable decision time;
- AD and O resolved;
- F driven to a boundary rather than an invented lineage model;
- S ultimately refuted rather than producing an Actor noun;
- CLI implemented and hardened;
- MCP implemented over the read surface, now seven tools rather than four;
- MCP returns the whole structured report instead of reproducing the CLI’s lossy prose projection. 

So I would call `feat/domain-consumer` **complete as the consumer-read probe**.

I would not call it **complete as the dogfooding interface**.

The User's objection about a narrow explicit MCP surface is correct. Seven read tools are enough to test whether a consumer can interrogate the model. They are not enough for an agent to *participate in the research process*.

Right now MCP can essentially do:

```text
inspect current knowledge
explain support
inspect dependency impact
inspect enquiry status
inspect design history
inspect interpretation history
inspect reproduction
```

That is an observatory.

Dogfooding LabKit requires a cockpit.

The biggest outstanding piece is therefore not another read. It is the **agent-facing write/orchestration contract**. The domain already has a substantial `WriteSurface`, but exposing its methods one-for-one as MCP tools would probably recreate exactly the bureaucracy LabKit was meant to hide. The work now is to discover the smaller set of research actions an agent actually needs.

I would frame the missing product surface around interactions like:

```text
"I've noticed X. Capture it without pretending it's established."

"We should investigate Y."

"I ran this analysis against these inputs. Record what happened."

"This result matters now. Promote it, and record why."

"This check failed because the check itself was defective."

"This analysis should no longer support that interpretation."

"We're deliberately leaving this unresolved unless condition Z changes."

"Give me the bounded task I should perform next,
and tell me what evidence I need to return."
```

Those are qualitatively different from `known`, `why`, and `affects`.

There is another missing piece closely related to that: **position and navigation for an agent that does not already know identifiers**. The current read surface is quite good once the caller knows the proposition, enquiry ID, artefact or analysis it wants. Dogfooding will reveal whether an agent can enter a project cold and establish:

```text
what am I working on?
why does it exist?
what is blocked?
what is deliberately not being done?
what decision is waiting on evidence?
which work is actually ready?
what evidence would change the state?
```

That is where LabKit could begin replacing `TASKS.md` and ledger-scanning rather than merely answering questions about already-known objects.

There are also smaller, genuinely outstanding items in the current repo. `TASKS.md` still records the test-suite ceiling crossings as unresolved, although the teardown cascade and much of the provisioning cost have been fixed. It also has row AF open: execution input order is not represented, but it has not yet earned a change because no reader has demonstrated a confidently wrong answer from that absence. 

And there are several explicit non-tasks that should stay non-tasks unless dogfooding earns them: bitemporality, an instant on `EvidenceUnit`, and the established boundary rows. 

So I would partition the state like this:

| Area | Status |
|---|---|
| Cold consumer-contract experiment | complete |
| Thin researcher read surface | complete |
| CLI transport | complete |
| Read-only MCP transport | complete |
| Ontology pressure from this phase | complete enough to stop |
| Agent-facing write contract | **not done** |
| Agent orientation/navigation | **not really tested** |
| End-to-end LabKit-on-LabKit dogfooding | **not done** |
| Suite timeout/ceiling problem | unresolved, deprioritised |
| Row AF | open, needs discriminator |

The most important point is that I would **not extend the current seven-tool MCP by accretion**.

Three days produced a well-tested read adapter because the read contract was deliberately constrained. Dogfooding should now be a new probe with a different question:

> What is the smallest MCP surface through which a cold research agent can actually conduct one piece of LabKit development while LabKit itself preserves the why, dependencies, evidence and decisions?

That could easily result in fewer than 18 write tools, perhaps only a handful of compound research actions plus the existing reads.

And there is an unusually good first dogfood target sitting in front of you: use LabKit to manage the next piece of LabKit work, probably the MCP write/orchestration surface itself. If the agent still needs to maintain a parallel journal, ledger and `TASKS.md` to know what happened, that becomes the next demonstrated consumer failure rather than another speculative architecture discussion.