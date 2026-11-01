-- A handle for every bot made before handles (decision 0065): the main bot is `main`; any other is a
-- slug of its name, with a number after it when the person already has a bot with that handle,
-- whichever bot got it. Oldest first, so the oldest keeps the plain one.
DO $$
DECLARE
  bot record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR bot IN SELECT id, user_id, is_main, name FROM bots WHERE handle = '' ORDER BY created_at, id LOOP
    IF bot.is_main THEN
      base := 'main';
    ELSE
      base := trim(both '-' from left(trim(both '-' from regexp_replace(
        lower(regexp_replace(normalize(bot.name, NFKD), '[̀-ͯ]', '', 'g')),
        '[^a-z0-9]+', '-', 'g')), 30));
      IF base = '' THEN base := 'bot'; END IF;
      IF base IN ('main', 'user', 'system') THEN base := base || '-bot'; END IF;
    END IF;
    candidate := base;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM bots WHERE user_id = bot.user_id AND handle = candidate) LOOP
      candidate := base || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE bots SET handle = candidate WHERE id = bot.id;
  END LOOP;
END $$;
