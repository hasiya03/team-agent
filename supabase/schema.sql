create table if not exists team_members (
  id text primary key,
  name text not null,
  phone text not null unique,
  role text not null default 'general',
  timezone text not null default 'Asia/Colombo',
  preferred_reminder_hour integer not null default 9,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_reply_at timestamptz
);

create table if not exists tasks (
  id text primary key,
  member_id text not null references team_members(id) on delete cascade,
  title text not null,
  description text,
  deadline timestamptz,
  status text not null default 'todo',
  source_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key,
  assigned_to_member_id text not null references team_members(id) on delete cascade,
  business_name text not null,
  phone text,
  website text,
  address text,
  google_maps_url text,
  notes text,
  status text not null default 'new',
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_messages (
  id text primary key,
  twilio_message_sid text,
  from_phone text not null,
  to_phone text not null,
  body text not null,
  direction text not null,
  member_id text references team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists member_memories (
  member_id text primary key references team_members(id) on delete cascade,
  summary text not null,
  updated_at timestamptz not null default now()
);

create table if not exists reminders (
  id text primary key,
  member_id text not null references team_members(id) on delete cascade,
  type text not null,
  body text not null,
  send_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists pending_confirmations (
  id text primary key,
  admin_phone text not null,
  summary text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists tasks_member_status_idx on tasks(member_id, status);
create index if not exists leads_member_status_idx on leads(assigned_to_member_id, status);
create index if not exists reminders_status_send_at_idx on reminders(status, send_at);
create index if not exists messages_created_at_idx on agent_messages(created_at desc);
create index if not exists confirmations_admin_expires_idx on pending_confirmations(admin_phone, expires_at desc);

alter table team_members enable row level security;
alter table tasks enable row level security;
alter table leads enable row level security;
alter table agent_messages enable row level security;
alter table member_memories enable row level security;
alter table reminders enable row level security;
alter table pending_confirmations enable row level security;

-- This app uses SUPABASE_SERVICE_ROLE_KEY from server-only route handlers.
-- RLS is enabled so public anon/client access does not expose team data.
