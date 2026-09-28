ALTER TABLE messages ADD COLUMN IF NOT EXISTS remote_jid VARCHAR(255);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(50) DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_caption TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_message JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS raw_data JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_me BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_status BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_remote_jid ON messages(remote_jid);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(from_me);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS jid VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_status_broadcast BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_text TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS about TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_jid ON contacts(jid);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message_time ON contacts(last_message_time DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS chat_ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jid VARCHAR(255) NOT NULL,
    auto_reply_enabled BOOLEAN DEFAULT false,
    reply_mode VARCHAR(50) DEFAULT 'ai',
    static_reply_text TEXT,
    custom_prompt TEXT,
    tone VARCHAR(50) DEFAULT 'friendly',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_chat_ai UNIQUE (user_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_chat_ai_settings_user ON chat_ai_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_ai_settings_jid ON chat_ai_settings(jid);



CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    caller_jid VARCHAR(255) NOT NULL,
    caller_name VARCHAR(255),
    caller_phone VARCHAR(50),
    call_type VARCHAR(50) DEFAULT 'audio',
    status VARCHAR(50) DEFAULT 'MISSED',
    auto_reply_sent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON call_logs(created_at DESC);
