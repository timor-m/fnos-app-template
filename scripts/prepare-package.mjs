#!/usr/bin/env node

import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const rootDir = resolve(dirname(new URL(import.meta.url).pathname), "..");
const packageDir = join(rootDir, ".fnos-build", "package");
const distDir = join(rootDir, "dist");
const outputDir = join(rootDir, ".server-dist");
const template = JSON.parse(readFileSync(join(rootDir, "template.config.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const version = packageJson.version || "0.1.0";
const subVersion = `${version}.0`;
const backendEnvPrefix = template.appName.toUpperCase().replace(/-/g, "_");
const uiIconPath = template.uiIconMode === "relative"
  ? "images/icon_{0}.png"
  : `/cgi/ThirdParty/${template.appName}/${template.cgiScriptName}/images/icon_{0}.png`;

if (!existsSync(outputDir)) {
  throw new Error("Missing .server-dist directory. Run `npm run build` first.");
}

rmSync(packageDir, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
mkdirSync(distDir, { recursive: true });

const appRoot = join(packageDir, "app");
const appServer = join(appRoot, "server");
const appUi = join(appRoot, "ui");
const appUiImages = join(appUi, "images");
const appConfig = join(appRoot, "config");
const appLogs = join(appRoot, "logs");
const cmdDir = join(packageDir, "cmd");
const configDir = join(packageDir, "config");
const wizardDir = join(packageDir, "wizard");

mkdirSync(appServer, { recursive: true });
mkdirSync(appUiImages, { recursive: true });
mkdirSync(appConfig, { recursive: true });
mkdirSync(appLogs, { recursive: true });
mkdirSync(cmdDir, { recursive: true });
mkdirSync(configDir, { recursive: true });
mkdirSync(wizardDir, { recursive: true });

cpSync(outputDir, appServer, { recursive: true });

const assetsDir = join(rootDir, "packages", "assets");
const iconsDir = join(assetsDir, "icons");
const generatedIconsDir = join(iconsDir, "generated");
const icon512 = join(iconsDir, "ICON.PNG");
const icon256 = join(iconsDir, "ICON_256.PNG");
const uiIconSizes = [32, 48, 64, 72, 96, 128, 256];

if (existsSync(icon512)) {
  cpSync(icon512, join(packageDir, "ICON.PNG"));
}

for (const size of uiIconSizes) {
  const generatedIcon = join(generatedIconsDir, `icon_${size}.png`);
  const fallbackIcon = size === 256 ? icon256 : icon512;

  if (existsSync(generatedIcon)) {
    cpSync(generatedIcon, join(appUiImages, `icon_${size}.png`));
    continue;
  }

  if (existsSync(fallbackIcon)) {
    cpSync(fallbackIcon, join(appUiImages, `icon_${size}.png`));
  }
}

if (existsSync(icon256)) {
  cpSync(icon256, join(packageDir, "ICON_256.PNG"));
}

const appJson = {
  name: template.appName,
  port: template.servicePort,
  logDir: `/var/apps/${template.appName}/var/log`,
  storageDir: `/var/apps/${template.appName}/var/data`
};

const privilege = {
  defaults: {
    "run-as": template.runAs
  },
  username: template.appName,
  groupname: template.appName
};

const resource = {
  "data-share": {
    shares: [
      {
        name: template.shareName,
        permission: {
          rw: [template.appName]
        }
      }
    ]
  }
};

const installWizard = [
  {
    stepTitle: "应用配置",
    items: [
      {
        type: "text",
        field: "wizard_service_port",
        label: "服务端口",
        initValue: String(template.servicePort),
        rules: [
          {
            required: true,
            message: "请输入服务端口"
          }
        ],
        helpText: "设置应用监听端口，安装后也可在应用配置中修改。"
      }
    ]
  }
];

const uninstallWizard = [
  {
    stepTitle: "确认卸载",
    items: [
      {
        type: "tips",
        helpText: "您即将卸载此应用。请选择是否删除应用数据与日志。"
      },
      {
        type: "radio",
        field: "wizard_data_action",
        label: "数据处理",
        initValue: "keep",
        options: [
          {
            label: "保留数据",
            value: "keep"
          },
          {
            label: "删除数据",
            value: "delete"
          }
        ],
        rules: [
          {
            required: true,
            message: "请选择数据处理方式"
          }
        ]
      }
    ]
  }
];

const manifest = `appname=${template.appName}
display_name=${template.displayName}
desc=${template.appDescription}
changelog=01.Initial open source template
version=${version}
sub_version=${subVersion}
platform=${template.platform}
source=${template.source}
maintainer=${template.maintainer}
maintainer_url=${template.maintainerUrl}
distributor=${template.distributor}
distributor_url=${template.distributorUrl}
desktop_uidir=ui
desktop_applaunchname=${template.desktopLaunchName}
install_dep_apps=${template.runtimeDependency}
service_port=${template.servicePort}
checkport=true
checksum=__APP_TGZ_MD5__
`;

const uiConfig = {
  ".url": {
    [template.desktopLaunchName]: {
      title: template.appTitle,
      icon: uiIconPath,
      type: "iframe",
      protocol: template.uiProtocol,
      port: template.uiPort,
      url: `/cgi/ThirdParty/${template.appName}/${template.cgiScriptName}/`,
      allUsers: template.uiAllUsers
    }
  }
};

const cgiScript = `#!/bin/sh

BACKEND_HOST="\${${backendEnvPrefix}_BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="\${${backendEnvPrefix}_BACKEND_PORT:-${template.servicePort}}"
SCRIPT_MOUNT="/cgi/ThirdParty/${template.appName}/${template.cgiScriptName}"
UI_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"

build_backend_path() {
  if [ -n "\${PATH_INFO:-}" ]; then
    case "\${PATH_INFO}" in
      "\${SCRIPT_MOUNT}")
        printf "/"
        return
        ;;
      "\${SCRIPT_MOUNT}/"*)
        printf "%s" "\${PATH_INFO#\${SCRIPT_MOUNT}}"
        return
        ;;
      /*)
        printf "%s" "\${PATH_INFO}"
        return
        ;;
    esac
  fi

  req_path="\${REQUEST_URI%%\\?*}"
  case "\${req_path}" in
    "\${SCRIPT_MOUNT}")
      printf "/"
      ;;
    "\${SCRIPT_MOUNT}/"*)
      printf "%s" "\${req_path#\${SCRIPT_MOUNT}}"
      ;;
    *)
      printf "/"
      ;;
  esac
}

BACKEND_PATH="$(build_backend_path)"
[ -z "\${BACKEND_PATH}" ] && BACKEND_PATH="/"

serve_local_asset() {
  asset_path="$1"
  full_path="\${UI_DIR}\${asset_path}"

  if [ ! -f "\${full_path}" ]; then
    echo "Status: 404"
    echo "Content-Type: text/plain; charset=utf-8"
    echo
    echo "Not Found"
    exit 0
  fi

  case "\${full_path}" in
    *.png) content_type="image/png" ;;
    *.jpg|*.jpeg) content_type="image/jpeg" ;;
    *.gif) content_type="image/gif" ;;
    *.svg) content_type="image/svg+xml" ;;
    *.ico) content_type="image/x-icon" ;;
    *) content_type="application/octet-stream" ;;
  esac

  echo "Status: 200"
  echo "Content-Type: \${content_type}"
  echo
  cat "\${full_path}"
  exit 0
}

case "\${BACKEND_PATH}" in
  /images/*|/favicon.ico)
    serve_local_asset "\${BACKEND_PATH}"
    ;;
esac

TARGET_URL="http://\${BACKEND_HOST}:\${BACKEND_PORT}\${BACKEND_PATH}"
if [ -n "\${QUERY_STRING:-}" ]; then
  TARGET_URL="\${TARGET_URL}?\${QUERY_STRING}"
fi

HEADER_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"

cleanup() {
  rm -f "\${HEADER_FILE}" "\${BODY_FILE}"
}
trap cleanup EXIT
set -- curl -sS -D "\${HEADER_FILE}" -o "\${BODY_FILE}" -X "\${REQUEST_METHOD:-GET}"

if [ -n "\${CONTENT_TYPE:-}" ]; then
  set -- "$@" -H "Content-Type: \${CONTENT_TYPE}"
fi

if [ -n "\${HTTP_COOKIE:-}" ]; then
  set -- "$@" -H "Cookie: \${HTTP_COOKIE}"
fi

if [ -n "\${HTTP_ACCEPT:-}" ]; then
  set -- "$@" -H "Accept: \${HTTP_ACCEPT}"
fi

if [ -n "\${HTTP_USER_AGENT:-}" ]; then
  set -- "$@" -H "User-Agent: \${HTTP_USER_AGENT}"
fi

if [ -n "\${CONTENT_LENGTH:-}" ] && [ "\${CONTENT_LENGTH}" -gt 0 ] 2>/dev/null; then
  cat - | "$@" --data-binary @- "\${TARGET_URL}" >/dev/null 2>&1
else
  "$@" "\${TARGET_URL}" >/dev/null 2>&1
fi

STATUS_LINE="$(head -n 1 "\${HEADER_FILE}" | tr -d '\\r')"
STATUS_CODE="$(printf "%s" "\${STATUS_LINE}" | awk '{print $2}')"

if [ -z "\${STATUS_CODE}" ]; then
  echo "Status: 502 Bad Gateway"
  echo "Content-Type: text/plain; charset=utf-8"
  echo
  echo "Proxy request failed"
  exit 0
fi

echo "Status: \${STATUS_CODE}"
awk 'BEGIN{IGNORECASE=1}
NR>1 {
  gsub(/\\r$/, "", $0)
  if ($0 == "") exit
  if ($1 ~ /^(Transfer-Encoding:|Connection:|Keep-Alive:)$/) next
  print $0
}' "\${HEADER_FILE}"
echo
cat "\${BODY_FILE}"
`;

const runSh = `#!/bin/sh
chmod +x ${template.cgiScriptName}
exit 0
`;

const cmdMain = `#!/bin/bash

LOG_FILE="\${TRIM_PKGVAR}/info.log"
PID_FILE="\${TRIM_PKGVAR}/app.pid"
NODE_BIN="/var/apps/${template.runtimeDependency}/target/bin/node"
APP_ROOT="/var/apps/\${TRIM_APPNAME}"
LEGACY_APP_ROOT="/var/apps/\${TRIM_APPNAME}/target"
SERVER_ENTRY=""

resolve_server_entry() {
    if [ -f "\${APP_ROOT}/server/server/index.mjs" ]; then
        SERVER_ENTRY="\${APP_ROOT}/server/server/index.mjs"
        return 0
    fi

    if [ -f "\${LEGACY_APP_ROOT}/server/server/index.mjs" ]; then
        SERVER_ENTRY="\${LEGACY_APP_ROOT}/server/server/index.mjs"
        return 0
    fi

    return 1
}

log_msg() {
    mkdir -p "\${TRIM_PKGVAR}"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "\${LOG_FILE}"
}

check_process() {
    local pid=$1
    kill -0 "\${pid}" 2>/dev/null
}

status() {
    if [ -f "\${PID_FILE}" ]; then
        local pid
        pid=$(head -n 1 "\${PID_FILE}" | tr -d '[:space:]')
        if check_process "\${pid}"; then
            return 0
        fi
        rm -f "\${PID_FILE}"
    fi
    return 1
}

start_process() {
    if status; then
        return 0
    fi

    log_msg "Starting ${template.appName} ..."
    if [ ! -x "\${NODE_BIN}" ]; then
        log_msg "Node runtime missing: \${NODE_BIN}"
        return 1
    fi
    if ! resolve_server_entry; then
        log_msg "Server entry not found under \${APP_ROOT} or \${LEGACY_APP_ROOT}"
        return 1
    fi
    CONFIG_PORT=""
    if [ -f "\${APP_ROOT}/config/app.json" ]; then
        CONFIG_PORT="$(sed -n 's/.*"port":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "\${APP_ROOT}/config/app.json" | head -n 1)"
    fi
    if [ -z "\${CONFIG_PORT}" ] && [ -f "\${LEGACY_APP_ROOT}/config/app.json" ]; then
        CONFIG_PORT="$(sed -n 's/.*"port":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "\${LEGACY_APP_ROOT}/config/app.json" | head -n 1)"
    fi
    APP_PORT="\${CONFIG_PORT:-${template.servicePort}}"
    APP_NAME="${template.appName}" APP_TITLE="${template.appTitle}" NITRO_PORT="\${APP_PORT}" PORT="\${APP_PORT}" HOST=0.0.0.0 NITRO_HOST=0.0.0.0 "\${NODE_BIN}" "\${SERVER_ENTRY}" >> "\${LOG_FILE}" 2>&1 &
    printf "%s" "$!" > "\${PID_FILE}"
}

stop_process() {
    if [ -r "\${PID_FILE}" ]; then
        local pid
        pid=$(head -n 1 "\${PID_FILE}" | tr -d '[:space:]')
        if check_process "\${pid}"; then
            kill -TERM "\${pid}" >> "\${LOG_FILE}" 2>&1
            sleep 2
            if check_process "\${pid}"; then
                kill -KILL "\${pid}" >> "\${LOG_FILE}" 2>&1
            fi
        fi
        rm -f "\${PID_FILE}"
    fi
}

case "$1" in
start)
    start_process
    ;;
stop)
    stop_process
    ;;
status)
    if status; then
        exit 0
    else
        exit 3
    fi
    ;;
*)
    exit 1
    ;;
esac
`;

const serviceSetup = `#!/bin/bash

PACKAGE_BASE="/var/apps/\${TRIM_APPNAME}"
LEGACY_PACKAGE_BASE="/var/apps/\${TRIM_APPNAME}/target"
LOG_FILE="\${TRIM_PKGVAR}/logs/\${TRIM_APPNAME}.log"
PID_FILE="\${TRIM_PKGVAR}/\${TRIM_APPNAME}.pid"

SVC_BACKGROUND=y
SVC_WRITE_PID=y

service_postinst() {
    mkdir -p "\${TRIM_PKGVAR}/logs/"
}

if [ -f "\${PACKAGE_BASE}/server/server/index.mjs" ]; then
    SERVER_ENTRY="\${PACKAGE_BASE}/server/server/index.mjs"
else
    SERVER_ENTRY="\${LEGACY_PACKAGE_BASE}/server/server/index.mjs"
fi

CONFIG_FILE="\${PACKAGE_BASE}/config/app.json"
if [ ! -f "\${CONFIG_FILE}" ]; then
    CONFIG_FILE="\${LEGACY_PACKAGE_BASE}/config/app.json"
fi

APP_PORT="${template.servicePort}"
if [ -f "\${CONFIG_FILE}" ]; then
    CONFIG_PORT=$(sed -n 's/.*"port":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "\${CONFIG_FILE}" | head -n 1)
    if [ -n "\${CONFIG_PORT}" ]; then
        APP_PORT="\${CONFIG_PORT}"
    fi
fi

SERVICE_COMMAND="APP_NAME=${template.appName} APP_TITLE='${template.appTitle}' NITRO_PORT=\${APP_PORT} PORT=\${APP_PORT} HOST=0.0.0.0 NITRO_HOST=0.0.0.0 /var/apps/${template.runtimeDependency}/target/bin/node \${SERVER_ENTRY}"
`;

const callbackScripts = {
  install_init: "#!/bin/bash\nexit 0\n",
  install_callback: `#!/bin/bash

NODE_BIN="/var/apps/${template.runtimeDependency}/target/bin/node"
APP_CONFIG="/var/apps/\${TRIM_APPNAME}/config/app.json"
LEGACY_APP_CONFIG="/var/apps/\${TRIM_APPNAME}/target/config/app.json"
TARGET_APP_CONFIG=""

if [ ! -x "\${NODE_BIN}" ]; then
    echo "Required runtime missing: \${NODE_BIN}" >&2
    exit 1
fi

if [ -f "\${APP_CONFIG}" ]; then
    TARGET_APP_CONFIG="\${APP_CONFIG}"
elif [ -f "\${LEGACY_APP_CONFIG}" ]; then
    TARGET_APP_CONFIG="\${LEGACY_APP_CONFIG}"
fi

if [ -n "\${TARGET_APP_CONFIG}" ] && [ -n "\${wizard_service_port:-}" ]; then
    APP_CONFIG_PATH="\${TARGET_APP_CONFIG}" APP_CONFIG_PORT="\${wizard_service_port}" "\${NODE_BIN}" <<'EOF'
const fs = require("node:fs");
const filePath = process.env.APP_CONFIG_PATH;
const port = Number(process.env.APP_CONFIG_PORT);
if (!filePath || !Number.isFinite(port) || port <= 0) {
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
config.port = port;
fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\\n", "utf8");
EOF
fi

exit 0
`,
  uninstall_init: "#!/bin/bash\nexit 0\n",
  uninstall_callback: `#!/bin/bash

if [ "\${wizard_data_action:-keep}" = "delete" ]; then
    rm -rf "/var/apps/\${TRIM_APPNAME}/var/data" "/var/apps/\${TRIM_APPNAME}/var/log"
fi

exit 0
`,
  upgrade_init: "#!/bin/bash\nexit 0\n",
  upgrade_callback: "#!/bin/bash\nexit 0\n",
  config_init: "#!/bin/bash\nexit 0\n",
  config_callback: `#!/bin/bash

APP_CONFIG="/var/apps/\${TRIM_APPNAME}/config/app.json"
LEGACY_APP_CONFIG="/var/apps/\${TRIM_APPNAME}/target/config/app.json"
TARGET_APP_CONFIG=""

if [ -f "\${APP_CONFIG}" ]; then
    TARGET_APP_CONFIG="\${APP_CONFIG}"
elif [ -f "\${LEGACY_APP_CONFIG}" ]; then
    TARGET_APP_CONFIG="\${LEGACY_APP_CONFIG}"
fi

if [ -n "\${TARGET_APP_CONFIG}" ] && [ -n "\${wizard_service_port:-}" ]; then
    APP_CONFIG_PATH="\${TARGET_APP_CONFIG}" APP_CONFIG_PORT="\${wizard_service_port}" "/var/apps/${template.runtimeDependency}/target/bin/node" <<'EOF'
const fs = require("node:fs");
const filePath = process.env.APP_CONFIG_PATH;
const port = Number(process.env.APP_CONFIG_PORT);
if (!filePath || !Number.isFinite(port) || port <= 0) {
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
config.port = port;
fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\\n", "utf8");
EOF
fi

exit 0
`
};

writeFileSync(join(packageDir, "manifest"), manifest, "utf8");
writeFileSync(join(appConfig, "app.json"), `${JSON.stringify(appJson, null, 2)}\n`, "utf8");
writeFileSync(join(appConfig, "privilege"), `${JSON.stringify(privilege, null, 2)}\n`, "utf8");
writeFileSync(join(appConfig, "resource"), `${JSON.stringify(resource, null, 2)}\n`, "utf8");
writeFileSync(join(configDir, "privilege"), `${JSON.stringify(privilege, null, 2)}\n`, "utf8");
writeFileSync(join(configDir, "resource"), `${JSON.stringify(resource, null, 2)}\n`, "utf8");
writeFileSync(join(appUi, "config"), `${JSON.stringify(uiConfig, null, 2)}\n`, "utf8");
writeFileSync(join(appUi, template.cgiScriptName), cgiScript, "utf8");
writeFileSync(join(appUi, "run.sh"), runSh, "utf8");
writeFileSync(join(cmdDir, "main"), cmdMain, "utf8");
writeFileSync(join(cmdDir, "service-setup"), serviceSetup, "utf8");

for (const [name, content] of Object.entries(callbackScripts)) {
  writeFileSync(join(cmdDir, name), content, "utf8");
}

writeFileSync(join(wizardDir, "install"), `${JSON.stringify(installWizard, null, 4)}\n`, "utf8");
writeFileSync(join(wizardDir, "config"), `${JSON.stringify(installWizard, null, 4)}\n`, "utf8");
writeFileSync(join(wizardDir, "uninstall"), `${JSON.stringify(uninstallWizard, null, 4)}\n`, "utf8");

for (const path of [
  join(appUi, template.cgiScriptName),
  join(appUi, "run.sh"),
  join(cmdDir, "main"),
  join(cmdDir, "service-setup"),
  ...Object.keys(callbackScripts).map((name) => join(cmdDir, name))
]) {
  chmodSync(path, 0o755);
}
