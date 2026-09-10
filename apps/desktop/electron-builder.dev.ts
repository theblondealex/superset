import type { Configuration } from "electron-builder";
import baseConfig from "./electron-builder";

const productName = "Superset Dev";
const workspaceName = process.env.SUPERSET_WORKSPACE_NAME;

if (!workspaceName) {
	throw new Error("SUPERSET_WORKSPACE_NAME is required for the dev package");
}

const config: Configuration = {
	...baseConfig,
	appId: "com.superset.desktop.dev",
	productName,
	directories: {
		...baseConfig.directories,
		output: "release-dev",
	},
	mac: {
		...baseConfig.mac,
		artifactName: `Superset-Dev-\${version}-\${arch}.\${ext}`,
		extendInfo: {
			...baseConfig.mac?.extendInfo,
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},
	protocols: {
		name: productName,
		schemes: [`superset-${workspaceName}`],
	},
};

export default config;
