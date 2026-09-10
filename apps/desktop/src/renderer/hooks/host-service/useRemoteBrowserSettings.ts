import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

function queryKey(hostUrl: string | null) {
	return ["host-settings", "remote-browser", hostUrl] as const;
}

export function useRemoteBrowserSettings(
	hostUrl: string | null,
	opts?: { enabled?: boolean },
) {
	return useQuery({
		queryKey: queryKey(hostUrl),
		enabled: Boolean(hostUrl) && (opts?.enabled ?? true),
		queryFn: async () => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(hostUrl).settings.remoteBrowser.get.query();
		},
	});
}

export function useSetRemoteBrowserEnabled(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (enabled: boolean) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(hostUrl).settings.remoteBrowser.set.mutate({
				enabled,
			});
		},
		onSuccess: (data) => queryClient.setQueryData(queryKey(hostUrl), data),
	});
}
