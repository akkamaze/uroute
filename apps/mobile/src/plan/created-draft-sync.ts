import { accountCopiedDraftProof } from "../trips/trip-account-import";
import { loadCreatedEditDraft, saveCreatedEditDraft } from "./created-edit-plan-store";
import type { PlannedVisit } from "./plan-store";

interface DraftAddress {
  ownerId: string;
  tripId: string;
  date: string;
  option: string;
  editorKey: string;
  baseSignature: string;
}

interface RemoteDraft {
  baseVersion: string;
  revision: string;
  visits: PlannedVisit[];
}

interface RemoteTrip {
  version: string;
}

interface DraftProof {
  baseVersion: string;
  digest: string;
  revision: string | null;
}

interface SyncLane {
  queue: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  latest: PlannedVisit[] | null;
}

const lanes = new Map<string, SyncLane>();

function draftPath(address: DraftAddress): string {
  return `/api/trips/${encodeURIComponent(address.tripId)}/drafts/${address.date}/${address.option}`;
}

function deletionKey(address: DraftAddress): string {
  return `uroute.account-draft-delete.v1.${address.ownerId}.${address.tripId}.${address.date}.${address.option}`;
}

function proofKey(address: DraftAddress): string {
  return `uroute.account-draft-proof.v1.${address.ownerId}.${address.tripId}.${address.date}.${address.option}`;
}

function readProof(address: DraftAddress): DraftProof | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(proofKey(address)) ?? "null");
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const proof = value as Partial<DraftProof>;

    return typeof proof.baseVersion === "string" &&
      typeof proof.digest === "string" &&
      (proof.revision === null || typeof proof.revision === "string")
      ? (proof as DraftProof)
      : null;
  } catch {
    return null;
  }
}

function writeProof(address: DraftAddress, proof: DraftProof | null): void {
  try {
    if (proof) {
      localStorage.setItem(proofKey(address), JSON.stringify(proof));
    } else {
      localStorage.removeItem(proofKey(address));
    }
  } catch {
    // A missing proof prevents a later overwrite rather than allowing one.
  }
}

