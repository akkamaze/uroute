import type { Pool } from "pg";

export interface EntryInput {
  sourceKey: string;
  day: string;
  variant: string;
  position: number;
  kind: "place" | "transport" | "note";
  title: string;
  timeLabel: string;
  detail: string;
  area: string;
  placeId: string | null;
}

export interface EntryRecord extends EntryInput {
  id: string;
}

export interface EntryPage {
  entries: EntryRecord[];
  tripVersion: string;
}

export interface TripEntryRepository {
  list(
    ownerId: string,
    tripId: string,
    day: string | null,
    limit: number,
    offset: number,
  ): Promise<EntryPage | null>;
  replace(
    ownerId: string,
    tripId: string,
    version: string,
    entries: readonly EntryInput[],
  ): Promise<EntryPage | "not-found" | "conflict" | "out-of-range">;
}

const COLUMNS = `id::text AS id, source_key AS "sourceKey", day::text AS day,
  variant, position, kind, title, time_label AS "timeLabel", detail, area,
  place_id AS "placeId"`;

function entryGroup(entry: EntryInput): string {
  return `${entry.day}:${entry.variant}`;
}

function groupedEntries(entries: readonly EntryInput[]): Map<string, string> {
  const groups = new Map<string, EntryInput[]>();
  for (const entry of entries) {
    const key = entryGroup(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return new Map(
    [...groups].map(([key, rows]) => [
      key,
      JSON.stringify(
        rows
          .map(({ sourceKey, position, kind, title, timeLabel, detail, area, placeId }) => ({
            sourceKey,
            position,
            kind,
            title,
            timeLabel,
            detail,
            area,
            placeId,
          }))
          .sort((left, right) =>
            left.position === right.position
              ? left.sourceKey.localeCompare(right.sourceKey)
              : left.position - right.position,
          ),
      ),
    ]),
  );
}

function changedEntryGroups(before: readonly EntryInput[], after: readonly EntryInput[]): string[] {
  const oldGroups = groupedEntries(before);
  const newGroups = groupedEntries(after);

  return [...new Set([...oldGroups.keys(), ...newGroups.keys()])].filter(
    (key) => oldGroups.get(key) !== newGroups.get(key),
  );
}

export class PgTripEntryRepository implements TripEntryRepository {
  constructor(private readonly database: Pool) {}

  async list(
    ownerId: string,
    tripId: string,
    day: string | null,
    limit: number,
    offset: number,
  ): Promise<EntryPage | null> {
    const trip = await this.database.query<{ version: string }>(
      `SELECT version::text AS version FROM trip
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [tripId, ownerId],
    );
    if (!trip.rows[0]) {
      return null;
    }
    const entries = await this.database.query<EntryRecord>(
      `SELECT ${COLUMNS} FROM trip_entry
       WHERE trip_id = $1 AND ($2::date IS NULL OR day = $2::date)
       ORDER BY day, variant, position, id LIMIT $3 OFFSET $4`,
      [tripId, day, limit, offset],
    );

    return { entries: entries.rows, tripVersion: trip.rows[0].version };
  }

  async replace(
    ownerId: string,
    tripId: string,
    version: string,
    entries: readonly EntryInput[],
  ): Promise<EntryPage | "not-found" | "conflict" | "out-of-range"> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const trip = await client.query<{
        version: string;
        startDate: string;
        endDate: string;
      }>(
        `SELECT version::text AS version, start_date::text AS "startDate",
          end_date::text AS "endDate" FROM trip
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [tripId, ownerId],
      );
      const current = trip.rows[0];
      if (!current) {
        await client.query("ROLLBACK");

        return "not-found";
      }
      if (current.version !== version) {
        await client.query("ROLLBACK");

        return "conflict";
      }
      if (entries.some((entry) => entry.day < current.startDate || entry.day > current.endDate)) {
        await client.query("ROLLBACK");

        return "out-of-range";
      }
      const previous = await client.query<EntryRecord>(
        `SELECT ${COLUMNS} FROM trip_entry WHERE trip_id = $1`,
        [tripId],
      );
      const changedGroups = changedEntryGroups(previous.rows, entries);
      await client.query("DELETE FROM trip_entry WHERE trip_id = $1", [tripId]);
      if (entries.length) {
        await client.query(
          `INSERT INTO trip_entry
            (id, trip_id, source_key, day, variant, position, kind, title,
             time_label, detail, area, place_id)
           SELECT gen_random_uuid(), $1::uuid, e."sourceKey", e.day::date, e.variant::char(1),
             e.position, e.kind, e.title, e."timeLabel", e.detail, e.area, e."placeId"
           FROM jsonb_to_recordset($2::jsonb) AS e(
             "sourceKey" text, day text, variant text, position integer, kind text,
             title text, "timeLabel" text, detail text, area text, "placeId" text
           )`,
          [tripId, JSON.stringify(entries)],
        );
      }
      const updated = await client.query<{ version: string }>(
        `UPDATE trip SET version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version::text AS version`,
        [tripId],
      );
      await client.query(
        `UPDATE trip_draft SET base_version = $3::bigint
         WHERE trip_id = $1 AND base_version = $2::bigint
           AND NOT ((day::text || ':' || variant) = ANY($4::text[]))`,
        [tripId, version, updated.rows[0]!.version, changedGroups],
      );
      const saved = await client.query<EntryRecord>(
        `SELECT ${COLUMNS} FROM trip_entry WHERE trip_id = $1
         ORDER BY day, variant, position, id`,
        [tripId],
      );
      await client.query("COMMIT");

      return { entries: saved.rows, tripVersion: updated.rows[0]!.version };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
