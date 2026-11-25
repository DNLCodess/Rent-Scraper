import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { scoreRow } from "./inbox";
import { areaLineage, findHighlights } from "./parser";
import { blockedSet, getPreferences, updatePreferences } from "./preferences";
import { InputError } from "./runs";
import {
  DROP_REASONS,
  type DropReason,
  type ListingAction,
  type ListingDetail,
  type ListingStatus,
  type Note,
} from "./types";

export type { DropReason, ListingAction, ListingDetail, Note } from "./types";

const ALLOWED: Record<ListingStatus, ListingStatus[]> = {
  new: ["dismissed", "shortlisted", "messaged"],
  shortlisted: ["messaged", "dropped", "dismissed"],
  messaged: ["inspection_booked", "dropped"],
  inspection_booked: ["inspected", "dropped"],
  inspected: ["negotiating", "dropped"],
  negotiating: ["got_it", "dropped"],
  got_it: [],
  dismissed: [],
  dropped: [],
};

const TRACKER: ListingStatus[] = ["shortlisted", "messaged", "inspection_booked", "inspected", "negotiating"];
const NOT_FOUND = "Listing not found";

function checkReason(reason: unknown): DropReason {
  if (!DROP_REASONS.includes(reason as DropReason)) {
    throw new InputError("Pick a reason for dropping this listing.");
  }
  return reason as DropReason;
}

function checkMoney(v: unknown, label: string): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new InputError(`${label} must be a positive amount in naira.`);
  return Math.round(n);
}

export async function getListing(id: string, now: Date = new Date()): Promise<ListingDetail | null> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT * FROM listings WHERE id = ?", args: [id] });
  const r = res.rows[0];
  if (!r) return null;
  const [prefs, blocked, notes] = await Promise.all([
    getPreferences(),
    blockedSet(),
    c.execute({ sql: "SELECT * FROM notes WHERE listing_id = ? ORDER BY created_at, rowid", args: [id] }),
  ]);
  const { item } = scoreRow(r, prefs, blocked, now);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    ...item,
    notes: notes.rows.map((n) => ({
      id: n.id as string,
      listing_id: n.listing_id as string,
      body: n.body as string,
      created_at: n.created_at as string,
    })),
    inspection_at: str(r.inspection_at),
    offer_ngn: num(r.offer_ngn),
    counter_ngn: num(r.counter_ngn),
    power_confirmed: str(r.power_confirmed),
    replied_at: str(r.replied_at),
    drop_reason: str(r.drop_reason) as DropReason | null,
    highlights: findHighlights(item.caption).map((s) => ({ start: s.start, end: s.end })),
  };
}

