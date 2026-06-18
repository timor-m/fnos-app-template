import { defineEventHandler, getRequestURL, sendProxy, setResponseHeader } from "h3";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export default defineEventHandler(async (event) => {
  const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (viteDevServerUrl) {
    return sendProxy(event, `${viteDevServerUrl}${getRequestURL(event).pathname}${getRequestURL(event).search}`);
  }

  const html = await readFile(join(process.cwd(), ".ui-dist", "index.html"), "utf8");
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  return html;
});
