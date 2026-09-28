ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_is_pinned ON contacts(is_pinned);
CREATE INDEX IF NOT EXISTS idx_contacts_is_archived ON contacts(is_archived);
