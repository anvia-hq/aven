import { db } from "@aven/db/client";
import { sql } from "drizzle-orm";

import { preferencesService } from "../preferences/service";
import { streaksOf } from "./streaks";
import type { ProfileDay, ProfileStats } from "./types";

const WINDOW_DAYS = 371;

type DayRow = { day: string; tokens: string };
type SpanRow = { ms: string | null };
type CountRow = { threads: string };

const DAY = 86_400_000;

const dayIn = (timezone: string, time = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));

export const profileService = {
  async stats(userId: string): Promise<ProfileStats> {
    const timezone = await preferencesService.timezone(userId);
    const today = dayIn(timezone);
    const windowStart = dayIn(timezone, Date.parse(`${today}T00:00:00Z`) - (WINDOW_DAYS - 1) * DAY);

    const [dayRows, spanRows, countRows] = await Promise.all([
      db.execute<DayRow>(sql`
        with mine as (
          select
            m.created_at,
            case
              when (m.message #>> '{metadata,anvia,generation,usage,totalTokens}') ~ '^[0-9]+$'
                then (m.message #>> '{metadata,anvia,generation,usage,totalTokens}')::numeric
              else 0
            end as tokens
          from agent_memory_messages m
          join agent_memory_sessions s on s.id = m.memory_session_id
          where s.user_id = ${userId}
             or s.session_id in (select id::text from threads where created_by = ${userId})
        )
        select
          to_char((created_at at time zone ${timezone}::text)::date, 'YYYY-MM-DD') as day,
          coalesce(sum(tokens), 0)::text as tokens
        from mine
        group by 1
        order by 1
      `),
      db.execute<SpanRow>(sql`
        select coalesce(max(span), 0)::text as ms
        from (
          select extract(epoch from (max(m.created_at) - min(m.created_at))) * 1000 as span
          from agent_memory_sessions s
          join agent_memory_messages m on m.memory_session_id = s.id
          join threads t on t.id::text = s.session_id
          where t.created_by = ${userId}
          group by s.id
        ) spans
      `),
      db.execute<CountRow>(sql`
        select count(*)::text as threads from threads where created_by = ${userId}
      `),
    ]);

    const all: ProfileDay[] = dayRows.map((row) => ({
      date: row.day,
      tokens: Number(row.tokens),
    }));
    const days = all.filter((day) => day.date >= windowStart);
    const { current, longest } = streaksOf(
      all.map((day) => day.date),
      today,
    );

    return {
      today,
      threads: Number(countRows[0]?.threads ?? 0),
      longestThreadMs: Number(spanRows[0]?.ms ?? 0),
      currentStreakDays: current,
      longestStreakDays: longest,
      tokens: days.reduce((total, day) => total + day.tokens, 0),
      days,
    };
  },
};
