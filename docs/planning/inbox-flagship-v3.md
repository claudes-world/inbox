# Inbox — Flagship Page, Redraft v3

> Working draft. Voice is opinionated and technical. Structure is deliberately
> non-uniform — sections vary in shape to keep the reader awake.
> 
> **v3 changes:** concrete agent scenarios in §2, “Why we didn’t study A2A”
> sidebar, `user@host` foresight in §1, profile/directory collapse in §6,
> hidden-ACK near-miss in §7, fresh vs continuity reviewer insight in §8,
> active-feedback framing in §10, doc-count-as-diagnostic flip in §11,
> “Layers Locked” reframing of the sticky ticker.

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

### Sticky UI element — “Layers Locked”

Thin bar at the top of the page that fills up as you scroll, marking each
phase of reasoning the design passed through. Not “decisions accumulate” —
**layers locked**. Each phase reveals the next constraint:

```
[ ✓ Framing ]  [ ✓ Categories ]  [ ✓ Core objects ]
[ ✓ Threads ]  [ ✓ Invariants ]  [ ✓ Schema ]
[ ✓ CLI ]      [ ✓ Experimentation ]  [ ✓ Docs ]  [ ✓ Tooling ]
```

By the end of the page, the reader has watched the reasoning layers stack
in the same order they actually formed during the design. This isn’t just
a visual flourish — it’s the structural spine of the narrative. Inbox
wasn’t designed top-down from a grand plan. It was built layer by layer,
with each layer locking in before the next could start.

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

One detail from the first sketch that mattered more than it looked: the
addresses already had the `user@host` shape. Not `pm-alpha` but
`pm-alpha@vps-1`. We didn’t need hosts yet — the MVP runs on a single
machine. But we weren’t going to rebuild addressing when we eventually
did need them. This was the first instance of a pattern that shows up
everywhere in the design: **start small, but don’t lock the door behind
you.**

Everything else on this page is what happened when we tried to make those
six things hold up under pressure.

### Pull quote

> The goal wasn’t to build everything. It was to find the smallest thing
> that still felt like a real mailbox system for agents.

-----

## 2. One primitive, two jobs

Consider two agents on the same system.

The first is a threat-intel agent. Every morning, it sends a daily brief
to four ops agents. Nobody’s expected to reply. Nobody’s being tasked.
The message is just: “here’s what’s happening in the world; act on it if
you need to.” Pure broadcast. Pure communication.

The second is a manager agent. It sends a status request to three project
managers. Each PM is expected to reply. If a reply doesn’t come, there’s
an escalation path. There’s a deadline. Something is being asked of
somebody specific. Pure coordination.

Inbox has to carry both of these. Not as separate modes. Not with
different APIs. Not “communication mode” and “coordination mode.” Both
messages go through the same verbs, the same schema, the same inbox.
The primitive has to behave appropriately in both contexts without being
special-cased for either.

That’s a surprisingly tight constraint — because every adjacent category
breaks under it.

**Chat** is too loose. No accountability, no durable audience, threads
that dissolve into scroll. Fine for humans who can infer context. Wrong
for the manager who needs to know which PM owes a reply.

**RPC** is too tight. Synchronous means everything blocks, everything
times out, everything needs retry logic. Fine for “compute this now.”
Wrong for the threat brief that nobody needs to respond to at all.

**Queues** are too anonymous. Workers grab jobs; nobody remembers who
asked. Fine for fan-out tasks. Wrong when “Alice asked Bob specifically”
is the whole point.

**Workflow engines** are too opinionated too early. They assume the shape
of the work before the work exists. The threat brief doesn’t fit any
workflow. The status request fits ten different ones. A workflow engine
rejects half of what Inbox needs to carry before the agents even finish
describing their jobs.

Inbox needed to sit in the gap all four of those were circling: durable,
identity-based, asynchronous, message-first, thread-aware, equally
comfortable carrying a one-line status broadcast and a five-branch
coordinated task.

We wrote it down as one sentence and made it the thesis. Every subsequent
decision had to survive contact with it:

> **Inbox is a durable, pull-based, email-like messaging system for agents,
> designed to support both flexible communication and structured
> coordination.**

### Sidebar — “Why we didn’t study other agent protocols”

We deliberately avoided surveying A2A and similar agent-communication
specs before locking the core model.

