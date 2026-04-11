-- schema/seed.sql — Realistic fixture data for testing and development.
-- All IDs use the generate_id format (prefix + 12-char hex timestamp + _ + 8-char random hex)
-- but are hardcoded here for reproducibility.

-- Timestamps: base epoch 1775700000000 (approx. 2026-04-07 in ms)
-- Offsets: +1000 per logical step

PRAGMA foreign_keys = ON;

-- =============================================================================
-- Addresses
-- =============================================================================

-- Agents
INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_listed, is_active, classification, created_at_ms, updated_at_ms)
VALUES
  ('addr_019d6f000001_a0000001', 'pm-alpha',  'vps-1', 'agent',  'Project Manager Alpha', 'Engineering PM agent',         1, 1, 'internal', 1775700000000, 1775700000000),
  ('addr_019d6f000002_a0000002', 'eng-lead',  'vps-1', 'agent',  'Engineering Lead',      'Senior engineering lead',      1, 1, 'internal', 1775700000000, 1775700000000),
  ('addr_019d6f000003_a0000003', 'eng-1',     'vps-1', 'agent',  'Engineer One',          'Backend engineer agent',       1, 1, 'internal', 1775700000000, 1775700000000),
  ('addr_019d6f000004_a0000004', 'eng-2',     'vps-1', 'agent',  'Engineer Two',          'Frontend engineer agent',      1, 1, 'internal', 1775700000000, 1775700000000);

-- Human
INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_listed, is_active, classification, created_at_ms, updated_at_ms)
VALUES
  ('addr_019d6f000005_a0000005', 'ceo',       'vps-1', 'human',  'CEO',                   'Company CEO',                  1, 1, 'internal', 1775700000000, 1775700000000);

-- Lists
INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_listed, is_active, classification, created_at_ms, updated_at_ms)
VALUES
  ('addr_019d6f000010_a0000010', 'eng-leads', 'lists', 'list',   'Engineering Leads',     'All engineering leadership',   1, 1, 'internal', 1775700000000, 1775700000000),
  ('addr_019d6f000011_a0000011', 'all-hands', 'lists', 'list',   'All Hands',             'Everyone in the organization', 1, 1, 'internal', 1775700000000, 1775700000000);

-- =============================================================================
-- Group members
-- =============================================================================

-- eng-leads@lists: eng-lead, eng-1, eng-2
INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
VALUES
  ('addr_019d6f000010_a0000010', 'addr_019d6f000002_a0000002', 1, 1775700001000),
  ('addr_019d6f000010_a0000010', 'addr_019d6f000003_a0000003', 2, 1775700001000),
  ('addr_019d6f000010_a0000010', 'addr_019d6f000004_a0000004', 3, 1775700001000);

-- all-hands@lists: pm-alpha, eng-lead, eng-1, eng-2, ceo
INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
VALUES
  ('addr_019d6f000011_a0000011', 'addr_019d6f000001_a0000001', 1, 1775700001000),
  ('addr_019d6f000011_a0000011', 'addr_019d6f000002_a0000002', 2, 1775700001000),
  ('addr_019d6f000011_a0000011', 'addr_019d6f000003_a0000003', 3, 1775700001000),
  ('addr_019d6f000011_a0000011', 'addr_019d6f000004_a0000004', 4, 1775700001000),
  ('addr_019d6f000011_a0000011', 'addr_019d6f000005_a0000005', 5, 1775700001000);

-- =============================================================================
-- Conversation 1: PM requests status report from eng-lead
-- =============================================================================

INSERT INTO conversations (id, created_at_ms)
VALUES ('cnv_019d6f100001_c0000001', 1775700100000);

-- Message 1: PM → eng-lead (direct)
INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
VALUES (
  'msg_019d6f100001_m0000001',
  'cnv_019d6f100001_c0000001',
  NULL,
  'addr_019d6f000001_a0000001',
  'Weekly status report needed',
  'Please send your weekly engineering status report by end of day. Include progress on the API migration and any blockers.',
  'normal',
  1775700100000
);

INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
VALUES ('mpr_019d6f100001_r0000001', 'msg_019d6f100001_m0000001', 'addr_019d6f000002_a0000002', 'to', 1, 1775700100000);

INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f100001_d0000001', 'msg_019d6f100001_m0000001', 'addr_019d6f000002_a0000002', 'to', 'read', 'active', 1775700100000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f100001_d0000001', 'addr_019d6f000002_a0000002', 'to', 'direct');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f100001_e0000001', 'dly_019d6f100001_d0000001', 'delivered', 'delivered', NULL, 1775700100000, 'unread', 'active');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f100002_e0000002', 'dly_019d6f100001_d0000001', 'state_changed', 'read', 'addr_019d6f000002_a0000002', 1775700110000, 'read', 'active');

INSERT INTO sent_items (message_id, visibility_state) VALUES ('msg_019d6f100001_m0000001', 'active');

-- Message 2: eng-lead replies to PM
INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
VALUES (
  'msg_019d6f100002_m0000002',
  'cnv_019d6f100001_c0000001',
  'msg_019d6f100001_m0000001',
  'addr_019d6f000002_a0000002',
  'Re: Weekly status report needed',
  'API migration is at 85% completion. Main blocker is the auth service refactor — eng-1 is working on it. Expected completion by Thursday.',
  'normal',
  1775700120000
);

INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
VALUES ('mpr_019d6f100002_r0000002', 'msg_019d6f100002_m0000002', 'addr_019d6f000001_a0000001', 'to', 1, 1775700120000);

INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f100002_d0000002', 'msg_019d6f100002_m0000002', 'addr_019d6f000001_a0000001', 'to', 'acknowledged', 'active', 1775700120000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f100002_d0000002', 'addr_019d6f000001_a0000001', 'to', 'direct');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f100003_e0000003', 'dly_019d6f100002_d0000002', 'delivered', 'delivered', NULL, 1775700120000, 'unread', 'active');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f100004_e0000004', 'dly_019d6f100002_d0000002', 'state_changed', 'ack', 'addr_019d6f000001_a0000001', 1775700125000, 'acknowledged', 'active');

INSERT INTO sent_items (message_id, visibility_state) VALUES ('msg_019d6f100002_m0000002', 'active');

-- =============================================================================
-- Conversation 2: PM sends announcement to eng-leads list, CC'ing CEO
-- =============================================================================

INSERT INTO conversations (id, created_at_ms)
VALUES ('cnv_019d6f200001_c0000002', 1775700200000);

-- Message: PM → eng-leads@lists (to), ceo (cc)
INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
VALUES (
  'msg_019d6f200001_m0000003',
  'cnv_019d6f200001_c0000002',
  NULL,
  'addr_019d6f000001_a0000001',
  'Q2 priorities and sprint planning',
  'Team, please review the attached Q2 priorities document before our sprint planning session on Monday. Key focus areas: API migration completion, performance benchmarks, and security audit preparation.',
  'high',
  1775700200000
);

INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
VALUES
  ('mpr_019d6f200001_r0000003', 'msg_019d6f200001_m0000003', 'addr_019d6f000010_a0000010', 'to', 1, 1775700200000),
  ('mpr_019d6f200002_r0000004', 'msg_019d6f200001_m0000003', 'addr_019d6f000005_a0000005', 'cc', 1, 1775700200000);

INSERT INTO message_references (id, message_id, ordinal, ref_kind, ref_value, label, mime_type, metadata_json)
VALUES ('ref_019d6f200001_f0000001', 'msg_019d6f200001_m0000003', 1, 'path', '/shared/docs/q2-priorities.md', 'Q2 Priorities', 'text/markdown', NULL);

-- Deliveries: one per resolved recipient (eng-lead, eng-1, eng-2 via list; ceo direct)
-- eng-lead: unread
INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f200001_d0000003', 'msg_019d6f200001_m0000003', 'addr_019d6f000002_a0000002', 'to', 'unread', 'active', 1775700200000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f200001_d0000003', 'addr_019d6f000010_a0000010', 'to', 'list');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200001_e0000005', 'dly_019d6f200001_d0000003', 'delivered', 'delivered', NULL, 1775700200000, 'unread', 'active');

