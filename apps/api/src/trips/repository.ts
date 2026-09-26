import type { Pool } from "pg";

export interface TripRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  coverVersion: string | null;
}

export interface TripCover {
  contentType: string;
  data: Uint8Array;
  version: string;
}

export interface TripInput {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface TripRepository {
  list(ownerId: string, limit: number, offset: number): Promise<TripRecord[]>;
  get(ownerId: string, id: string): Promise<TripRecord | null>;
  create(ownerId: string, input: TripInput): Promise<TripRecord | null>;
  update(
    ownerId: string,
    id: string,
    version: string,
    changes: Omit<TripInput, "id">,
  ): Promise<TripRecord | "not-found" | "conflict">;
  cover(ownerId: string, id: string): Promise<TripCover | null>;
  setCover(
    ownerId: string,
    id: string,
    contentType: string,
    data: Uint8Array,
  ): Promise<string | null>;
  deleteCover(ownerId: string, id: string): Promise<boolean>;
}

const COLUMNS = `id::text AS id, name, start_date::text AS "startDate",
  end_date::text AS "endDate", version::text AS version,
  created_at::text AS "createdAt", updated_at::text AS "updatedAt",
  (SELECT (extract(epoch FROM trip_cover.updated_at) * 1000000)::bigint::text
    FROM trip_cover WHERE trip_cover.trip_id = trip.id) AS "coverVersion"`;

export class PgTripRepository implements TripRepository {
  constructor(private readonly database: Pool) {}

  async list(ownerId: string, limit: number, offset: number): Promise<TripRecord[]> {
    const result = await this.database.query<TripRecord>(
      `SELECT ${COLUMNS} FROM trip
       WHERE owner_id = $1 AND deleted_at IS NULL
       ORDER BY start_date DESC, id DESC LIMIT $2 OFFSET $3`,
      [ownerId, limit, offset],
    );

    return result.rows;
  }

  async get(ownerId: string, id: string): Promise<TripRecord | null> {
    const result = await this.database.query<TripRecord>(
      `SELECT ${COLUMNS} FROM trip
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [ownerId, id],
    );

    return result.rows[0] ?? null;
  }

  async create(ownerId: string, input: TripInput): Promise<TripRecord | null> {
    const result = await this.database.query<TripRecord>(
      `INSERT INTO trip (id, owner_id, name, start_date, end_date)
       VALUES ($1, $2, $3, $4::date, $5::date)
       ON CONFLICT (id) DO UPDATE SET id = trip.id
       WHERE trip.owner_id = EXCLUDED.owner_id
         AND trip.deleted_at IS NULL
         AND trip.name = EXCLUDED.name
         AND trip.start_date = EXCLUDED.start_date
         AND trip.end_date = EXCLUDED.end_date
       RETURNING ${COLUMNS}`,
      [input.id, ownerId, input.name, input.startDate, input.endDate],
    );

    return result.rows[0] ?? null;
  }

  async update(
    ownerId: string,
    id: string,
    version: string,
    changes: Omit<TripInput, "id">,
  ): Promise<TripRecord | "not-found" | "conflict"> {
    const result = await this.database.query<TripRecord>(
      `UPDATE trip SET name = $3, start_date = $4::date, end_date = $5::date,
        version = version + 1, updated_at = now()
       WHERE owner_id = $1 AND id = $2 AND version = $6::bigint AND deleted_at IS NULL
       RETURNING ${COLUMNS}`,
      [ownerId, id, changes.name, changes.startDate, changes.endDate, version],
    );
    if (result.rows[0]) {
      return result.rows[0];
    }

    return (await this.get(ownerId, id)) ? "conflict" : "not-found";
  }

  async cover(ownerId: string, id: string): Promise<TripCover | null> {
    const result = await this.database.query<TripCover>(
      `SELECT trip_cover.content_type AS "contentType", trip_cover.data,
        (extract(epoch FROM trip_cover.updated_at) * 1000000)::bigint::text AS version
       FROM trip_cover JOIN trip ON trip.id = trip_cover.trip_id
       WHERE trip.owner_id = $1 AND trip.id = $2 AND trip.deleted_at IS NULL`,
      [ownerId, id],
    );

    return result.rows[0] ?? null;
  }

  async setCover(
    ownerId: string,
    id: string,
    contentType: string,
    data: Uint8Array,
  ): Promise<string | null> {
    const result = await this.database.query<{ version: string }>(
      `INSERT INTO trip_cover (trip_id, content_type, data, updated_at)
       SELECT id, $3, $4, clock_timestamp() FROM trip
       WHERE owner_id = $1 AND id = $2 AND deleted_at IS NULL
       ON CONFLICT (trip_id) DO UPDATE SET content_type = EXCLUDED.content_type,
         data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
       RETURNING (extract(epoch FROM updated_at) * 1000000)::bigint::text AS version`,
      [ownerId, id, contentType, Buffer.from(data)],
    );

    return result.rows[0]?.version ?? null;
  }

  async deleteCover(ownerId: string, id: string): Promise<boolean> {
    if (!(await this.get(ownerId, id))) {
      return false;
    }
    await this.database.query("DELETE FROM trip_cover WHERE trip_id = $1", [id]);

    return true;
  }
}
