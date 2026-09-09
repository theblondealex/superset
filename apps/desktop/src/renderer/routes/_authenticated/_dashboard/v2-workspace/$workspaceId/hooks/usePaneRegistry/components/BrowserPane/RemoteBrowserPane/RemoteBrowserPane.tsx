import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { BrowserPaneData, PaneViewerData } from "../../../../../types";
import { DEFAULT_BROWSER_URL } from "../constants";
import { remoteBrowserRegistry } from "./remoteBrowserRegistry";

interface RemoteBrowserPaneProps {
	ctx: RendererContext<PaneViewerData>;
	hostUrl: string;
}

export function RemoteBrowserPane({ ctx, hostUrl }: RemoteBrowserPaneProps) {
	const paneId = ctx.pane.id;
	const containerRef = useRef<HTMLDivElement>(null);
	const pane = ctx.pane.data as BrowserPaneData;
	const state = useSyncExternalStore(
		(listener) => remoteBrowserRegistry.onStateChange(paneId, listener),
		() => remoteBrowserRegistry.getState(paneId),
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		remoteBrowserRegistry.attach({
			paneId,
			container,
			hostUrl,
			initialUrl: pane.url || DEFAULT_BROWSER_URL,
			onPersist: (url, pageTitle) => {
				const current = ctx.pane.data as BrowserPaneData;
				ctx.actions.updateData({ ...current, url, pageTitle });
			},
		});
		return () => remoteBrowserRegistry.detach(paneId);
	}, [paneId, hostUrl]);

	return (
		<div
			ref={containerRef}
			tabIndex={0}
			className="relative size-full overflow-hidden bg-background outline-none"
			onMouseMove={(event) => remoteBrowserRegistry.dispatchMouse(paneId, "mouseMoved", event.nativeEvent, event.currentTarget.getBoundingClientRect())}
			onMouseDown={(event) => {
				event.currentTarget.focus();
				remoteBrowserRegistry.dispatchMouse(paneId, "mousePressed", event.nativeEvent, event.currentTarget.getBoundingClientRect());
			}}
			onMouseUp={(event) => remoteBrowserRegistry.dispatchMouse(paneId, "mouseReleased", event.nativeEvent, event.currentTarget.getBoundingClientRect())}
			onWheel={(event) => {
				event.preventDefault();
				remoteBrowserRegistry.dispatchMouse(paneId, "mouseWheel", event.nativeEvent, event.currentTarget.getBoundingClientRect());
			}}
			onKeyDown={(event) => {
				event.preventDefault();
				remoteBrowserRegistry.dispatchKey(paneId, "keyDown", event.nativeEvent);
			}}
			onKeyUp={(event) => remoteBrowserRegistry.dispatchKey(paneId, "keyUp", event.nativeEvent)}
		>
			{state.frame && <img src={state.frame} alt="Remote Chromium" className="size-full object-fill select-none" draggable={false} />}
			{!state.frame && (
				<div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
					{state.error ? <Trans>Connection failed.</Trans> : <Trans>Loading…</Trans>}
				</div>
			)}
		</div>
	);
}
