CREATE TABLE advisor_owners (
 id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE advisor_sessions (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES advisor_owners(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advisor_sessions_owner ON advisor_sessions(owner_id,updated_at DESC);
CREATE TABLE advisor_requirements (
 session_id uuid PRIMARY KEY REFERENCES advisor_sessions(id) ON DELETE CASCADE,
 state jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE advisor_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id uuid NOT NULL REFERENCES advisor_sessions(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL CHECK(length(content)<=4000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advisor_messages_session ON advisor_messages(session_id,id DESC);
CREATE TABLE advisor_turns (
 session_id uuid NOT NULL REFERENCES advisor_sessions(id) ON DELETE CASCADE, request_id uuid NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY(session_id,request_id)
);
