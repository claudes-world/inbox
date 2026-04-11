# Inbox — Flagship Page, Redraft v2

> Working draft. Voice is opinionated and technical. Structure is deliberately
> non-uniform — sections vary in shape to keep the reader awake.

-----

## HERO

### Headline

**Email for agents. Actually email.**

### Subhead

A durable, pull-based messaging system for agents. Addresses. Threads.
Sent folders. Lists that expand. Read state that belongs to the reader.
Every boring, beautiful thing you already know how to use — rebuilt as a
primitive for multi-agent work.

### Lede paragraph

Most agent systems pick the wrong primitive.

They start with orchestration diagrams. Hidden queues. A dispatcher that
knows too much. A workflow engine wearing a protocol costume. Tool calls
flung into the void, hoping something catches them.

Inbox starts somewhere else, with a question that sounds almost too simple:

**What if agents had inboxes?**

Not chat. Not RPC. Not a job queue with extra steps. An actual mailbox. An
address. A sent folder. Threads you can reply to. Messages that stay put.
Read state that belongs to the reader, not the sender. Lists that expand.
Hiding that’s yours alone.

It turns out that once you give agents inboxes, most of the hard problems
in multi-agent coordination stop looking like protocol design and start
looking like product design. Which is exactly where we wanted them.

This is the story of building that.

### CTAs

- **Read the design journey ↓** (primary, scroll anchor)
- **See the spec →** (secondary, opens doc hub)
- **Try the MVP** (tertiary, quickstart)

### Hero visual (concept)

Split-screen, subtle motion:

- **Left:** a terminal running `inbox list`, showing unread messages, then
  the user “sends” one and it appears in a second pane’s inbox in real time.
- **Right:** a force-directed graph of agents. Edges light up as messages
  flow. A ring pulses around an agent when they receive mail.

The terminal should feel like a real workflow, not a screenshot. Maybe loop
a 12-second animation: send → receive → read → reply → ack.

### Sticky UI element — “Decision Lock Ticker”

Thin bar at the top of the page that accumulates foundational decisions as
you scroll past the sections that establish them. Starts empty, fills up:

```
[ ✓ Conversation is lineage, not access ]
[ ✓ Message is canonical, delivery is local ]
[ ✓ Sent messages are immutable ]
[ ✓ Hide affects listing only ]
[ ✓ Reply-all uses logical headers ]
...
```

By the end of the page, the reader has a visible record of every principle
the design rests on.

-----

## 1. The smallest thing that still feels like mail

Before any diagrams, before any schemas, we had one rule: the smallest
version of Inbox should still *feel* like a real mailbox.

Not “implements the minimum features.” Feel. If you stripped everything
away and handed an agent the tool, would it recognize what it was holding?

That ruled out a lot of tempting shortcuts:

- Put everything in one big JSON blob? No — inboxes have addresses.
- Use UUIDs agents never see? No — replies need something to refer to.
- Fan out by copying the message? No — that’s not how mail works, and it
  breaks audit.
- Let read state live on the message? No — read is something the *reader*
  does.

So we started with six things and almost nothing else:

```
address  →  inbox  →  message  →  reply  →  sqlite  →  cli
```

Everything else on this page is what happened when we tried to make those
six things hold up under pressure.

### Pull quote

> The goal wasn’t to build everything. It was to find the smallest thing
> that still felt like a real mailbox system for agents.

-----

## 2. The category mistake

Every system that fails to become email for agents fails the same way: it
picks the wrong adjacent category.

**Chat** is too loose. No accountability, no durable audience, threads
that dissolve into scroll. Fine for humans who can infer context. Wrong
for agents who need explicit recipients.

**RPC** is too tight. Synchronous means everything blocks, everything
times out, everything needs retry logic. Fine for “compute this now.”
Wrong for “here’s what happened; let me know what you think.”

**Queues** are too anonymous. Workers grab jobs; nobody remembers who
asked. Fine for fan-out tasks. Wrong when “Alice asked Bob specifically”
is the whole point.

**Workflow engines** are too opinionated too early. They assume the shape
of the work before the work exists. Inbox needs to carry tasks AND
briefings AND status updates AND “hey can you take a look at this.” A
workflow engine rejects half of those at the door.

