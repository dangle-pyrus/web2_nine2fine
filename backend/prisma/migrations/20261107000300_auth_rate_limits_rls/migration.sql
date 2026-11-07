-- Keep auth_rate_limits (keys contain emails) out of Supabase's public Data API,
-- like the other tables. No policy is added: the backend connects as the table owner, which bypasses RLS.
ALTER TABLE "auth_rate_limits" ENABLE ROW LEVEL SECURITY;
