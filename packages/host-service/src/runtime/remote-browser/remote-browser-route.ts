import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { RemoteBrowserRuntime } from "./remote-browser-runtime";

interface DevtoolsTarget {
	id: string;
	webSocketDebuggerUrl: string;
}

export interface RegisterRemoteBrowserRouteOptions {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	runtime: RemoteBrowserRuntime;
	isEnabled: () => boolean;
}

/**
 * Opens one isolated Chromium page per Browser pane and relays CDP frames.
 * Chromium listens only on loopback; this authenticated websocket is the
 * only route a desktop client can use to reach it.
 */
export function registerRemoteBrowserRoute({
	app,
	upgradeWebSocket,
	runtime,
	isEnabled,
}: RegisterRemoteBrowserRouteOptions) {
	app.get(
		"/remote-browser/cdp",
		upgradeWebSocket((c) => {
			const initialUrl = c.req.query("url") || "about:blank";
			let upstream: WebSocket | null = null;
			let targetId: string | null = null;
			const pending: string[] = [];

			return {
				onOpen: (_event, ws) => {
					if (!isEnabled()) {
						ws.close(1008, "Remote browser is disabled for this host");
						return;
					}
					void (async () => {
						try {
							const endpoint = await runtime.endpoint();
							const response = await fetch(
								`${endpoint}/json/new?${encodeURIComponent(initialUrl)}`,
								{ method: "PUT" },
							);
							if (!response.ok) throw new Error("Chromium could not create a page.");
							const target = (await response.json()) as DevtoolsTarget;
							if (!target.id || !target.webSocketDebuggerUrl) {
								throw new Error("Chromium returned an invalid CDP target.");
							}
							targetId = target.id;
							upstream = new WebSocket(target.webSocketDebuggerUrl);
							upstream.addEventListener("open", () => {
								for (const frame of pending) upstream?.send(frame);
								pending.length = 0;
							});
							upstream.addEventListener("message", (event) =>
								ws.send(typeof event.data === "string" ? event.data : String(event.data)),
							);
							upstream.addEventListener("close", (event) =>
								ws.close(event.code === 1005 ? 1000 : event.code, event.reason),
							);
							upstream.addEventListener("error", () =>
								ws.close(1011, "Remote Chromium CDP connection failed"),
							);
						} catch (error) {
							ws.close(
								1011,
								error instanceof Error ? error.message : "Remote Chromium failed to start",
							);
						}
					})();
				},
				onMessage: (event, ws) => {
					if (upstream?.readyState === WebSocket.OPEN) {
						upstream.send(
							typeof event.data === "string" ? event.data : String(event.data),
						);
					} else {
						const frame = typeof event.data === "string" ? event.data : String(event.data);
						if (pending.length >= 64) {
							ws.close(1009, "Remote Chromium startup backlog exceeded");
							return;
						}
						pending.push(frame);
					}
				},
				onClose: () => {
					upstream?.close();
					if (targetId) {
						void runtime.endpoint().then((endpoint) =>
							fetch(`${endpoint}/json/close/${encodeURIComponent(targetId!)}`),
						);
					}
				},
				onError: () => upstream?.close(),
			};
		}),
	);
}
