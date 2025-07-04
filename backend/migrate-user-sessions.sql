-- Migration script to fix user_sessions table schema
-- Run this manually in PostgreSQL when connection is available

-- Alter the user_sessions table to change VARCHAR(255) to TEXT
ALTER TABLE user_sessions 
ALTER COLUMN session_token TYPE TEXT,
ALTER COLUMN refresh_token TYPE TEXT;

-- Verify the changes
\d user_sessions;