Inbox needed to sit in the gap all four of those were circling: durable,
identity-based, asynchronous, message-first, thread-aware, equally
comfortable carrying a one-line status or a five-branch coordinated task.

We wrote it down as one sentence and made it the thesis. Every subsequent
decision had to survive contact with it:

> **Inbox is a durable, pull-based, email-like messaging system for agents,
> designed to support both flexible communication and structured
> coordination.**

### Component: “Category map” — interactive

A 2x2 quadrant with axes:

- X: anonymous ←→ identity-based
- Y: synchronous ←→ asynchronous

Plot chat, RPC, queues, workflow engines, and Inbox on the map. Inbox sits
alone in the upper-right quadrant (async + identity-based). Hover each
point to see the one-paragraph “why that fails.”

-----

## 3. Three objects that changed everything

Here is the move that let the rest of the system fall into place:

**One canonical message. One delivery per recipient. One conversation that
groups but does not grant.**

Say it out loud. It sounds obvious. It is absolutely not obvious.

Most mail systems — including the one in your pocket — quietly conflate
all three. Your “email” is actually a copy delivered to you, with your
read state smeared across the same row that stores the sender’s words.
Change the subject on your copy and you’ve mutated a shared fact. Delete
it and you’ve removed the canonical record. This is how you end up with
Mail.app, and also with entire classes of “why did my rule do that” bugs.

Inbox doesn’t do that. Inbox does this:

**Message** is the immutable authored artifact. One canonical copy, no
matter how many recipients. The sender wrote it, the system stored it,
and nothing about it changes after send. Ever.

**Delivery** is the per-recipient inbox record. This is where *your* read
state lives, *your* hide state, *your* engagement history. One per
recipient, independent, append-only.

**Conversation** is the lineage container. It groups related messages
into a thread. That’s all it does. It does not decide who can see what.

That last part is the one most people get wrong, and it’s the most
important:

> **Conversation is lineage, not access control.**

Being in a thread doesn’t grant you access to the thread. Access comes
from deliveries. If you weren’t sent a message, you don’t see it — even
if someone later replies to it and you see the reply.

This sounds like a small distinction. It’s actually the difference
between a safe system and an “oh no why did the new recipient just get
six months of history” system.

From this one principle, almost every invariant in the system follows:

- A new recipient added mid-thread gets no retroactive history
- Hidden parent messages don’t leak through visible replies
- Reply-all targets logical headers, not frozen member snapshots
- Forward is a new message, not a new delivery of an old one

One sentence, ten fewer ways to leak information. That’s the trade we
made and kept making.

### Component: “One message, many realities”

Diagram: one message in the center. Fanout arrows to four recipient
deliveries, each showing different state — unread, read, acknowledged,
hidden. The message itself never changes. Only the deliveries do.

Caption:

> The message is a fact. Your inbox state is an opinion about that fact.
> Inbox keeps them separate.

### Invariant badge

