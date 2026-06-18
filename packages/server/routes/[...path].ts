import { createError, defineEventHandler, getRequestURL, sendProxy, setResponseHeader } from "h3";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);

  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz") {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found"
    });
  }

  const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (viteDevServerUrl) {
    return sendProxy(event, `${viteDevServerUrl}${url.pathname}${url.search}`);
  }

  const safePath = normalize(url.pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(process.cwd(), ".ui-dist", safePath);

  if (!existsSync(filePath)) {
    const html = await readFile(join(process.cwd(), ".ui-dist", "index.html"), "utf8");
    setResponseHeader(event, "content-type", "text/html; charset=utf-8");
    return html;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";
  const file = await readFile(filePath);
  setResponseHeader(event, "content-type", contentType);
  return file;
});
