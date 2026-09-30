-- The room of the latest ping, so the friend sees it on Whizard itself as well as (or instead of)
-- getting a notification. Null when their settings held the ping back.
ALTER TABLE friends ADD COLUMN last_ping_room TEXT;