Not because they’re wrong. Because studying them would have biased us
toward their ontology before we’d observed what agents actually reach
for. We’d have started inheriting their vocabulary, their message types,
their assumed workflows — and those choices would have shaped Inbox into
a system *justified against existing standards* rather than a system
*derived from the email intuition and stress-tested on its own terms.*

Inbox needed to emerge from first principles and then get hardened, not
emerge from a committee’s taxonomy and then get rationalized. The
comparative research happens later, once we have our own data to put
next to theirs. Borrowing ontology is a last step, not a first one.

### Component: “Category map” — interactive

A 2×2 quadrant with axes:

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

**Profile and directory entry stay conceptually separate, physically
merged.** Conceptually they’re different things — profile is
self-description, directory entry is publication into a specific
directory scope. In the MVP schema they collapse into one `addresses`
table with nullable columns. Why? Because the split earns nothing until
you have multiple directories or scoped visibility, and those are v2
features. The docs preserve the distinction so future work knows where
to re-split. The code doesn’t bother until it has to. This is a pattern
we used more than once: **preserve the conceptual distinction, simplify
the physical representation, document both.**

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

### A design we rejected

Early on, we considered letting `inbox ack` default to “the last message
you read.” It felt natural. It would have saved typing.

It was also a footgun.

Hidden state that agents would have to model mentally. State that would
change silently between commands. Behavior that would depend on session
order — and would therefore behave differently the moment you
parallelized calls, piped them through a script, or ran two agents
against the same account.

So we killed it. Every CLI command in Inbox takes explicit IDs. No
defaults that reach into session history. No “last message” magic. No
invisible carry-over between calls.

The principle this locked in:

> **Agents should never have to guess what state the CLI is carrying.**

You can extend the rule to almost every command in the system. The
commands are blunt on purpose. The CLI has no memory. Each invocation
is self-contained, readable from the command line alone, and does
exactly what it says. This is what makes Inbox safe to drive from a
script, from another agent, or from a shell that forgets everything
between invocations.

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

### The two kinds of review

Something worth sharing about *how* the review worked: the two kinds of
reviewer catch different things, and we learned to use them differently.

**Reviewers with full conversation history** are best at continuity.
They catch decisions that got made out loud but never made it into the
docs. They notice when a later section contradicts an earlier one.
They’re good at “we already debated this; the answer was X; why does
the doc say Y?”

**Reviewers with fresh context** are best at implementer simulation.
They read the docs the way a coding agent would: without the benefit of
hearing us argue it out, without shared vocabulary, without the context
of which tradeoffs got considered. They catch ambiguities that the
original authors can’t see *because* the original authors remember the
verbal clarification that never made it to the page.

Both matter. They catch different things. And for different purposes:

- **Design integrity?** Continuity review matters more. Fresh reviewers
  don’t know what you promised earlier.
- **Implementation handoff?** Fresh review matters more. The implementer
  *is* a fresh reviewer. If the docs don’t survive cold reading, they
  don’t survive handoff.

We used both, deliberately, at different stages. Continuity review
during design. Fresh review before the spec froze.

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
- whether it was a continuity or fresh review

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

### Two halves of the same loop

The `coming_soon` probes are **passive**. They catch what agents
*attempt*. That’s half the signal.

The other half is what agents *wanted to try but couldn’t guess how to
type*. That’s where `give-feedback` comes in:

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

Together the two commands close the loop:

- **Probes** catch what agents reach for. (Passive signal.)
- **Feedback** catches what agents *wished they could reach for*, but
  couldn’t guess the syntax. (Active signal.)

Neither alone is enough. Probes miss the feature an agent would have
loved but never thought to type. Feedback misses the feature agents
intuitively expected and tried in anger. Together, they’re the closest
thing to reading agents’ minds we’re going to get.

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

## 11. The docs are the diagnostic

Inbox has ten spec docs. For a local-first SQLite CLI with twelve
commands, that might sound absurd.

It’s not. It’s diagnostic.

If a multi-agent messaging system can be fully described in a single
README, it almost certainly has hidden assumptions that will bite the
first implementer. The ratio of spec docs to commands is a decent proxy
for how seriously a system has thought about its own invariants.

Here’s the set:

