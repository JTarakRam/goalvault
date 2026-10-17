import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AuditEvent,
  Consent,
  Goal,
  LedgerEntry,
  Mandate,
  Notification,
  Transaction,
  User,
} from "./types.js";

export interface DB {
  users: User[];
  goals: Goal[];
  mandates: Mandate[];
  consents: Consent[];
  transactions: Transaction[];
  ledger: LedgerEntry[];
  notifications: Notification[];
  audit: AuditEvent[];
  /** Provider webhook event ids already processed (replay protection). */
  processedEvents: string[];
}

const empty = (): DB => ({
  users: [],
  goals: [],
  mandates: [],
  consents: [],
  transactions: [],
  ledger: [],
  notifications: [],
  audit: [],
  processedEvents: [],
});

/**
 * Minimal JSON-file store so the project runs with zero infrastructure.
 * Production should use Postgres with SERIALIZABLE transactions around ledger writes;
 * the Store interface is intentionally small to make that swap straightforward.
 */
export class Store {
  data: DB;
  constructor(private file: string | null) {
    this.data = file && existsSync(file) ? { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) } : empty();
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file); // atomic replace
  }
}
