-- The quiz topic catalogue, so admins can add topics, rename them and edit their colours and
-- taglines without a deploy. The id is the immutable slug every reference uses; renaming only
-- changes the name. `art` stays NULL until an admin uploads a replacement for the static file.
CREATE TABLE topics (
  id          TEXT PRIMARY KEY,          -- immutable slug, a-z0-9 with hyphens
  name        TEXT NOT NULL,             -- display name; renameable
  tagline     TEXT NOT NULL DEFAULT '',
  colors      TEXT NOT NULL,             -- JSON array of two "#rrggbb" strings
  sort_order  INTEGER NOT NULL,
  art         BLOB,                      -- uploaded square WebP, null until uploaded
  art_type    TEXT,                      -- 'image/webp'
  art_version INTEGER NOT NULL DEFAULT 0 -- bumped on every replace; cache-buster for ?v=
);

-- The twelve topics that ship with the game, in the order they were listed in code.
INSERT INTO topics (id, name, tagline, colors, sort_order) VALUES
  ('bible', 'Bible', 'Stories, verses and wisdom', '["#ffb52c","#5a2014"]', 1),
  ('quran', 'Quran', 'Surahs, verses and teachings', '["#25c08c","#053b33"]', 2),
  ('geography', 'Geography', 'Places, maps and landmarks', '["#26c15f","#023c3c"]', 3),
  ('history', 'History', 'Moments that shaped the world', '["#ff4b3e","#6a0b34"]', 4),
  ('science', 'Science', 'How the world works', '["#1f9dff","#062585"]', 5),
  ('animals', 'Animals', 'Wildlife from every habitat', '["#f2a93b","#3f2a0a"]', 6),
  ('football', 'Football', 'Clubs, players and the beautiful game', '["#ff8a1f","#6b1228"]', 7),
  ('movies', 'Movies', 'Film, screen and cinema', '["#8f3cff","#2a0580"]', 8),
  ('music', 'Music', 'Artists, genres and songs', '["#de45ff","#5e0480"]', 9),
  ('nigerian-culture', 'Nigerian culture', 'Language, food and tradition', '["#2fc44a","#012e2e"]', 10),
  ('general-knowledge', 'General knowledge', 'A bit of everything', '["#1aa6ff","#1015a8"]', 11),
  ('pop-culture', 'Pop culture', 'TV, trends and celebrities', '["#22b4ff","#0232a3"]', 12);