```
overview.md              what Inbox is and isn't
core-model.md            the conceptual entities and relationships
invariants.md            the rules of physics
mvp-spec.md              schema, commands, transaction behavior
roadmap.md               what's deferred, and the tripwires that pull it back
integration-seams.md     the subsystem contracts
parallel-workstreams.md  how to split implementation across agents
quality-gates-and-uat.md testing strategy and merge gates
discovery-mode.md        experimental surfaces and feedback loop
schema.sql               the actual DDL
```

Every one of these exists because without it, something would have
drifted.

The invariants doc exists because “we already discussed this” is not a
spec. The seams doc exists because parallel implementation without
contracts produces inconsistent subsystems. The roadmap exists because
deferrals without tripwires get forgotten or — worse — pulled forward
prematurely on vibes. The parallel-workstreams doc exists because
handing a spec to multiple build agents without explicit boundaries is
a recipe for three incompatible implementations of the same command.

Put differently: Inbox is a small system, but it’s a small system meant
to be implemented by agents, and agents are merciless critics of
ambiguity. The specs aren’t documentation *about* the system. The specs
*are* the system, and the code is an implementation of them.

### Component: doc hub grid

A file-tree style card grid. Each card:

- filename, byte count, last-updated timestamp
- one-line description
- estimated reading time
- “open →” link

Make it feel like browsing a real codebase, not a content page. Include
a search-as-you-type filter, a “recently updated” badge on the two most
recently modified specs, and a suggested reading order across the top:
**overview → core-model → invariants → mvp-spec → roadmap**, then dip
into the others as needed.

### Accordion

**Is ten specs actually a lot?**

Relative to the size of the code, yes. Relative to the number of
invariants, no. Inbox has dozens of rules that must hold simultaneously
for the system to be safe — visibility rules, state-transition rules,
send-time atomicity rules, reply-resolution rules, hide-vs-read rules,
list-expansion rules, parent-link visibility rules. A two-page README
couldn’t hold all of them without sacrificing precision. The specs are
long because the invariants are numerous. The alternative isn’t “fewer
docs”; the alternative is “fewer invariants, enforced by hope.”

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
- **Invariant health** — surface live violations of system rules, if
  any ever occur
- **Fixture manager** — load canonical test worlds for debugging and
  demos

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

|# |Section                |Shape                                               |
|--|-----------------------|----------------------------------------------------|
|1 |The smallest thing     |Short, reflective, one pull quote                   |
|2 |One primitive, two jobs|Scenario-driven opening + punchy list + sidebar     |
|3 |Three objects          |Long-form narrative with a diagram                  |
|4 |Threads that branch    |Scenario-driven + interactive widget                |
|5 |Two truths             |Split comparison, compact                           |
|6 |Edge cases             |Rapid-fire, machine-gun delivery                    |
|7 |Twelve verbs           |Visual/code-forward + one “rejected design” callout |
|8 |How it got hardened    |Quote-driven, multiple callouts, two-kinds-of-review|
|9 |Instrument more        |Transitional, very short                            |
|10|Coming soon trick      |Feature showcase with two-halves framing            |
|11|Docs are diagnostic    |File-tree visual, confident framing                 |
|12|Beyond the CLI         |Forward-looking, collage-driven                     |
|13|What this is about     |Reflective close, single pull quote                 |

Varying the shape is 80% of what makes a long-form page readable.

## Sticky elements to consider

- **Layers Locked ticker** (top): accumulates reasoning phases as you
  scroll. This is the structural spine, not just decoration. Each phase
  reveals the next constraint — the ticker literally shows the reader
  watching the design build.
- **Section progress indicator** (left rail): shows how far through the
  design journey you are.
- **Terminal companion** (right rail, desktop only): a live-looking
  terminal that runs commands relevant to the section you’re reading.
  Section 3 runs `send` and `read`; Section 6 runs `reply --all`;
  Section 10 runs `forward` and gets `coming_soon`.

The terminal companion is the single most distinctive visual element
you could add. It reinforces “this is a real tool with a real CLI” on
every screen without forcing the reader to context-switch.

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
   iteratively. Pulls quotes from real review rounds. Label each node
   with continuity vs fresh to show the two-kinds-of-review insight.
1. **Discovery flow animation** (Section 10) — ties the product
   philosophy to a concrete loop.
