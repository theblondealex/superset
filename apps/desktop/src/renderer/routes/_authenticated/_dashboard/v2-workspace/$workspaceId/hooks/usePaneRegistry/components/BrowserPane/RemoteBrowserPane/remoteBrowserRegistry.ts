import { getHostServiceWsToken, getHostServiceWsUrlParams } from "renderer/lib/host-service-auth";
import { sanitizeUrl } from "../sanitizeUrl";

export interface RemoteBrowserState {
	currentUrl: string;
	pageTitle: string;
	isLoading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	frame: string | null;
	error: boolean;
}

interface Entry {
	state: RemoteBrowserState;
	socket: WebSocket | null;
	nextId: number;
	pending: Map<number, (result: unknown) => void>;
	listeners: Set<() => void>;
	resizeObserver: ResizeObserver | null;
	container: HTMLElement | null;
	onPersist: (url: string, title: string) => void;
}

const EMPTY_STATE: RemoteBrowserState = {
	currentUrl: "about:blank",
	pageTitle: "",
	isLoading: true,
	canGoBack: false,
	canGoForward: false,
	frame: null,
	error: false,
};

function socketUrl(hostUrl: string, initialUrl: string): string {
	const url = new URL("/remote-browser/cdp", hostUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("url", initialUrl);
	const token = getHostServiceWsToken(hostUrl);
	if (token) url.searchParams.set("token", token);
	for (const [key, value] of Object.entries(getHostServiceWsUrlParams(hostUrl) ?? {})) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

class RemoteBrowserRegistry {
	private entries = new Map<string, Entry>();
	private listenersByPaneId = new Map<string, Set<() => void>>();

	private listeners(paneId: string) {
		let listeners = this.listenersByPaneId.get(paneId);
		if (!listeners) {
			listeners = new Set();
			this.listenersByPaneId.set(paneId, listeners);
		}
		return listeners;
	}

	getState(paneId: string): RemoteBrowserState {
		return this.entries.get(paneId)?.state ?? EMPTY_STATE;
	}

	onStateChange(paneId: string, listener: () => void): () => void {
		const listeners = this.listeners(paneId);
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	private update(paneId: string, patch: Partial<RemoteBrowserState>) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.state = { ...entry.state, ...patch };
		for (const listener of entry.listeners) listener();
	}

	private send(paneId: string, method: string, params?: Record<string, unknown>) {
		const entry = this.entries.get(paneId);
		if (!entry?.socket || entry.socket.readyState !== WebSocket.OPEN) return;
		const id = entry.nextId++;
		entry.socket.send(JSON.stringify({ id, method, params }));
		return new Promise<unknown>((resolve) => entry.pending.set(id, resolve));
	}

	private refreshHistory(paneId: string) {
		const request = this.send(paneId, "Page.getNavigationHistory");
		if (!request) return;
		void request.then((result) => {
			const history = result as {
				result?: { currentIndex: number; entries: unknown[] };
			};
			const value = history.result;
			if (!value) return;
			this.update(paneId, {
				canGoBack: value.currentIndex > 0,
				canGoForward: value.currentIndex < value.entries.length - 1,
			});
		});
	}

	private resize(paneId: string) {
		const entry = this.entries.get(paneId);
		const container = entry?.container;
		if (!container) return;
		void this.send(paneId, "Emulation.setDeviceMetricsOverride", {
			width: Math.max(1, Math.floor(container.clientWidth)),
			height: Math.max(1, Math.floor(container.clientHeight)),
			deviceScaleFactor: window.devicePixelRatio,
			mobile: false,
		});
	}

	attach(input: {
		paneId: string;
		container: HTMLElement;
		hostUrl: string;
		initialUrl: string;
		onPersist: (url: string, title: string) => void;
	}) {
		this.detach(input.paneId);
		const entry: Entry = {
			state: { ...EMPTY_STATE, currentUrl: input.initialUrl },
			socket: null,
			nextId: 1,
			pending: new Map(),
			listeners: this.listeners(input.paneId),
			resizeObserver: null,
			container: input.container,
			onPersist: input.onPersist,
		};
		this.entries.set(input.paneId, entry);
		const socket = new WebSocket(socketUrl(input.hostUrl, input.initialUrl));
		entry.socket = socket;
		socket.addEventListener("open", () => {
			void this.send(input.paneId, "Page.enable");
			void this.send(input.paneId, "Runtime.enable");
			this.resize(input.paneId);
			void this.send(input.paneId, "Page.startScreencast", {
				format: "jpeg",
				quality: 80,
				everyNthFrame: 1,
			});
			this.refreshHistory(input.paneId);
			entry.resizeObserver = new ResizeObserver(() => this.resize(input.paneId));
			entry.resizeObserver.observe(input.container);
		});
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as {
				id?: number;
				result?: unknown;
				method?: string;
				params?: Record<string, unknown>;
			};
			if (message.id) {
				entry.pending.get(message.id)?.(message);
				entry.pending.delete(message.id);
				return;
			}
			if (message.method === "Page.screencastFrame") {
				const data = message.params?.data;
				const sessionId = message.params?.sessionId;
				if (typeof data === "string") {
					this.update(input.paneId, { frame: `data:image/jpeg;base64,${data}`, error: false });
				}
				if (typeof sessionId === "number") {
					void this.send(input.paneId, "Page.screencastFrameAck", { sessionId });
				}
				return;
			}
			if (message.method === "Page.frameNavigated") {
				const frame = message.params?.frame as { parentId?: string; url?: string } | undefined;
				if (!frame || frame.parentId || !frame.url) return;
				this.update(input.paneId, { currentUrl: frame.url, isLoading: true });
				return;
			}
			if (message.method === "Page.loadEventFired") {
				this.update(input.paneId, { isLoading: false });
				this.refreshHistory(input.paneId);
				return;
			}
			if (message.method === "Runtime.executionContextCreated") {
				const request = this.send(input.paneId, "Runtime.evaluate", {
					expression: "document.title",
					returnByValue: true,
				});
				if (!request) return;
				void request.then((result) => {
					const title = (result as { result?: { result?: { value?: unknown } } }).result?.result?.value;
					if (typeof title !== "string") return;
					const current = this.getState(input.paneId);
					this.update(input.paneId, { pageTitle: title });
					entry.onPersist(current.currentUrl, title);
				});
			}
		});
		socket.addEventListener("close", (event) => {
			this.update(input.paneId, {
				isLoading: false,
					error: true,
			});
		});
		socket.addEventListener("error", () =>
			this.update(input.paneId, { isLoading: false, error: true }),
		);
	}

	detach(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.resizeObserver?.disconnect();
		entry.socket?.close();
		this.entries.delete(paneId);
	}

	navigate(paneId: string, url: string) {
		const target = sanitizeUrl(url);
		if (!target) return;
		this.update(paneId, { isLoading: true });
		void this.send(paneId, "Page.navigate", { url: target });
	}

	reload(paneId: string) {
		this.update(paneId, { isLoading: true });
		void this.send(paneId, "Page.reload", { ignoreCache: false });
	}

	goBack(paneId: string) {
		const request = this.send(paneId, "Page.getNavigationHistory");
		if (!request) return;
		void request.then((result) => {
			const history = (result as { result?: { currentIndex: number; entries: { id: number }[] } }).result;
			if (history && history.currentIndex > 0) {
				void this.send(paneId, "Page.navigateToHistoryEntry", {
					entryId: history.entries[history.currentIndex - 1]?.id,
				});
			}
		});
	}

	goForward(paneId: string) {
		const request = this.send(paneId, "Page.getNavigationHistory");
		if (!request) return;
		void request.then((result) => {
			const history = (result as { result?: { currentIndex: number; entries: { id: number }[] } }).result;
			if (history && history.currentIndex < history.entries.length - 1) {
				void this.send(paneId, "Page.navigateToHistoryEntry", {
					entryId: history.entries[history.currentIndex + 1]?.id,
				});
			}
		});
	}

	dispatchMouse(paneId: string, type: string, event: MouseEvent | WheelEvent, rect: DOMRect) {
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		void this.send(paneId, "Input.dispatchMouseEvent", {
			type,
			x,
			y,
			button: event instanceof MouseEvent ? event.button === 2 ? "right" : "left" : "none",
			clickCount: type === "mousePressed" || type === "mouseReleased" ? 1 : 0,
			...(event instanceof WheelEvent ? { deltaX: event.deltaX, deltaY: event.deltaY } : {}),
		});
	}

	dispatchKey(paneId: string, type: "keyDown" | "keyUp", event: KeyboardEvent) {
		void this.send(paneId, "Input.dispatchKeyEvent", {
			type,
			key: event.key,
			code: event.code,
			text: type === "keyDown" && event.key.length === 1 ? event.key : undefined,
			unmodifiedText: type === "keyDown" && event.key.length === 1 ? event.key : undefined,
		});
	}
}

export const remoteBrowserRegistry = new RemoteBrowserRegistry();
