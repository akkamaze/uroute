import type { Pool } from "pg";

import type { EntryInput } from "./entries";

export interface PlanPlace {
  sourceKey: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  imageUrl: string | null;
  notes: string | null;
}

export interface PlanEntry extends EntryInput {
  id: string;
  place: PlanPlace | null;
}

export interface PlanDay {
  version: string;
  entries: PlanEntry[];
}

export interface TripPlanRepository {
  day(ownerId: string, tripId: string, day: string): Promise<PlanDay | null>;
  upsertPlace(ownerId: string, tripId: string, place: PlanPlace): Promise<PlanPlace | null>;
  replaceDay(
    ownerId: string,
    tripId: string,
    day: string,
    version: string,
    entries: readonly EntryInput[],
  ): Promise<PlanDay | "not-found" | "conflict" | "out-of-range">;
}

const SELECT_ENTRIES = `SELECT e.id::text AS id, e.source_key AS "sourceKey",
  e.day::text AS day, e.variant, e.position, e.kind, e.title,
  e.time_label AS "timeLabel", e.detail, e.area, e.place_id AS "placeId",
  CASE WHEN p.source_key IS NULL THEN NULL ELSE json_build_object(
    'sourceKey', p.source_key, 'name', p.name, 'latitude', p.latitude,
    'longitude', p.longitude, 'category', p.category,
    'imageUrl', p.image_url, 'notes', p.notes) END AS place
  FROM trip_entry e
  LEFT JOIN trip_source_place p ON p.trip_id = e.trip_id AND p.source_key = e.place_id
  WHERE e.trip_id = $1 AND e.day = $2::date
  ORDER BY e.variant, e.position, e.id`;

export class PgTripPlanRepository implements TripPlanRepository {
  constructor(private readonly database: Pool) {}

  async day(ownerId: string, tripId: string, day: string): Promise<PlanDay | null> {
    const trip = await this.database.query<{ version: string }>(
      `SELECT version::text AS version FROM trip
       WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
      [tripId, ownerId],
    );
    if (!trip.rows[0]) {
      return null;
    }
    const result = await this.database.query<PlanEntry>(SELECT_ENTRIES, [tripId, day]);

    return { version: trip.rows[0].version, entries: result.rows };
  }

  async upsertPlace(ownerId: string, tripId: string, place: PlanPlace): Promise<PlanPlace | null> {
    const result = await this.database.query<PlanPlace>(
      `INSERT INTO trip_source_place (trip_id, source_key, name, latitude, longitude,
        category, image_url, notes)
       SELECT t.id, $3, $4, $5, $6, $7, $8, $9 FROM trip t
       WHERE t.id = $1 AND t.owner_id = $2 AND t.deleted_at IS NULL
       ON CONFLICT (trip_id, source_key) DO UPDATE SET
         name = EXCLUDED.name, latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude, category = EXCLUDED.category,
         image_url = EXCLUDED.image_url, notes = EXCLUDED.notes
       RETURNING source_key AS "sourceKey", name, latitude, longitude,
         category, image_url AS "imageUrl", notes`,
      [
        tripId,
        ownerId,
        place.sourceKey,
        place.name,
        place.latitude,
        place.longitude,
        place.category,
        place.imageUrl,
        place.notes,
      ],
    );

    return result.rows[0] ?? null;
  }

  async replaceDay(
    ownerId: string,
    tripId: string,
    day: string,
    version: string,
    entries: readonly EntryInput[],
  ): Promise<PlanDay | "not-found" | "conflict" | "out-of-range"> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const trip = await client.query<{ version: string; startDate: string; endDate: string }>(
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
      if (
        day < current.startDate ||
        day > current.endDate ||
        entries.some((entry) => entry.day !== day)
      ) {
        await client.query("ROLLBACK");

        return "out-of-range";
      }
      await client.query("DELETE FROM trip_entry WHERE trip_id = $1 AND day = $2::date", [
        tripId,
        day,
      ]);
      if (entries.length) {
        await client.query(
          `INSERT INTO trip_entry (id, trip_id, source_key, day, variant, position, kind,
            title, time_label, detail, area, place_id)
           SELECT gen_random_uuid(), $1::uuid, e."sourceKey", $2::date,
             e.variant::char(1), e.position, e.kind, e.title, e."timeLabel",
             e.detail, e.area, e."placeId"
           FROM jsonb_to_recordset($3::jsonb) AS e(
             "sourceKey" text, variant text, position integer, kind text, title text,
             "timeLabel" text, detail text, area text, "placeId" text)`,
          [tripId, day, JSON.stringify(entries)],
        );
      }
      const updated = await client.query<{ version: string }>(
        `UPDATE trip SET version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version::text AS version`,
        [tripId],
      );
      await client.query(`DELETE FROM trip_draft WHERE trip_id = $1 AND day = $2::date`, [
        tripId,
        day,
      ]);
      const saved = await client.query<PlanEntry>(SELECT_ENTRIES, [tripId, day]);
      await client.query("COMMIT");

      return { version: updated.rows[0]!.version, entries: saved.rows };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
