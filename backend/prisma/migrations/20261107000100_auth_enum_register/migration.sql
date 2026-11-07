-- Additive only: new enum value for sessions created by registration (BR-AUTH-23).
-- Kept in its own migration because a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "auth_method" ADD VALUE IF NOT EXISTS 'register';
