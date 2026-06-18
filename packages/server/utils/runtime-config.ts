import templateConfig from "../../../template.config.json" with { type: "json" };

export type AppRuntimeConfig = {
  appName: string;
  appTitle: string;
  appPort: number;
  logLevel: string;
  logDir: string;
  storageDir: string;
};

export function getAppConfig(): AppRuntimeConfig {
  const appName = process.env.APP_NAME || templateConfig.appName;

  return {
    appName,
    appTitle: process.env.APP_TITLE || templateConfig.appTitle,
    appPort: Number(process.env.NITRO_PORT || process.env.PORT || templateConfig.servicePort),
    logLevel: process.env.LOG_LEVEL || templateConfig.logLevel,
    logDir: process.env.LOG_DIR || `/var/apps/${appName}/var/log`,
    storageDir: process.env.STORAGE_DIR || `/var/apps/${appName}/var/data`
  };
}