export async function applyAction(id: string, action: ListingAction, now: Date = new Date()): Promise<ListingDetail> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT status, prev_status FROM listings WHERE id = ?", args: [id] });
  if (!res.rows[0]) throw new InputError(NOT_FOUND);
  const status = res.rows[0].status as ListingStatus;
  const prevStatus = (res.rows[0].prev_status as ListingStatus | null) ?? null;
  const ts = now.toISOString();

  const move = async (to: ListingStatus, extra: Record<string, unknown> = {}) => {
    if (!ALLOWED[status].includes(to)) {
      throw new InputError(`This listing is ${status.replace(/_/g, " ")}, so it can't move to ${to.replace(/_/g, " ")}.`);
    }
    const cols = ["status", "prev_status", "status_changed_at", ...Object.keys(extra)];
    await c.execute({
      sql: `UPDATE listings SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
      args: [to, status, ts, ...Object.values(extra), ts, id] as never[],
    });
  };
  const addNoteRow = async (body: string) => {
    await c.execute({
      sql: "INSERT INTO notes (id, listing_id, body, created_at) VALUES (?, ?, ?, ?)",
      args: [randomUUID(), id, body, ts],
    });
  };

  switch (action.type) {
    case "dismiss":
      await move("dismissed");
      break;
    case "shortlist":
      await move("shortlisted");
      break;
    case "messaged":
      await move("messaged");
      break;
    case "replied":
      if (status !== "messaged") throw new InputError("Only a messaged listing can be marked as replied.");
      await c.execute({ sql: "UPDATE listings SET replied_at = ?, updated_at = ? WHERE id = ?", args: [ts, ts, id] });
      break;
    case "book_inspection": {
      if (typeof action.at !== "string" || Number.isNaN(Date.parse(action.at))) {
        throw new InputError("Enter a valid inspection date and time.");
      }
      if (status === "inspection_booked") {
        await c.execute({ sql: "UPDATE listings SET inspection_at = ?, updated_at = ? WHERE id = ?", args: [action.at, ts, id] });
      } else {
        if (status !== "messaged") throw new InputError("Message the agent before booking an inspection.");
        await move("inspection_booked", { inspection_at: action.at });
      }
      break;
    }
    case "log_inspection": {
      if (status !== "inspection_booked") throw new InputError("Book an inspection before logging it.");
      if (action.next !== "negotiating" && action.next !== "dropped") {
        throw new InputError("Choose whether to negotiate or drop this listing.");
      }
      const reason = action.next === "dropped" ? checkReason(action.dropReason) : null;
      const confirmed = String(action.powerConfirmed ?? "").trim();
      // Booked -> inspected -> next; the second hop records "inspected" as prev for undo.
      await move("inspected", { power_confirmed: confirmed || null });
      await c.execute({
        sql: "UPDATE listings SET status = ?, prev_status = ?, status_changed_at = ?, drop_reason = ? WHERE id = ?",
        args: [action.next, "inspected", ts, reason, id],
      });
      if (action.note?.trim()) await addNoteRow(action.note.trim());
      break;
    }
    case "offer":
      if (status !== "negotiating") throw new InputError("Offers can only be logged while negotiating.");
      await c.execute({
        sql: "UPDATE listings SET offer_ngn = ?, counter_ngn = ?, updated_at = ? WHERE id = ?",
        args: [checkMoney(action.offer, "Offer"), checkMoney(action.counter, "Counter"), ts, id],
      });
      break;
    case "drop":
      await move("dropped", { drop_reason: checkReason(action.reason) });
      break;
    case "got_it": {
      if (status !== "negotiating") throw new InputError("Only a listing you're negotiating can be marked as got it.");
      await move("got_it");
      const ph = TRACKER.map(() => "?").join(",");
      await c.execute({
        sql: `UPDATE listings SET archived = 1 WHERE id != ? AND archived = 0 AND status IN (${ph})`,
        args: [id, ...TRACKER],
      });
      await updatePreferences({ huntState: "done" });
      break;
    }
    case "undo": {
      if (!prevStatus) throw new InputError("There is nothing to undo on this listing.");
      await c.execute({
        sql: "UPDATE listings SET status = ?, prev_status = NULL, status_changed_at = ?, updated_at = ? WHERE id = ?",
        args: [prevStatus, ts, ts, id],
      });
      if (status === "got_it") await reopenHunt();
      break;
    }
    default:
      throw new InputError("Unknown action.");
  }
  return (await getListing(id, now))!;
}

async function dismissOrShortlistNew(ids: string[], to: ListingStatus, extraSql = "", extraArgs: unknown[] = []) {
  if (ids.length === 0) return { changed: 0 };
  const ts = new Date().toISOString();
  const res = await (await db()).execute({
    sql: `UPDATE listings SET status = ?, prev_status = 'new', status_changed_at = ?, updated_at = ?
          WHERE status = 'new' AND archived = 0 AND id IN (${ids.map(() => "?").join(",")}) ${extraSql}`,
    args: [to, ts, ts, ...ids, ...extraArgs] as never[],
  });
  return { changed: res.rowsAffected };
}

/** Dismiss or shortlist several listings; anything no longer `new` is left alone. */
export async function batchAction(ids: string[], type: "dismiss" | "shortlist"): Promise<{ changed: number }> {
  if (type !== "dismiss" && type !== "shortlist") throw new InputError("Unknown batch action.");
  if (!Array.isArray(ids)) throw new InputError("ids must be an array");
  return dismissOrShortlistNew(ids.map(String), type === "dismiss" ? "dismissed" : "shortlisted");
}

/** Dismiss every `new` listing by an author, or in an area (including its sub-areas). */
export async function dismissWhere(by: { author: string } | { area: string }): Promise<{ changed: number }> {
  const c = await db();
  const rows = (await c.execute("SELECT id, author, area FROM listings WHERE status = 'new' AND archived = 0")).rows;
  let ids: string[];
  if ("author" in by) {
    const h = String(by.author ?? "").trim().replace(/^@+/, "").toLowerCase();
    if (!h) throw new InputError("Enter an agent handle.");
    ids = rows.filter((r) => String(r.author).replace(/^@+/, "").toLowerCase() === h).map((r) => r.id as string);
  } else {
    const a = String(by.area ?? "").trim().toLowerCase();
    if (!a) throw new InputError("Enter an area.");
    ids = rows
      .filter((r) => r.area && areaLineage(r.area as string).some((x) => x.toLowerCase() === a))
      .map((r) => r.id as string);
  }
  return dismissOrShortlistNew(ids, "dismissed");
}

export async function addNote(id: string, body: string, now: Date = new Date()): Promise<Note> {
  const text = String(body ?? "").trim();
  if (!text) throw new InputError("Write something before saving the note.");
  const c = await db();
  const exists = await c.execute({ sql: "SELECT 1 FROM listings WHERE id = ?", args: [id] });
  if (!exists.rows[0]) throw new InputError(NOT_FOUND);
  const note: Note = { id: randomUUID(), listing_id: id, body: text, created_at: now.toISOString() };
  await c.execute({
    sql: "INSERT INTO notes (id, listing_id, body, created_at) VALUES (?, ?, ?, ?)",
    args: [note.id, id, note.body, note.created_at],
  });
  return note;
}

/** Brings every archived listing back and reopens the hunt. */
export async function reopenHunt(): Promise<void> {
  await (await db()).execute("UPDATE listings SET archived = 0 WHERE archived = 1");
  await updatePreferences({ huntState: "active" });
}
