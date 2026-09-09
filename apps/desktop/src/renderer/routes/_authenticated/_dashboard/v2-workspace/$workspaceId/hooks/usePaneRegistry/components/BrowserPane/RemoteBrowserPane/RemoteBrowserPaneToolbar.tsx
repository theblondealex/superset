import type { RendererContext } from "@superset/panes";
import { useSyncExternalStore } from "react";
import type { PaneViewerData } from "../../../../../types";
import { BrowserToolbar } from "../components/BrowserToolbar";
import { remoteBrowserRegistry } from "./remoteBrowserRegistry";

export function RemoteBrowserPaneToolbar({ ctx }: { ctx: RendererContext<PaneViewerData> }) {
	const paneId = ctx.pane.id;
	const state = useSyncExternalStore(
		(listener) => remoteBrowserRegistry.onStateChange(paneId, listener),
		() => remoteBrowserRegistry.getState(paneId),
	);
	return (
		<BrowserToolbar
			currentUrl={state.currentUrl}
			faviconUrl={null}
			isLoading={state.isLoading}
			canGoBack={state.canGoBack}
			canGoForward={state.canGoForward}
			onGoBack={() => remoteBrowserRegistry.goBack(paneId)}
			onGoForward={() => remoteBrowserRegistry.goForward(paneId)}
			onReload={() => remoteBrowserRegistry.reload(paneId)}
			onNavigate={(url) => remoteBrowserRegistry.navigate(paneId, url)}
		/>
	);
}
