import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEBUG_PORT = 9222;
const DEBUG_ORIGIN = `http://127.0.0.1:${DEBUG_PORT}`;
const STARTUP_TIMEOUT_MS = 10_000;

interface DevtoolsVersion {
	webSocketDebuggerUrl?: string;
}

async function cdpAvailable(): Promise<boolean> {
	try {
		const response = await fetch(`${DEBUG_ORIGIN}/json/version`);
		if (!response.ok) return false;
		const version = (await response.json()) as DevtoolsVersion;
		return typeof version.webSocketDebuggerUrl === "string";
	} catch {
		return false;
	}
}

async function findChromium(): Promise<string | null> {
	for (const candidate of ["google-chrome", "chromium", "chromium-browser"]) {
		try {
			const { stdout } = await execFileAsync("which", [candidate]);
			const path = stdout.trim();
			if (path) return path;
		} catch {}
	}
	return null;
}

/**
 * Owns the host-local Chromium used by remote Browser panes. CDP only binds
 * loopback; the authenticated host-service route is its sole external path.
 */
export class RemoteBrowserRuntime {
	private starting: Promise<string> | null = null;

	async endpoint(): Promise<string> {
		if (await cdpAvailable()) return DEBUG_ORIGIN;
		if (!this.starting) this.starting = this.start();
		try {
			return await this.starting;
		} finally {
			this.starting = null;
		}
	}

	private async start(): Promise<string> {
		const chromium = await findChromium();
		if (!chromium) {
			throw new Error(
				"No Chromium browser found. Install google-chrome or chromium on this host.",
			);
		}
		const { spawn } = await import("node:child_process");
		const child = spawn(
			chromium,
			[
				"--headless=new",
				"--no-first-run",
				"--no-default-browser-check",
				"--remote-debugging-address=127.0.0.1",
				`--remote-debugging-port=${DEBUG_PORT}`,
				`--user-data-dir=${join(homedir(), ".superset", "remote-browser")}`,
				"about:blank",
			],
			{ detached: true, stdio: "ignore" },
		);
		child.unref();

		const deadline = Date.now() + STARTUP_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (await cdpAvailable()) return DEBUG_ORIGIN;
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
		throw new Error("Chromium did not open its CDP endpoint within 10 seconds.");
	}
}
