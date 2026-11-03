CREATE TABLE kyc_cases(id TEXT PRIMARY KEY,session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,journey_id TEXT NOT NULL,context_cipher BLOB NOT NULL,result_json TEXT NOT NULL,verification_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX kyc_cases_owner ON kyc_cases(session_hash,journey_id,updated_at);
CREATE TABLE kyc_uploads(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,kind TEXT NOT NULL,version INTEGER NOT NULL,content_hash TEXT NOT NULL,mime TEXT NOT NULL,filename TEXT NOT NULL,size INTEGER NOT NULL,payload_cipher BLOB NOT NULL,created_at TEXT NOT NULL,UNIQUE(case_id,kind,version));
CREATE TABLE kyc_runs(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,result_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE kyc_decisions(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,decision TEXT NOT NULL,comment TEXT NOT NULL,decided_at TEXT NOT NULL);
CREATE TABLE kyc_reviewer_sessions(token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL);
