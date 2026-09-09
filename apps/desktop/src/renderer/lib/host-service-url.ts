/** Preserve a relay host's `/hosts/<id>` prefix when resolving a service path. */
export function hostServiceUrl(hostUrl: string, path: string): URL {
	return new URL(path.replace(/^\//, ""), `${hostUrl.replace(/\/$/, "")}/`);
}
