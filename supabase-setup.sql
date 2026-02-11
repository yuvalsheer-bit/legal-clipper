-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query → Paste → Run)

-- Create the clips table
CREATE TABLE clips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  timestamp TEXT,
  username TEXT,
  source TEXT,
  page_title TEXT,
  url TEXT,
  captured_text TEXT,
  captured_html TEXT DEFAULT '',
  why_it_matters TEXT,
  tags TEXT,
  cause_of_action TEXT DEFAULT '',
  case_name TEXT DEFAULT '',
  rating TEXT DEFAULT ''
);

-- Enable Row Level Security (required by Supabase)
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;

-- Allow anyone with the anon key to read, insert, and update
-- (all team members share the same anon key)
CREATE POLICY "Allow public read" ON clips FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON clips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON clips FOR UPDATE USING (true);
