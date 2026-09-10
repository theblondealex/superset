import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { remoteBrowserRouter } from "./remote-browser";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

function createCaller() {
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return remoteBrowserRouter.createCaller({
		db,
		isAuthenticated: true,
	} as unknown as HostServiceContext);
}

describe("remoteBrowserRouter", () => {
	it("is disabled by default and persists changes", async () => {
		const caller = createCaller();
		expect(await caller.get()).toEqual({ enabled: false });
		expect(await caller.set({ enabled: true })).toEqual({ enabled: true });
		expect(await caller.get()).toEqual({ enabled: true });
	});
});
