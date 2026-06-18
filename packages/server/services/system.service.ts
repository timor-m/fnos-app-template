import { arch, platform, uptime } from "node:os";
import { getAppConfig } from "../utils/runtime-config";

export function getSystemSummary() {
  const config = getAppConfig();

  return {
    appName: config.appName,
    appTitle: config.appTitle,
    appPort: config.appPort,
    runtime: "nitro",
    nodePlatform: platform(),
    nodeArch: arch(),
    processUptimeSec: Math.floor(uptime())
  };
}