-- eng-1: read
INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f200002_d0000004', 'msg_019d6f200001_m0000003', 'addr_019d6f000003_a0000003', 'to', 'read', 'active', 1775700200000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f200002_d0000004', 'addr_019d6f000010_a0000010', 'to', 'list');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200002_e0000006', 'dly_019d6f200002_d0000004', 'delivered', 'delivered', NULL, 1775700200000, 'unread', 'active');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200003_e0000007', 'dly_019d6f200002_d0000004', 'state_changed', 'read', 'addr_019d6f000003_a0000003', 1775700210000, 'read', 'active');

-- eng-2: acknowledged
INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f200003_d0000005', 'msg_019d6f200001_m0000003', 'addr_019d6f000004_a0000004', 'to', 'acknowledged', 'active', 1775700200000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f200003_d0000005', 'addr_019d6f000010_a0000010', 'to', 'list');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200004_e0000008', 'dly_019d6f200003_d0000005', 'delivered', 'delivered', NULL, 1775700200000, 'unread', 'active');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200005_e0000009', 'dly_019d6f200003_d0000005', 'state_changed', 'ack', 'addr_019d6f000004_a0000004', 1775700215000, 'acknowledged', 'active');

-- ceo: read, hidden
INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f200004_d0000006', 'msg_019d6f200001_m0000003', 'addr_019d6f000005_a0000005', 'cc', 'read', 'hidden', 1775700200000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f200004_d0000006', 'addr_019d6f000005_a0000005', 'cc', 'direct');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200006_e0000010', 'dly_019d6f200004_d0000006', 'delivered', 'delivered', NULL, 1775700200000, 'unread', 'active');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200007_e0000011', 'dly_019d6f200004_d0000006', 'state_changed', 'read', 'addr_019d6f000005_a0000005', 1775700208000, 'read', 'active');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f200008_e0000012', 'dly_019d6f200004_d0000006', 'state_changed', 'hide', 'addr_019d6f000005_a0000005', 1775700220000, 'read', 'hidden');

INSERT INTO sent_items (message_id, visibility_state) VALUES ('msg_019d6f200001_m0000003', 'active');

-- =============================================================================
-- Conversation 3: eng-1 sends a direct update to eng-lead (hidden by sender)
-- =============================================================================

INSERT INTO conversations (id, created_at_ms)
VALUES ('cnv_019d6f300001_c0000003', 1775700300000);

INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
VALUES (
  'msg_019d6f300001_m0000004',
  'cnv_019d6f300001_c0000003',
  NULL,
  'addr_019d6f000003_a0000003',
  'Auth service refactor update',
  'Quick update: the auth service refactor is progressing well. I have completed the token rotation logic and am now working on the session management layer. Should be done by Wednesday.',
  'low',
  1775700300000
);

INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
VALUES ('mpr_019d6f300001_r0000005', 'msg_019d6f300001_m0000004', 'addr_019d6f000002_a0000002', 'to', 1, 1775700300000);

-- Delivery to eng-lead: unread, active
INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
VALUES ('dly_019d6f300001_d0000007', 'msg_019d6f300001_m0000004', 'addr_019d6f000002_a0000002', 'to', 'unread', 'active', 1775700300000);

INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
VALUES ('dly_019d6f300001_d0000007', 'addr_019d6f000002_a0000002', 'to', 'direct');

INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
VALUES ('evt_019d6f300001_e0000013', 'dly_019d6f300001_d0000007', 'delivered', 'delivered', NULL, 1775700300000, 'unread', 'active');

-- Sent item: hidden by sender
INSERT INTO sent_items (message_id, visibility_state, hidden_at_ms) VALUES ('msg_019d6f300001_m0000004', 'hidden', 1775700350000);
