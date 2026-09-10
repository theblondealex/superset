import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import {
	useRemoteBrowserSettings,
	useSetRemoteBrowserEnabled,
} from "renderer/hooks/host-service/useRemoteBrowserSettings";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

interface RemoteBrowserSectionProps {
	hostUrl: string | null;
	isOnline: boolean;
	canEdit: boolean;
}

export function RemoteBrowserSection({
	hostUrl,
	isOnline,
	canEdit,
}: RemoteBrowserSectionProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const settings = useRemoteBrowserSettings(hostUrl, { enabled: isOnline });
	const setEnabled = useSetRemoteBrowserEnabled(hostUrl);
	const disabled =
		!hostUrl ||
		!isOnline ||
		!canEdit ||
		settings.isLoading ||
		setEnabled.isPending;

	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-6">
				<div className="space-y-1 flex-1">
					<Label htmlFor="use-host-browser" className="text-sm font-medium">
						<HighlightText
							text={t({ message: "Use this host's browser" })}
							query={searchQuery}
						/>
					</Label>
					<p className="text-xs text-muted-foreground">
						<Trans>
							Open Browser panes in Chromium running on this host. Its localhost
							and user agent are used instead of this Mac's, and its ports are not
							forwarded to your Mac.
						</Trans>
					</p>
					{!canEdit && (
						<p className="text-xs text-muted-foreground">
							<Trans>Only host owners can change this setting.</Trans>
						</p>
					)}
				</div>
				<Switch
					id="use-host-browser"
					checked={settings.data?.enabled ?? false}
					disabled={disabled}
					onCheckedChange={(enabled) => setEnabled.mutate(enabled)}
				/>
			</div>
		</section>
	);
}
