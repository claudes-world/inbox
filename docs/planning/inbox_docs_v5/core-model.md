# Inbox — Core Model

## Core concepts

### Address
A globally unique routable identity in the current Inbox system scope.

Examples:
- `pm-alpha@vps-1`
- `threat-brief@ops`
- `eng-leads@lists`

An address is the canonical sender/recipient identity.

### Address metadata
In the MVP physical schema, profile-like and directory-like fields live on the same `addresses` row.
Conceptually, they are still distinct:
- **profile-like metadata**: self-description such as display name and description
- **directory-like metadata**: listing and classification data such as `is_listed`, `is_active`, and `classification`

### List / distribution list
A list is an address with `kind='list'` that expands to one or more active member addresses at send time.

Protocol term: **list**.
Current MVP schema term: `group_members` / `group_address_id` for historical reasons.

Lists are addressable recipient abstractions, not mailbox-state holders. In MVP, "static lists" means no end-user subscription or moderation surface; membership may still be edited administratively between sends, and send/reply expansion always uses membership as it exists at the moment of the new send.
Deterministic membership order matters; the schema or query rules must guarantee a stable member order per list.

### Conversation
A conversation is the lineage container for related messages.

It groups messages into one exchange, but it is not an ACL boundary.

### Parent link
A parent link is an optional single-message reference from one message to an earlier message in the same conversation.

It is what turns a conversation from a bag of related messages into a reply tree.
It gives structure, not permission.

### Message
A message is the immutable canonical authored artifact.

It owns:
- sender
- public recipient headers
- subject
- body
- conversation id
- optional parent message id
- sender-declared urgency
- typed references
- created/sent timestamp

A message exists once canonically, even if many recipients receive it.

### Public recipient headers
The message stores the public logical recipients after deterministic MVP normalization.

Normalization rule:
- exact duplicates within the same role are deduped before storage, preserving first-seen ordinal
- duplicates across roles are preserved as separate logical header rows

That means a list address like `eng-leads@lists` is preserved in headers as a logical addressee, even though actual deliveries fan out to individual members.

### Private routing metadata
BCC and other non-public routing information are not part of the public header snapshot.
They belong to private routing metadata and resulting deliveries.

### Delivery
A delivery is the acting recipient’s local mailbox record for a message.

It owns:
- recipient address
- effective role (`to`, `cc`, `bcc`)
- engagement state (`unread`, `read`, `acknowledged`)
- visibility state (`active`, `hidden`)
- delivery timestamp
- append-only state transition history

Message is shared truth. Delivery is local recipient state.

### Sent item
A sent item is sender-local view state for a message.

It exists because sender view and recipient inbox view are different surfaces.
A sender may hide a sent item without affecting any recipient delivery.

Every successfully sent message has exactly one sent item for its sender.
In MVP storage, `sent_items` is intentionally keyed by `message_id`; ownership is derived by joining through `messages.sender_address_id` rather than storing a second sender column on `sent_items`.

### Delivery source
A delivery source records why a given delivery exists.

Examples:
- direct `to`
- direct `bcc`
- via list expansion from a list address

This is crucial when one actual recipient receives one delivery for multiple logical reasons.

### Typed reference
Messages may carry zero or more typed references as part of immutable content.

Examples:
- path reference
- URL reference
- JSON payload
- text snippet
- artifact id

These are not top-level peer entities in the conceptual model; they are part of message content.

### Local override / address-book entry
A future-facing per-actor interpretation layer.

Examples:
- local alias
- local notes
- local priority interpretation
- local sender/list preferences

This is deferred from MVP behavior, but conceptually reserved.

## Important non-entities / surfaces

### Mailbox
Mailbox is a query surface over deliveries, not a core durable entity.

### Draft
Drafts are client-side, not protocol objects in MVP.

### CLI actor context
The acting address comes from environment and command context, not from a stored protocol object.

## Core relationships
- every message belongs to exactly one conversation
- a parentless message creates a new conversation
- a reply inherits its parent’s conversation
- a message may have zero or one parent message
- a message has exactly one sender address
- one message fans out to one delivery per actual recipient address
- one message gets one sent item for the sender
- one delivery may have multiple delivery sources
- a list expands to active members at send time

## Visibility principle
A recipient may access a message only if that message was delivered to them.
A sender may access a sent message through the sent view.
If the sender is also a recipient, they independently have inbox access through their delivery.
Conversation lineage does not grant visibility by itself.
