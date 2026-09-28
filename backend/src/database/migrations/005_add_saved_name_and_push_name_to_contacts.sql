ALTER TABLE contacts ADD COLUMN IF NOT EXISTS saved_name VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS push_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_contacts_saved_name ON contacts(saved_name);
CREATE INDEX IF NOT EXISTS idx_contacts_push_name ON contacts(push_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_user_message_id ON messages(user_id, message_id) WHERE message_id IS NOT NULL;
