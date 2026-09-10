import { eq } from "drizzle-orm";
import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const HOST_SETTINGS_ID = 1;

export function isRemoteBrowserEnabled(
	ctx: Pick<HostServiceContext, "db">,
): boolean {
	return (
		ctx.db
			.select({ enabled: hostSettings.remoteBrowserEnabled })
			.from(hostSettings)
			.where(eq(hostSettings.id, HOST_SETTINGS_ID))
			.get()?.enabled ?? false
	);
}

export const remoteBrowserRouter = router({
	get: protectedProcedure.query(({ ctx }) => ({
		enabled: isRemoteBrowserEnabled(ctx),
	})),
	set: protectedProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.insert(hostSettings)
				.values({ id: HOST_SETTINGS_ID, remoteBrowserEnabled: input.enabled })
				.onConflictDoUpdate({
					target: hostSettings.id,
					set: { remoteBrowserEnabled: input.enabled },
				})
				.run();
			return { enabled: input.enabled };
		}),
});