async function digestVisits(visits: readonly PlannedVisit[]): Promise<string> {
  const canonical = visits.map(({ placeId, time, notes }) => ({ placeId, time, notes }));
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function copiedProof(
  address: DraftAddress,
  remote: RemoteDraft,
  digest: string,
): DraftProof | null {
  const copied = accountCopiedDraftProof(
    address.ownerId,
    address.tripId,
    address.date,
    address.option,
  );

  return copied?.revision === remote.revision && copied.digest === digest
    ? { baseVersion: remote.baseVersion, digest, revision: remote.revision }
    : null;
}

function pendingDeletion(address: DraftAddress): boolean {
  try {
    return localStorage.getItem(deletionKey(address)) === "1";
  } catch {
    return false;
  }
}

function markDeletion(address: DraftAddress, pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(deletionKey(address), "1");
    } else {
      localStorage.removeItem(deletionKey(address));
    }
  } catch {
    // The local draft is still authoritative if this device cannot record a retry marker.
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Account draft request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function deleteRemote(address: DraftAddress): Promise<void> {
  const trip = await getJson<RemoteTrip>(`/api/trips/${encodeURIComponent(address.tripId)}`);
  if (!trip) {
    return;
  }
  const remote = await getJson<RemoteDraft>(draftPath(address));
  if (remote) {
    const digest = await digestVisits(remote.visits);
    const proof = readProof(address) ?? copiedProof(address, remote, digest);
    if (!proof || proof.revision !== remote.revision || proof.digest !== digest) {
      return;
    }
    const response = await fetch(
      `${draftPath(address)}?revision=${encodeURIComponent(remote.revision)}`,
      {
        credentials: "same-origin",
        method: "DELETE",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Account draft deletion failed: ${response.status}`);
    }
  }
  writeProof(address, { baseVersion: trip.version, digest: "", revision: null });
  markDeletion(address, false);
}

async function upload(address: DraftAddress, visits: readonly PlannedVisit[]): Promise<void> {
  if (pendingDeletion(address)) {
    return;
  }
  const trip = await getJson<RemoteTrip>(`/api/trips/${encodeURIComponent(address.tripId)}`);
  if (!trip) {
    return;
  }
  const remote = await getJson<RemoteDraft>(draftPath(address));
  const digest = await digestVisits(visits);
  const remoteDigest = remote ? await digestVisits(remote.visits) : "";
  const proof = readProof(address) ?? (remote ? copiedProof(address, remote, remoteDigest) : null);
  if (remote && remote.baseVersion === trip.version && remoteDigest === digest) {
    writeProof(address, { baseVersion: trip.version, digest, revision: remote.revision });

    return;
  }
  if (
    (proof && proof.baseVersion !== trip.version) ||
    (remote && (!proof || proof.revision !== remote.revision || proof.digest !== remoteDigest)) ||
    (!remote && proof?.revision !== undefined && proof.revision !== null)
  ) {
    return;
  }
  const response = await fetch(draftPath(address), {
    credentials: "same-origin",
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseVersion: proof?.baseVersion ?? trip.version,
      revision: proof?.revision ?? null,
      visits,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Account draft upload failed: ${response.status}`);
  }
  const saved = (await response.json()) as RemoteDraft;
  writeProof(address, { baseVersion: trip.version, digest, revision: saved.revision });
}

function lane(address: DraftAddress): SyncLane {
  const key = deletionKey(address);
  let current = lanes.get(key);
  if (!current) {
    current = { queue: Promise.resolve(), timer: null, latest: null };
    lanes.set(key, current);
  }

  return current;
}

function enqueue(current: SyncLane, task: () => Promise<void>): void {
  current.queue = current.queue.catch(() => {}).then(task);
  // The local copy remains available and the next open/online event retries a failed request.
  void current.queue.catch(() => {});
}

export function scheduleAccountDraftUpload(
  address: DraftAddress,
  visits: readonly PlannedVisit[],
): void {
  markDeletion(address, false);
  const current = lane(address);
  current.latest = visits.map((visit) => ({ ...visit }));
  if (current.timer !== null) {
    clearTimeout(current.timer);
  }
  current.timer = setTimeout(() => {
    current.timer = null;
    const latest = current.latest;
    current.latest = null;
    if (latest) {
      enqueue(current, () => upload(address, latest));
    }
  }, 550);
}

export function scheduleAccountDraftDeletion(address: DraftAddress): void {
  markDeletion(address, true);
  const current = lane(address);
  if (current.timer !== null) {
    clearTimeout(current.timer);
    current.timer = null;
  }
  current.latest = null;
  enqueue(current, () => deleteRemote(address));
}

export function retryAccountDraftDeletion(address: DraftAddress): void {
  if (pendingDeletion(address)) {
    scheduleAccountDraftDeletion(address);
  }
}

export async function restoreAccountDraft(
  address: DraftAddress,
  knownIds: ReadonlySet<string>,
  stillCurrent: () => boolean,
): Promise<void> {
  try {
    if (pendingDeletion(address)) {
      scheduleAccountDraftDeletion(address);

      return;
    }
    const trip = await getJson<RemoteTrip>(`/api/trips/${encodeURIComponent(address.tripId)}`);
    if (!trip || !stillCurrent()) {
      return;
    }
    const remote = await getJson<RemoteDraft>(draftPath(address));
    if (!stillCurrent() || pendingDeletion(address)) {
      return;
    }
    if (!remote) {
      if (!readProof(address)) {
        const copied = accountCopiedDraftProof(
          address.ownerId,
          address.tripId,
          address.date,
          address.option,
        );
        writeProof(address, {
          baseVersion: trip.version,
          digest: copied?.digest ?? "",
          revision: copied?.revision ?? null,
        });
      }

      return;
    }
    if (
      remote.baseVersion !== trip.version ||
      !Array.isArray(remote.visits) ||
      remote.visits.some((visit) => !knownIds.has(visit.placeId))
    ) {
      return;
    }
    const digest = await digestVisits(remote.visits);
    if (!stillCurrent() || pendingDeletion(address)) {
      return;
    }
    const local = loadCreatedEditDraft(address.editorKey, address.baseSignature);
    if (local) {
      const localDigest = await digestVisits(local.visits);
      if (
        stillCurrent() &&
        !pendingDeletion(address) &&
        ((localDigest === digest &&
          loadCreatedEditDraft(address.editorKey, address.baseSignature)?.updatedAt ===
            local.updatedAt) ||
          copiedProof(address, remote, digest))
      ) {
        writeProof(address, { baseVersion: trip.version, digest, revision: remote.revision });
      }

      return;
    }
    if (saveCreatedEditDraft(address.editorKey, address.baseSignature, remote.visits)) {
      writeProof(address, { baseVersion: trip.version, digest, revision: remote.revision });
    }
  } catch {
    // Offline/error: render the locally stored draft and retry on a later visit.
  }
}
