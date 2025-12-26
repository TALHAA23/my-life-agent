-- Enhance Conversations table
alter table analytics_conversations 
add column if not exists referrer text,
add column if not exists device_info jsonb default '{}'::jsonb,
add column if not exists topics text[] default '{}', -- Aggregated topics for the session
add column if not exists avg_sentiment float;       -- Aggregated sentiment for the session

-- Enhance Messages table
alter table analytics_messages 
add column if not exists sentiment_score float, -- -1.0 (Negative) to 1.0 (Positive)
add column if not exists topics text[];         -- Topics detected in this specific message
