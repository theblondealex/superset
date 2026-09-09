import { describe, expect, it } from "bun:test";
import { hostServiceUrl } from "./host-service-url";

describe("hostServiceUrl", () => {
	it("keeps the relay host routing prefix", () => {
		expect(
			hostServiceUrl(
				"https://relay.superset.sh/hosts/org-1:ubuntu",
				"/remote-browser/cdp",
			).toString(),
		).toBe(
			"https://relay.superset.sh/hosts/org-1:ubuntu/remote-browser/cdp",
		);
	});
});
