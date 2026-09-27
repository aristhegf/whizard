-- Visitors become people who can be recognised two ways: by the random ID their browser keeps,
-- or by a one-way code made from their network and browser (never the IP address itself). A
-- visit only counts as a new visitor when neither is known, so a private window, cleared
-- storage or a script making up IDs doesn't count the same person again.

CREATE TABLE visitor_people (
  id TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);

CREATE INDEX visitor_people_last_day ON visitor_people (last_day);

-- Each browser ID belongs to one person.
CREATE TABLE visitor_browsers (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL
);

-- Network codes are keyed with a secret, so they can't be turned back into addresses. Addresses
-- get reused, so a code only matches for 30 days after it was last seen, and older ones are
-- deleted.
CREATE TABLE visitor_networks (
  key TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  last_day TEXT NOT NULL
);

CREATE INDEX visitor_networks_last_day ON visitor_networks (last_day);

INSERT INTO visitor_people (id, first_day, last_day) SELECT id, first_day, last_day FROM visitors;
INSERT INTO visitor_browsers (id, person_id) SELECT id, id FROM visitors;
DROP TABLE visitors;
