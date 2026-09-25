import type { Pool } from "pg";

export interface DraftVisit {
  placeId: string;
  time: string;
  notes: string;
}

export interface TripDraft {
  day: string;
  variant: string;
  baseVersion: string;
  revision: string;
  visits: DraftVisit[];
  updatedAt: string;
}

export interface TripDraftRepository {
  get(ownerId: string, tripId: string, day: string, variant: string): Promise<TripDraft | null>;
  put(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
    baseVersion: string,
    expectedRevision: string | null,
    visits: readonly DraftVisit[],
  ): Promise<TripDraft | "not-found" | "out-of-range" | "conflict">;
  delete(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
    expectedRevision: string,
  ): Promise<"deleted" | "not-found" | "conflict">;
}

const COLUMNS = `day::text AS day, variant, base_version::text AS "baseVersion",
  revision::text AS revision, visits, updated_at::text AS "updatedAt"`;
const JOIN_COLUMNS = `d.day::text AS day, d.variant, d.base_version::text AS "baseVersion",
  d.revision::text AS revision, d.visits, d.updated_at::text AS "updatedAt"`;

export class PgTripDraftRepository implements TripDraftRepository {
  constructor(private readonly database: Pool) {}

  async get(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
  ): Promise<TripDraft | null> {
    const result = await this.database.query<TripDraft>(
      `SELECT ${JOIN_COLUMNS} FROM trip_draft d
       JOIN trip t ON t.id = d.trip_id
       WHERE t.owner_id = $1 AND t.deleted_at IS NULL AND d.trip_id = $2
         AND d.day = $3::date AND d.variant = $4`,
      [ownerId, tripId, day, variant],
    );

    return result.rows[0] ?? null;
  }

  async put(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
    baseVersion: string,
    expectedRevision: string | null,
    visits: readonly DraftVisit[],
  ): Promise<TripDraft | "not-found" | "out-of-range" | "conflict"> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      const trip = await client.query<{ startDate: string; endDate: string; version: string }>(
        `SELECT start_date::text AS "startDate", end_date::text AS "endDate",
           version::text AS version FROM trip
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [tripId, ownerId],
      );
      const current = trip.rows[0];
      if (!current) {
        await client.query("ROLLBACK");

        return "not-found";
      }
      if (day < current.startDate || day > current.endDate) {
        await client.query("ROLLBACK");

        return "out-of-range";
      }
      if (current.version !== baseVersion) {
        await client.query("ROLLBACK");

        return "conflict";
      }
      const saved =
        expectedRevision === null
          ? await client.query<TripDraft>(
              `INSERT INTO trip_draft (trip_id, day, variant, base_version, visits)
           VALUES ($1, $2::date, $3, $4::bigint, $5::jsonb)
           ON CONFLICT (trip_id, day, variant) DO NOTHING
           RETURNING ${COLUMNS}`,
              [tripId, day, variant, baseVersion, JSON.stringify(visits)],
            )
          : await client.query<TripDraft>(
              `UPDATE trip_draft SET base_version = $4::bigint, visits = $5::jsonb,
             revision = revision + 1, updated_at = now()
           WHERE trip_id = $1 AND day = $2::date AND variant = $3
             AND revision = $6::bigint
           RETURNING ${COLUMNS}`,
              [tripId, day, variant, baseVersion, JSON.stringify(visits), expectedRevision],
            );
      if (!saved.rows[0]) {
        await client.query("ROLLBACK");

        return "conflict";
      }
      await client.query("COMMIT");

      return saved.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(
    ownerId: string,
    tripId: string,
    day: string,
    variant: string,
    expectedRevision: string,
  ): Promise<"deleted" | "not-found" | "conflict"> {
    const result = await this.database.query(
      `DELETE FROM trip_draft d USING trip t
       WHERE d.trip_id = t.id AND t.owner_id = $1 AND t.deleted_at IS NULL
         AND d.trip_id = $2 AND d.day = $3::date AND d.variant = $4
         AND d.revision = $5::bigint`,
      [ownerId, tripId, day, variant, expectedRevision],
    );
    if (result.rowCount) {
      return "deleted";
    }
    const draft = await this.get(ownerId, tripId, day, variant);

    return draft ? "conflict" : "not-found";
  }
}
