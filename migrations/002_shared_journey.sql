ALTER TABLE advisor_sessions ADD COLUMN creation_key uuid;
ALTER TABLE advisor_sessions ADD CONSTRAINT advisor_sessions_creation_key UNIQUE(owner_id,creation_key);
ALTER TABLE advisor_requirements ADD COLUMN revision integer NOT NULL DEFAULT 0;
