-- 1. Conversation Sessions
create table if not exists analytics_conversations (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    metadata jsonb default '{}'::jsonb
);

-- 2. Chat Messages (History)
create table if not exists analytics_messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid references analytics_conversations(id) on delete cascade,
    role text not null, -- 'user' or 'ai'
    content text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Events (Clicks, Actions, Matches)
create table if not exists analytics_events (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid references analytics_conversations(id) on delete cascade,
    event_type text not null, -- 'click_reference', 'skill_match', 'contact_action'
    event_data jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table analytics_conversations enable row level security;
alter table analytics_messages enable row level security;
alter table analytics_events enable row level security;

-- Policies
-- Since we will be interacting with these tables primarily via the Server Side (API Routes) using the Service Role or correctly authenticated client, we don't strictly need public policies for Insert if we proxy everything.
-- However, for easier debugging or if we decide to allow client-side inserts later:
-- (Commented out for now to rely on backend proxy pattern for security)
-- create policy "Allow public insert" on analytics_events for insert with check (true);