1. **Category map** (Section 2) — quick orientation for readers coming
   in cold.

If you can only build three, build 1, 2, and 3. They each teach
something the prose alone can’t.

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

- **Benchmarks / performance claims** — we don’t have any yet.
- **Customer testimonials** — no customers yet. Don’t fake it.
- **Competitive comparisons by name** — the category section handles
  this abstractly, which is stronger than naming competitors. The A2A
  sidebar is the closest thing, and it’s framed as “why we chose not to
  look” rather than “why we’re better.”
- **“Sign up for the beta”** — there’s no beta. The CTAs point at docs
  and the MVP.
- **A closing manifesto listing every principle.** The principles are
  embedded in scenes throughout the page. Listing them at the end
  flattens them back into bullet points, which is the thing we’re
  trying to avoid.

## Accessibility and mobile notes

- The Visibility Projector and Fanout Simulator need fallbacks for
  narrow viewports. Probably “view as” dropdowns instead of side-by-side
  panels.
- The sticky terminal companion should hide below ~1100px.
- The Layers Locked ticker should collapse to a single pill on mobile
  (tap to expand).
- All pull quotes should be real `<blockquote>` elements, not
  decorative text-in-a-div.
- Code blocks need sensible mobile wrapping. The CLI examples are
  load-bearing and can’t be horizontally scrolled past.

## Suggested reading order of the docs (for the CTA hub)

1. **overview.md** (5 min) — orient
1. **core-model.md** (10 min) — learn the entities
1. **invariants.md** (15 min) — see the rules
1. **mvp-spec.md** (20 min) — see the build
1. **roadmap.md** (5 min) — see what’s next
1. everything else — dip in as needed

Label each with an estimated reading time. Makes the doc hub feel like
a learning path, not a dumping ground.

-----

# What’s different in v3 vs v2

**Section 1 — `user@host` foresight.** Added the one-paragraph detail
that the first sketch already used `pm-alpha@vps-1` rather than bare
names. This is a small thing that plants the “start small, don’t lock
the door behind you” pattern in the reader’s mind on page one.

**Section 2 — opens with concrete scenarios.** The threat-intel daily
brief and the manager status request now lead the section. “Inbox has
to carry both” becomes something the reader has already seen in action
before they read the abstract thesis. Also added the **“Why we didn’t
study A2A” sidebar** as a strong-opinion moment about anti-bias design.

**Section 6 — profile/directory collapse added.** Captures one of the
more sophisticated moves in the design: keep the distinction in the
docs, collapse it in the schema, re-split when it earns its keep. Names
the pattern explicitly so future sections (and future implementers)
have language for it.

**Section 7 — “A design we rejected” callout.** The hidden-ACK
near-miss. Shows restraint and taste, and lands the principle “agents
should never have to guess what state the CLI is carrying.” This is a
voice move as much as a content move — it shows the page is willing to
talk about dead-ends, not just wins.

**Section 8 — “Two kinds of review” sub-section.** Added the insight
about continuity reviewers vs fresh-context reviewers catching
different things, and using each at different stages. This is the kind
of meta-lesson that makes the design process feel credible rather than
magical.

**Section 10 — “Two halves of the same loop” framing.** Tightened the
relationship between `coming_soon` probes (passive) and `give-feedback`
(active). They’re not two features — they’re two halves of one signal.
Upgraded the language accordingly.

**Section 11 — flipped the framing.** v2 was defensive: “ten docs
sounds like a lot, but it isn’t.” v3 is confident: “ten docs is
diagnostic.” The doc count is the point, not an apology. Added the
accordion explaining *why* ten docs is the right number relative to the
invariant count.

**Layers Locked ticker (was: Decision Lock Ticker).** Reframed from
“decisions accumulate” to “layers locked.” Each entry corresponds to a
real phase of the design conversation — Framing, Categories, Core
objects, Threads, Invariants, Schema, CLI, Experimentation, Docs,
Tooling. The reader literally watches the reasoning stack as they
scroll. This matches how the design actually came together (layer by
layer, each layer revealing the next constraint) and makes the ticker
load-bearing rather than decorative.

**Structural notes updated** to reflect all the above, especially the
“what’s deliberately not in this draft” section (now explicitly calls
out why there’s no closing manifesto — the principles stay embedded in
scenes).