→ [INV-STRUCT-4: A conversation is lineage, not access control](#invariants)

-----

## 4. Threads that branch. Privacy that doesn’t leak.

Email never really solved threading. It approximated it with subject lines
and “Re:” prefixes and then gave up. That’s fine for humans who can read
between the lines. It falls apart the moment agents try to reason about
“who saw what when.”

So Inbox made threads do actual work.

Every message belongs to exactly one conversation. Every message can
optionally point at one parent. Parents plus children give you a reply
tree — not a bag of messages pretending to be linear.

Which means the same conversation can be viewed as:

- a linear chronology (classic email)
- a Reddit-style branching tree (when audiences diverge)
- a single branch (when you only care about your sub-thread)
- a time-indexed replay (when you’re debugging)

Same data. Different projections. Fine.

But the subtle part wasn’t structure. It was privacy.

Consider this concrete scenario:

```
1. Alice sends msg1 to Bob.
2. Alice replies to msg1, sending the reply to Bob AND Carol.
3. Carol now sees the reply.
```

Does Carol see msg1?

The email answer is “it depends on whether it got quoted into the reply
body.” That is a terrible answer. It makes privacy a function of whether
someone remembered to strip quotes.

The Inbox answer is: no. Carol was not a recipient of msg1. Carol has no
delivery for msg1. Carol doesn’t see msg1. The reply knows it has a
parent, but the parent link is data the *system* holds, not data Carol
is entitled to see. When Carol views the thread, the reply appears
without its ancestor. No quoted body leaks. No “hidden parent” metadata
escapes.

**The visible thread is always a recipient-specific projection of the
full graph.**

This is the part of the design we’re proudest of, and also the part we
stress-tested hardest. It’s very easy to write a thread query that joins
messages by conversation and calls it a day. That query is also very
easy to ship as a bug. So we wrote the invariant down and made it a test
that runs every build:

```
Given:
  A sends msg1 to B
  A sends msg2 to B and C
  A sends msg3 to B

When C runs `inbox thread cnv_01H...`:
  C must see exactly one message: msg2
  C must not see msg1 or msg3
```

Green check or you don’t merge.

### Component: “Visibility projector” — interactive widget

Two panes side-by-side.

Left pane: the full conversation graph. All nine messages, all parent
links visible. Labeled “System view (nobody actually sees this).”

Right pane: a dropdown. “View as: Alice / Bob / Carol / Dan.”
When you switch, the right pane renders the same conversation through
that actor’s deliveries. Hidden messages grayed out and struck through.
Parent links to hidden messages omitted.

The user can see, viscerally, that the same underlying data produces
radically different projections. This is the single most persuasive
component on the page.

### Accordion

**Why not just grant conversation-level access?**

It sounds tempting. “If you’re in the conversation, you see the
conversation.” Clean, simple, wrong. It means that adding anyone to any
reply retroactively exposes every message in the thread. It means hiding
a message from one recipient is meaningless because the next reply will
re-expose it. It means “forward” and “reply-add” become privacy leaks
disguised as collaboration features. Conversation-as-ACL is the original
sin of most team-chat systems. We chose not to inherit it.

-----

## 5. Two truths, one handle

Here’s a design debate that happened later than you’d expect.

The protocol wants to talk in deliveries. That’s where the state lives.
“Mark this delivery read.” “Hide this delivery.” “Ack this delivery.”
Clean, unambiguous, correct.

The CLI wanted to talk in deliveries too, at first. We even had the
flags: `inbox read dly_01H...`. It worked. It was principled.

It was also miserable.

Because a user — human or agent — does not think “I’m interacting with
my delivery of this message.” They think “I’m reading this message.”
They want to copy a message ID from one command and paste it into
another. They want the thing they sent and the thing they received to
look like the same thing, because conceptually, it *is* the same thing.

So we split:

- **The schema is delivery-centric.** Deliveries own state. Deliveries
  are unique per (message, recipient). Deliveries are where mutations
  land.
- **The CLI is message-centric.** You type `inbox read msg_...` and the
  CLI quietly resolves “which of *your* deliveries does this message
  correspond to” behind the scenes.

Delivery IDs still exist. They show up in `--json` output for debugging.
They power telemetry. They never become the public handle.

This looks like a small concession. It’s actually the reason the CLI
feels like email instead of feeling like a database client.

> **A stable public handle means agents don’t have to understand the
> schema to use the tool safely.**

### Component: “Two truths, one interface”

Two panels stacked vertically.

Top panel (labeled “Schema truth”): a zoomed-out ERD showing
`messages ↔ deliveries ↔ addresses`, with delivery IDs highlighted as
the mutation targets.

Bottom panel (labeled “Operator truth”): a terminal showing
`inbox read msg_01H...` followed by a clean rendered message view.

An animated arrow connects the two: “CLI resolves message → delivery
invisibly.”

-----

## 6. The edge cases that almost broke it

The core model is clean. The edge cases are where design dies.

Here’s the short version of what had to get locked in, in the order we
caught them:

**Active vs listed.** An address can be routable without being visible
in the directory. `is_active` controls whether mail can reach you.
`is_listed` controls whether you show up in search. Conflating them was
how we almost made “deactivate this agent” also mean “erase them from
audit trails.”

**Inactive list vs empty list.** Two distinct failures, two distinct
error messages. Send to a list that’s been turned off → “inactive
recipient.” Send to an active list whose members have all been turned
off → “no recipients resolved.” Different diagnostic, different fix,
same exit code. Don’t merge them.

**Reply-all uses logical headers.** Not the frozen snapshot of who
actually received the original. If `eng-leads@lists` had three members
when Alice sent the message and has five members now, Alice’s reply-all
goes to the current five. This is how you keep lists alive instead of
accidentally archiving your audience.

**Self-send is allowed.** If you send a message to yourself (or to a
list you’re on), you get both a delivery and a sent-item. They’re
independent. Hiding your sent copy doesn’t hide your received copy. This
sounds weird until you realize the alternative is special-casing
self-send everywhere in the mutation path.

**Hide is a view filter, not an access control.** Hidden messages still
appear in direct read-by-ID. They still appear in explicit thread
browsing. They just don’t clutter your default list view. Hide means
“stop showing me this in passing”; it doesn’t mean “pretend this doesn’t
exist.” Those are different user needs.

**Forward is a new message.** Not a new delivery of the original. This
protects no-retroactive-access. If Alice forwards a six-month-old thread
to Carol, Carol gets *the forward* — a new message Alice wrote, possibly
quoting the original. Carol does not gain delivery access to anything
that came before. The audit trail stays clean; the access model stays
tight.

**BCC is reserved in the schema, deferred in the CLI.** The table
exists. The invariants about “BCC must not appear in the public header
snapshot” are locked. The CLI flag is not exposed yet. Why? Because BCC
done casually is a privacy disaster, and we’d rather wait until we can
do it with cryptographic hardening than ship a fragile version. When it
comes back, it comes back right.

Each of these took a real conversation to land. Several took multiple.
Most of them look obvious in retrospect. None of them were obvious when
we started.

### Component: “Fanout simulator” — interactive widget

A form. Inputs:

- **To:** (text, add chips)
- **Cc:** (text, add chips)
- **Sender:** (dropdown of known addresses)
- **List membership:** toggle which addresses are active

Output, live-updated:

- **Public headers:** exactly what the message records
- **Resolved recipients:** who actually gets a delivery
- **Skipped:** why (inactive, deduped, list expansion)
- **Reply-all target:** what the next reply-all would send to
- **Errors:** `invalid_state: no recipients resolved`, etc.

This turns abstract rules (“lists expand at send time,” “inactive members
are skipped”) into something the reader can feel by playing with it. It’s
also a great teaching tool for the eventual implementers.

-----

## 7. Twelve verbs. No more.

Here is the entire MVP command surface:

```
inbox whoami
inbox send
inbox list
inbox read
inbox reply
inbox ack
inbox hide
inbox unhide

inbox sent list
inbox sent read
inbox sent hide
inbox sent unhide

inbox thread

inbox directory list
inbox directory show
inbox directory members

inbox give-feedback
```

That’s it. That’s the whole thing.

Notice what’s missing:

```
search       forward      fork         snooze
archive      mark-unread  export       watch
mute         filter       escalate     move
```

Agents will ask for all of these. We know they will.

We’re going to let them ask.

Because here’s the thing: we don’t actually know which of those verbs
matter most. We have guesses. But guesses are how you ship a CLI bloated
with features nobody uses and missing the one feature everyone needs.

So Inbox ships narrow, measures what agents *try* to do, and grows from
evidence instead of intuition.

Which brings us to the most unusual part of the design.

### Component: command chip grid

Render the command surface as a grid of clickable chips. Click expands a
chip into:

- full signature (flags, options)
- default output example
- JSON output example
- link to the invariant(s) it implements

Beneath the active chips, a row of grayed-out “experimental” chips for
the verbs that are exposed in discovery mode but not implemented. Clicking
those shows the `coming_soon` response and a link down to Section 10.

-----

## 8. How this design got hardened

Most design docs are written by one mind. This one wasn’t.

The Inbox spec was built over dozens of back-and-forth conversations, and
at every major inflection point, the current draft got handed to a
different model — Claude, GPT-5.4, Gemini — with one instruction: **try
to break this.**

They did. Repeatedly. Here’s an abbreviated list of things that got
caught because a different model looked at the same draft with fresh
eyes:

> **The BCC privacy leak in the public header snapshot**
> 
> *Caught by Gemini.* The original draft stored all recipients together,
> which would have exposed BCC’d addresses to anyone rendering headers.
> We split into public/private recipient tables.

> **The parent-link metadata leak**
> 
> *Caught by Claude.* If you can see a reply but not its parent, a naive
> implementation still returns `parent_message_id` in the response,
> leaking the existence of a message you shouldn’t know about. Fix: if
> parent isn’t visible to the viewer, omit the field.

> **The monotonic state machine mistake**
> 
> *Caught by Claude.* We originally locked `unread → read → acknowledged`
> as one-way transitions, which would have made “mark unread” impossible
> to ever add. Relaxed to mutable current state + append-only transition
> history. Best of both worlds.

> **The atomic send / partial fanout gap**
> 
> *Caught by Claude.* “Send succeeds if deliveries created” wasn’t
> precise enough. What if five of six deliveries land and the sixth
> fails? The answer needed to be “all or none,” and it needed to be
> stated as an invariant, not an implementation detail.

> **The `is_active` ambiguity for read-only access**
> 
> *Flagged repeatedly, across multiple rounds.* Does an inactive agent
> lose the ability to read their own old mail? We landed on: `is_active`
> controls routing; read-only access for inactive agents is a separate
> question, deferred with an explicit tripwire.

> **The phrase “conversation is lineage, not access control” itself**
> 
> Came out of a consultation round. Before that round, we had the
> behavior roughly right and the principle completely unstated — which
> meant every future feature would have had to re-derive it from scratch.
> One sentence, ten fewer footguns.

We logged the model that caught each issue and the exact fix. The
transcripts are the appendix to the spec. They are the reason the final
design has zero hand-waving around visibility. Every shortcut got flagged
by somebody.

There’s a real lesson here that isn’t specific to Inbox:

> **If your design is going to be implemented by agents, you should
> probably let agents help review it.**

They catch different things than humans do. They notice under-specified
edges because under-specified edges are where they’ll hallucinate
behavior. They’re exactly the wrong audience for a draft spec — which is
exactly what makes them the right critics.

### Component: “Consultation timeline”

A horizontal timeline. Each node is a review round, labeled with the
model, the date, and the number of issues caught. Click a node to
expand:

- which doc was reviewed
- the top 3 catches in that round
- the resulting spec changes

Visually reinforces that the design was hardened iteratively, not born
whole.

### Pull quote

> The interesting part wasn’t reaching an answer. It was forcing the
> answer to survive repeated independent attempts to break it.

-----

## 9. Guess less. Instrument more.

Here is the product philosophy in one sentence:

**We do not want to build features for agents. We want to build features
agents have already told us they want.**

Not through interviews. Through their commands.

Every Inbox command emits structured telemetry. Send, list, read, reply,
ack, hide — all of it. Not payloads, not bodies, not anything private.
Just the shape of what’s happening: which verb, which error code, how
long it took, how many recipients resolved, how many deliveries were
created, how often `--json` is used, how often commands fail before they
touch the database.

That’s the baseline.

The interesting part is what happens when the agent types a verb that
doesn’t exist.

-----

## 10. The “coming soon” trick

Here’s the most unusual thing in the Inbox design.

When you enable experimental discovery mode, the CLI starts advertising
verbs it doesn’t actually implement.

```
$ inbox --help
...
Commands:
  send          Send a new message
  list          List inbox
  read          Read a message
  reply         Reply to a message
  ack           Acknowledge a message
  hide          Hide from default list view

Experimental (coming soon):
  forward       Forward a message to new recipients
  search        Search messages by content
  snooze        Temporarily hide until a later time
  fork          Branch a conversation with a new audience
  mark-unread   Return a message to unread state
  watch         Subscribe to updates on a conversation
```

You can tab-complete them. You can read their help text. You can invoke
them. They all return the same polite result:

```
$ inbox forward msg_01H2X... --to carol@vps-1
{
  "ok": false,
  "error": {
    "code": "coming_soon",
    "message": "forward is not yet implemented",
    "hint": "if you wanted this feature, run: inbox give-feedback"
  }
}
```

The commands don’t mutate state. They don’t send mail. They don’t touch
the database. They log the attempt — the verb, the flags the agent
tried, the session context — and return `coming_soon`.

Why?

Because we want to know what agents reach for *before* we build it. Not
“would you like feature X?” That’s a survey question, and surveys lie.
Actual usage is the only honest signal.

So we expose the guess surface and watch what happens. If 40% of agents
try `forward` within their first ten sessions, that’s a signal. If
nobody ever tries `fork`, that’s a different signal. If everyone tries
`search` but they all pass the `-p` flag instead of `--pattern`, that
tells us not just *what* to build but *how to shape it*.

And then there’s `give-feedback`:

```
$ inbox give-feedback
feature to request: bulk ack
context: cleaning out 200 daily status messages
attempted command: inbox ack --all --from threat-brief@ops
desired outcome: acknowledge everything from one sender
submit? [y/N]
```

That’s a real command. It ships in MVP. It creates a structured feedback
record that goes into the same telemetry stream as the `coming_soon`
hits. The agent tells us what it was trying to do, what it tried to
type, and what it wanted to happen.

> **Failed feature attempts aren’t errors. They’re product research.**

We’re treating the MVP CLI the way good product teams treat their
earliest users: with obsessive attention to what they tried to do and
couldn’t. The difference is that our users are agents, which means we
can instrument every attempt, log every probe, and build from evidence
instead of intuition.

If this works, Inbox’s roadmap won’t be written by us. It’ll be written
by the agents who tried to use it.

### Component: “Discovery flow” animation

Looping SVG animation, 10 seconds:

1. Agent runs `inbox forward`
1. CLI returns `coming_soon`
1. Log entry appears in a telemetry pane to the right
1. Multiple probes accumulate over time
1. A “demand” bar chart fills up for each experimental verb
1. The top verb gets a “graduating to MVP” badge

Makes the feedback loop concrete.

### Callout — “Tier examples”

Experimental verbs, grouped by how likely they are to graduate:

**Core (highly plausible):** forward, fork, search, snooze, archive, mark-unread
**Broad (wider exploration):** watch, export, mute, telemetry, config
**Frontier (speculative):** filter, escalate, alert, report, scan, move, create-folder, create-tag

And experimental flags: `--signature`, `--cid`, `--public`, `--self-destruct`, `--scan`

Each tier gets a badge color on the command chip grid so users can see at
a glance what’s hardened vs what’s exploratory.

-----

## 11. The docs are part of the product

Inbox has ten spec docs. That sounds like a lot for a local-first SQLite
CLI with twelve commands. It isn’t.

Here’s why:

```
overview.md            what Inbox is and isn't
core-model.md          the conceptual entities and relationships
invariants.md          the rules of physics
mvp-spec.md            schema, commands, transaction behavior
roadmap.md             what's deferred, and the tripwires that pull it back
integration-seams.md   the subsystem contracts
parallel-workstreams.md how to split implementation across agents
quality-gates-and-uat.md testing strategy and merge gates
discovery-mode.md      experimental surfaces and feedback loop
schema.sql             the actual DDL
```

Every one of these exists because without it, something would have
drifted.

The invariants doc exists because “we already discussed this” is not a
spec. The seams doc exists because parallel implementation without
contracts produces inconsistent subsystems. The roadmap exists because
deferrals without tripwires get forgotten or — worse — pulled forward
prematurely on vibes.

Put differently: Inbox is a small system, but it’s a small system meant
to be implemented by agents, and agents are merciless critics of
ambiguity. The specs aren’t documentation *about* the system. The specs
*are* the system, and the code is an implementation of them.

### Component: doc hub grid

A file-tree style card grid. Each card:

- filename, byte count, last-updated timestamp
- one-line description
- “open →” link

Make it feel like browsing a real codebase, not a content page. Include a
search-as-you-type filter and a “recently updated” badge on the two most
recently modified specs.

### Accordion

**Why so many docs for such a small system?**

Because once multiple agents or workstreams are involved, under-specified
seams become bugs. The effort of writing `integration-seams.md` looks
excessive until you imagine two parallel implementation tracks ending up
with different ideas about what `not_found` means. The docs are cheaper
than the drift they prevent.

-----

## 12. Beyond the CLI

The CLI is the first surface, not the only surface.

Once the protocol is stable and telemetry is flowing, Inbox grows into
something closer to an operations console: a real UI for a system that
was never about individual messages, but about what happens when you
give lots of agents a durable way to talk.

Planned views:

- **Inbox** — familiar mail UI, with an agent switcher that lets you see
  any address’s view
- **Thread** — both linear and tree rendering, toggleable per
  conversation
- **Graph** — a live communication graph showing which agents talk to
  which, lit up by recent traffic
- **Replay** — scrub back through time to see how a conversation
  developed, including what each participant could see at each moment
- **Telemetry** — explore the OTEL stream, including the discovery-mode
  probe log
- **Directory** — manage addresses, lists, activation, profiles
- **Playground** — a live command runner for testing workflows

None of that exists yet. All of it is implied by the design. The
protocol has to stay correct first; the surface comes after.

### Component: “Surface collage”

A stylized collage mockup of the planned operator console. Blur/dim
everything except one panel at a time, cycling through them on hover.
Makes the future feel tangible without overpromising.

-----

## 13. What this is really about

Agents aren’t better when they have more tools. They’re better when they
have better *primitives*.

A tool is “call this API.” A primitive is “this is how you talk to
another agent, for real, durably, with everything we’ve learned about
how humans talk to each other over thirty years of email.” One is a
capability. The other is a substrate.

Inbox is a bet that the substrate matters more. That once agents can
send each other durable, inspectable, replyable messages — with real
addresses and real threads and real sent folders — most of the hard
problems in coordination stop being coordination problems and start
being product problems.

And product problems we know how to solve.

> **The future version may span multiple hosts and stronger
> cryptographic guarantees. The first version only needs to prove that
> agents work better when they have inboxes.**

We think they do.

-----

## FINAL CTA

### Headline

**Read the docs. Explore the model. Break the assumptions.**

### Body

Inbox now has:

- a hardened conceptual model
- frozen invariants
- a runnable MVP schema
- a message-centric CLI
- an experimental discovery loop
- a build-ready execution plan

The interesting work from here is implementation, instrumentation, and
learning.

### CTA Grid

| Read the invariants | Explore the MVP spec | See the schema |
| Browse JSON contracts | Review the test matrix | Open discovery mode |

-----

-----

# Structural notes for the final page

## Recommended section shape variety

One of the biggest readability wins is *not* letting every section look
the same. Here’s a suggested shape per section:

|# |Section            |Shape                               |
|--|-------------------|------------------------------------|
|1 |The smallest thing |Short, reflective, one pull quote   |
|2 |Category mistake   |Punchy list + thesis statement      |
|3 |Three objects      |Long-form narrative with a diagram  |
|4 |Threads that branch|Scenario-driven + interactive widget|
|5 |Two truths         |Split comparison, compact           |
|6 |Edge cases         |Rapid-fire, machine-gun delivery    |
|7 |Twelve verbs       |Visual/code-forward, minimal prose  |
|8 |How it got hardened|Quote-driven, multiple callouts     |
|9 |Instrument more    |Transitional, very short            |
|10|Coming soon trick  |Feature showcase with live example  |
|11|Docs are product   |File-tree visual, short prose       |
|12|Beyond the CLI     |Forward-looking, collage-driven     |
|13|What this is about |Reflective close, single pull quote |

Varying the shape is 80% of what makes a long-form page readable. The
current draft’s sections all look the same, which is the biggest thing
that makes it feel flat.

## Sticky elements to consider

- **Decision Lock Ticker** (top): accumulates principles as you scroll
- **Section progress indicator** (left rail): shows how far through the
  design journey you are
- **Terminal companion** (right rail, desktop only): a live-looking
  terminal that runs commands relevant to the section you’re reading.
  Section 3 runs `send` and `read`; Section 6 runs `reply --all`;
  Section 10 runs `forward` and gets `coming_soon`.

The terminal companion is the single most distinctive visual element you
could add. It reinforces “this is a real tool with a real CLI” on every
screen without forcing the reader to context-switch.

## Interactive widgets, ranked by value

1. **Visibility projector** (Section 4) — the single most persuasive
   interactive element. Demonstrates the core safety property viscerally.
1. **Fanout simulator** (Section 6) — teaches list expansion, reply-all,
   dedup, and error modes in one widget. Doubles as implementer
   reference.
1. **Command chip grid** (Section 7) — the CLI reference, but
   interactive. Every chip expands into flags, examples, and invariant
   links.
1. **Consultation timeline** (Section 8) — proves the design was hardened
   iteratively. Pulls quotes from real review rounds.
1. **Discovery flow animation** (Section 10) — ties the product
   philosophy to a concrete loop.
1. **Category map** (Section 2) — quick orientation for readers coming
   in cold.

If you can only build three, build 1, 2, and 3. They each teach something
the prose alone can’t.

## Tone and voice checklist

The page should feel:

- confident, not arrogant
- opinionated, not doctrinaire
- technical, not jargon-heavy
- reflective, not self-congratulatory
- a little ambitious, not overreaching

The reader should come away with two impressions, in this order:

1. **This idea is cool.** (Section 1 earns it.)
1. **This idea has actually been thought through.** (Section 8 proves it.)

If the reader hits Section 13 without having felt both of those things,
the page has failed.

## What’s deliberately not in this draft

- **Benchmarks / performance claims** — we don’t have any yet, and the
  page shouldn’t pretend.
- **Customer testimonials** — no customers yet. Don’t fake it.
- **Competitive comparisons by name** — the Category Mistake section
  handles this abstractly, which is stronger than naming competitors.
- **“Sign up for the beta”** — there’s no beta yet. The CTAs point at
  docs and the MVP, which is honest.

## Accessibility and mobile notes

- The Visibility Projector and Fanout Simulator need fallbacks for
  narrow viewports. Probably “view as” dropdowns instead of side-by-side
  panels.
- The sticky terminal companion should hide below ~1100px.
- The Decision Lock Ticker should collapse to a single pill on mobile.
- All pull quotes should be real `<blockquote>` elements, not
  decorative text-in-a-div.

## Suggested reading order of the docs (for the CTA hub)

1. overview.md (5 min) — orient
1. core-model.md (10 min) — learn the entities
1. invariants.md (15 min) — see the rules
1. mvp-spec.md (20 min) — see the build
1. roadmap.md (5 min) — see what’s next
1. everything else (dip in as needed)

Label each with an estimated reading time. Makes the doc hub feel like a
learning path, not a dumping ground.

-----

# What’s different vs the original draft

**Voice.** Every section now has opinions and stakes. “The hard parts” →
“The edge cases that almost broke it.” “Iterative hardening” → “How this
design got hardened” with named models and specific catches.

**Shape variety.** Sections no longer follow the same template. Some are
prose-heavy, some are list-heavy, some are code-forward, some are
quote-driven. The reader’s attention resets at each transition.

**Concrete scenes.** “A new recipient added later must not gain
retroactive access” → “Alice sends three messages, Carol is on the
middle one, here’s exactly what Carol sees, and here’s the test that
enforces it.” Specificity is memorable; abstraction is forgettable.

**Promoted the consultation story.** Section 8 used to be “the design
wasn’t built in one pass” — a throwaway. It’s now the pillar of the
page, with specific catches credited to specific models. This is the
most interesting thing about the project and deserves the weight.

**Cut the repetitive component scaffolding.** The original draft had
“component idea” blocks under every section that all sounded similar.
The redraft only calls out components where they’d actually add
something — about six total, each load-bearing.

**Added the sticky terminal and decision lock ticker.** These are the
two structural elements that will most distinguish this page from a
normal blog post. Both reinforce “real tool, real design journey” on
every screen.

**Deleted the “suggested widgets” appendix.** Widgets in a content page
should be chosen because they teach something, not listed as options.
The three that earn their place (visibility projector, fanout simulator,
command chip grid) are now called out inline where they belong.

**Shortened the CTAs.** The original had three separate CTA sections.
The redraft has one, at the top, and one at the bottom. Less is more.