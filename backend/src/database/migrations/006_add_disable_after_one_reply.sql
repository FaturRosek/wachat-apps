ALTER TABLE chat_ai_settings ADD COLUMN IF NOT EXISTS disable_after_one_reply BOOLEAN DEFAULT false;
