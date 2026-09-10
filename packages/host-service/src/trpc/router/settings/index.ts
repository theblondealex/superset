import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { branchPrefixRouter } from "./branch-prefix";
import { remoteBrowserRouter } from "./remote-browser";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	branchPrefix: branchPrefixRouter,
	remoteBrowser: remoteBrowserRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { HostWorktreeLocationSettings } from "./worktree-location";
