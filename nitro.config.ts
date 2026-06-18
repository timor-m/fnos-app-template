import templateConfig from "./template.config.json" with { type: "json" };

export default defineNitroConfig({
  preset: "node-server",
  serverDir: "packages/server",
  output: {
    dir: ".server-dist"
  },
  publicAssets: [
    {
      dir: ".ui-dist"
    }
  ],
  runtimeConfig: {
    appName: templateConfig.appName,
    appTitle: templateConfig.appTitle,
    appPort: templateConfig.servicePort,
    logLevel: templateConfig.logLevel,
    logDir: `/var/apps/${templateConfig.appName}/var/log`,
    storageDir: `/var/apps/${templateConfig.appName}/var/data`
  },
  routeRules: {
    "/": {
      prerender: false
    },
    "/healthz": {
      headers: {
        "cache-control": "no-store"
      }
    }
  }
});
