# fnOS 应用 OCR 集成指南

本文整理自 fnos-app-health-records（健康档案）项目的 OCR 落地经验，面向需要在本模板基础上接入 OCR 能力的脚手架项目。目标是：按清单复制与接线即可跑通，并避开已在真实设备上踩过的坑。

健康档案场景的 OCR 特点：输入是用户拍照的 HEIC/JPEG/PNG 和机构 PDF（文本层、扫描件、混合件都有），运行环境是 x86/ARM64 低功耗 NAS（如 Intel J4105），内存小、无 GPU、网络可能只能走国内镜像。以下设计都是围绕这些约束做出的，普通文档识别场景可以直接复用。

## 1. 总体架构

三个关键决策，后续的坑基本都围绕它们展开：

1. **Nitro 主进程不引入任何原生图像/PDF 依赖**。PyMuPDF、Pillow、OCR 引擎全部隔离在一个常驻 Python worker 进程中，通过 stdin/stdout 的 NDJSON（每行一个 JSON）通信。这样 Nitro 打包、跨架构构建、fnOS 依赖审查都不受原生模块影响。
2. **OCR 运行环境不打包进应用包（.fpk/镜像），而是按需安装到应用数据目录**。venv 体积大、平台相关且需要下载模型，打进包里会让包膨胀且无法跨架构。fnOS 下数据目录是 `TRIM_PKGVAR/data`，应用升级、重装、Docker 重建容器后环境继续可用。模板项目同样遵循"运行数据放 `TRIM_PKGVAR`"的规范，OCR venv 只是其中一部分。
3. **基础 OCR 与表格结构增强是两套相互独立的环境**。基础环境（RapidOCR + PyMuPDF + Pillow）先可用；表格增强（RapidTable + RapidLayout）作为可选组件安装到独立目录，通过原子指针切换，失败不影响基础 OCR。

```text
Nitro server
  └─ ocr-worker-client.ts      请求队列、超时、进程回收、心跳判定
       └─ worker.py (常驻)      RapidOCR 推理 + PDF 渲染 + 文本层融合
            ├─ 基础 venv:  $DATA/ocr-venv            (setup-runtime.sh)
            └─ 表格增强:   $DATA/ocr-table/runtime-*  (install_table_runtime.py)
                            $DATA/ocr-table/active.json 原子指向当前环境
```

## 2. 快速植入清单

从健康档案仓库复制以下文件（路径以该仓库为准），再按后面的步骤接线。

**必需（基础 OCR）：**

| 文件 | 作用 |
| --- | --- |
| `packages/ocr-worker/worker.py` | 常驻 worker：格式探测、PDF 文本层提取与渲染融合、OCR 推理、心跳、内存自我回收 |
| `packages/ocr-worker/requirements.txt` | 基础依赖，见第 5 节的版本约束原因 |
| `packages/ocr-worker/setup-runtime.sh` | 按需安装脚本：私有 Python 兜底、venv 创建、pip 安装、自检、就绪标记 |
| `packages/server/services/ocr-worker-client.ts` | Nitro 侧客户端：单进程串行队列、三级超时、进程回收、stderr 过滤 |
| `packages/server/services/ocr-runtime.service.ts` | 安装状态机、pip 镜像目录、环境探测与状态 API 支撑 |

**可选（表格结构增强，体检/检验报告类场景建议加）：**

| 文件 | 作用 |
| --- | --- |
| `packages/ocr-worker/table_structure.py` | RapidTable/RapidLayout 推理与单元格几何输出 |
| `packages/ocr-worker/install_table_runtime.py` + `requirements-table.txt` + `upgrade-runtime.sh` | 独立环境构建、模型下载与 sha256 校验、原子发布 |
| `packages/server/services/ocr-table-structure.ts` / `ocr-table-columns.ts` | 单元格归属、列恢复、歧义判定 |

**路由与 UI（安装流程的用户入口）：**

| 文件 | 作用 |
| --- | --- |
| `packages/server/routes/api/ocr/status.get.ts` | 安装状态、运行环境信息、日志 tail（路由很薄，逻辑都在 service） |
| `packages/server/routes/api/ocr/install.post.ts` | 触发安装/升级，幂等 |
| `packages/server/routes/api/ocr/settings.get.ts` / `settings.put.ts` | pip 镜像设置的读写 |
| `packages/ui/src/pages/settings/RuntimeSettingsPage.vue` | 管理员"运行环境"页面：状态展示、安装/重试按钮、镜像选择、日志查看 |

**接线步骤：**

1. 在 `runtime-config` 中提供 `OCR_PYTHON_BIN`（默认 `$DATA/ocr-venv/bin/python`）、`OCR_WORKER_SCRIPT`、`OCR_SETUP_SCRIPT` 三个配置项并支持环境变量覆盖。fnOS 下 `$DATA` 必须解析到 `TRIM_PKGVAR/data`，Docker 下解析到挂载的 `/data`，本地开发解析到 `.data`。
2. 打包脚本把 `packages/ocr-worker/` 的源码复制进应用包（只复制 `.py`/`.sh`/`.txt`，**不复制 venv 和模型**），并在启动脚本里写入三个环境变量，指向包内和数据目录的绝对路径：

   ```sh
   cpSync("packages/ocr-worker", "${TRIM_APPDEST}/ocr-worker", { recursive: true })
   # 启动脚本（cmd/main 或 launcher）中：
   OCR_WORKER_SCRIPT="${TRIM_APPDEST}/ocr-worker/worker.py"
   OCR_SETUP_SCRIPT="${TRIM_APPDEST}/ocr-worker/setup-runtime.sh"
   OCR_PYTHON_BIN="${TRIM_PKGVAR}/data/ocr-venv/bin/python"
   ```

   参考健康档案仓库 `scripts/prepare-package.mjs` 中的对应段落；同时确认 `.sh` 在包内仍有可执行权限（打包校验脚本里加一条检查）。
3. 把上面"路由与 UI"的四个 API 路由和设置页接入应用。安装是长任务（低功耗 NAS 上 5-20 分钟），页面必须有进度反馈和失败日志 tail，否则用户会反复点击。
4. 调用侧一律通过 `ocr-worker-client` 的队列入口发起请求，不要绕过它直接 spawn。
5. 按第 8 节的环境变量表决定哪些需要暴露为应用设置项。

**复制后的适配点（service 里依赖项目专属模块的地方）：**

直接复制 TS 文件会编译失败，因为两个 service 引用了健康档案项目的内部模块。替换面很小，按下表处理：

| 引用 | 用途 | 模板项目中的替代 |
| --- | --- | --- |
| `../database/client` 的 `getDatabase()` | 仅读写 `app_settings` 表里的 pip 镜像设置（`ocr.install` 一条 KV） | 换成项目自己的设置存储；没有就用数据目录下的 JSON 文件 |
| `./job-runner.service` 的 `getJobRunnerStatus()` | 仅在状态 API 里附带任务队列状态 | 没有后台队列就直接删除该字段 |
| `../utils/identifier` 的 `createId()` | 请求关联 ID | 用 `crypto.randomUUID()` 或模板已有工具 |
| `../utils/logger` 的 `writeLog()` | 运行日志 | 模板自带 `utils/logger.ts`，对齐函数签名即可 |

`worker.py`、`setup-runtime.sh`、`install_table_runtime.py` 等 Python/shell 文件与项目业务无关，可以原样复制。

**UI 行为约定（来自真实使用反馈）：**

- OCR 失败**不得删除用户已上传的原件**；修复环境后允许在详情页重试。
- OCR 结果必须保留页码、坐标、来源（文本层/渲染图）等原始证据，后续任何"智能整理"都只能引用、不能覆盖。
- 安装/升级按钮要做幂等和并发保护（同一时间只允许一个安装任务）。

## 3. 运行时安装设计

按需安装是整个方案里最容易出问题的环节，要点如下：

**Python 来源的三级兜底。** fnOS 不保证系统里有可用的 Python。安装脚本按以下顺序选择解释器：

1. 环境变量指定的 Python（`OCR_PRIVATE_PYTHON_BIN` / `PYTHON_BIN`）；
2. 数据目录下已安装的应用私有 Python 3.11（`$DATA/runtime/python-3.11`），没有则按 `OCR_PRIVATE_PYTHON_URL` 下载独立构建包（可用 python-build-standalone 产物），下载失败继续兜底；
3. 系统 Python，要求 3.9-3.12，且必须通过 `ensurepip`、`ssl`、`venv` 三个 stdlib 探测——精简系统常缺 `ensurepip`，缺了就直接判不可用，不要让 pip 装到一半才失败。

**pip 镜像面向国内默认清华源。** 面向国内 fnOS 设备，首次安装默认走清华镜像，避免用户不配置就 PyPI 直连超时。镜像做成目录式选项（官方 PyPI / 清华 / 阿里 / 腾讯 / 华为云 / 自定义），设置持久化在应用数据库里。注意：**pip 镜像不代理模型下载**，表格增强的 ONNX 模型从 ModelScope 下载，网络规划要分开考虑。

**就绪标记（ready marker）与幂等。** 安装成功后在 venv 根写就绪标记文件，并记录 Python 版本、后端、引擎版本、平台等元数据。服务启动时只认标记 + 自检通过的环境；标记缺失则视为未安装。重复安装在标记有效时直接跳过，不删除旧环境。

**失败可重试、日志可查。** 安装输出写入数据目录下的日志文件，状态 API 返回最后 N 行；失败状态必须能一键重试。安装过程加全局互斥（内存标志 + 锁目录），进程意外终止遗留 `.install-lock` 时，提示"确认无安装进程后仅删除锁目录"，**不要自动清空数据目录**。

**表格增强的原子发布。** 增强环境安装到 `ocr-table/runtime-<revision>` 全新目录，依赖、模型下载和推理自检全部通过后，用 `os.replace` 原子更新 `ocr-table/active.json` 指针；`active.json` 里记录每个 ONNX 模型相对路径和 sha256，状态探测时逐个校验。新请求读新指针，已启动的推理继续用旧环境；安装失败保留原指针和旧环境。旧 `runtime-*` 目录不自动清理（可能有进程在用），靠 revision 内固定版本号保证同版本模型摘要不一致时能发现损坏。

## 4. Worker 进程模型与超时

worker 是单进程、请求串行的。不要并发 OCR——低功耗 NAS 上并行只会让 CPU 打满、内存翻倍，吞吐反而下降。这个约束下，"进程还活着但慢"和"进程死了"必须能区分，否则慢页会被误判为崩溃：

- **NDJSON 心跳**：worker 在原生 OCR/PDF 调用期间由辅助线程周期性发出心跳行（写 stdout 要加锁，保证每个 JSON 行原子）。心跳只表示"进程有响应"，不携带部分结果。
- **三级超时**：
  - `OCR_WORKER_HEARTBEAT_INTERVAL_MS`（默认 15s）：worker 心跳间隔；
  - `OCR_WORKER_TIMEOUT_MS`（默认 2min）：服务端在这段无心跳也无响应时判定 worker 失能并替换；
  - `OCR_WORKER_HARD_TIMEOUT_MS`（默认 30min）：即使心跳正常，单请求的绝对上限，防止"活着但永远不结束"的请求饿死后续任务。
- **进程内存自我回收**：worker 每次响应附带 RSS 和请求计数。达到任务边界、32 次 OCR 请求或 RSS 1.5 GiB（`OCR_WORKER_MAX_OCR_REQUESTS_PER_PROCESS` / `OCR_WORKER_MAX_RSS_BYTES` 可调）时，worker 在**返回当前响应之后**干净退出；服务端接受已完成响应再退休进程，下一页在新进程开始，不重试不丢页。
- **stderr 白噪声过滤**：onnxruntime 在沙箱 HOME 不可写时会打一行 `failed to persist telemetry device id`，对输出无影响，客户端要按模式过滤掉，不要上报为运行告警。
- **与任务租约联动**：如果应用有后台任务队列，本地 OCR/PDF/缩略图任务运行期间也要续约租约，否则慢任务会被恢复机制捞起重复执行。

## 5. 平台与依赖坑（重点避坑）

这些是实测踩出来的，逐条对应 `requirements.txt` 里的版本约束：

| 坑 | 现象 | 结论 |
| --- | --- | --- |
| ARM64 + OpenVINO | 一次性 smoke test 通过，第二次推理起容器内存被耗尽 | ARM64 强制使用 ONNXRuntime 后端；x86 才优先 OpenVINO。worker 内按架构定后端候选顺序，不要只看安装能否成功 |
| OpenVINO 版本 | 新版本与 rapidocr-openvino 1.4.4 不兼容/行为变化 | 钉住 `openvino>=2022.2,<=2024.0`，升级前必须全量回归 |
| Python 3.12+ | OpenVINO 支持不完整 | 3.12 不再作为 OpenVINO 优先解释器；私有 Python 固定 3.11 |
| PyMuPDF 放进 Nitro | 原生依赖进入主进程，打包/跨架构/崩溃域全部变差 | PDF 渲染、文本层提取一律在 worker 内做，Nitro 只传文件路径 |
| iPhone 拍照 HEIC | 直接喂 OCR 解码失败 | 依赖 `pillow-heif>=0.16,<1`；入口按**文件头魔数**探测格式并与声明 MIME/扩展名交叉校验，不匹配直接拒绝，不要信后缀 |
| 小内存 ARM 板 | onnxruntime 默认吃满所有核，系统卡死 | 暴露 `OCR_WORKER_ONNX_INTRA_OP_THREADS` / `INTER_OP_THREADS`，按核数给保守默认 |
| 开发机验证错觉 | Apple Silicon 上一切正常 | x86 指令兼容性和 J4105 级别 CPU 的延迟只有在目标设备上才算数，发布前必须实机验证 |

## 6. PDF 处理经验

机构出具的 PDF 有三种形态：纯文本层、纯扫描件、以及最坑的**部分文本层 + 嵌入扫描表格**。处理策略：

- 先取文本层（`page.get_text("dict")`），文本层完整就直接用，记 `source: pdf_text`；
- 文本层不完整时，把页面按高清渲染再走 OCR，与嵌入文本**融合**，记 `source: pdf_text_plus_render`；
- 融合只合并"同一位置且内容相同"的文本框；**不同位置的重复内容全部保留**，内容冲突或缺坐标时不静默删除——删错了没有后悔药，重复可以留给上层判断；
- 混合 PDF 合并后只做一次表格增强，标记随最终文本框保存；
- 小 Logo、印章通常留在文本层里，不要尝试"清洗"，保持原文。

验证时要用真实入口、默认渲染参数跑 `pdf_text` 和 `pdf_text_plus_render` 两条路径，不能只调结构模型代替端到端验收。

## 7. 表格结构增强（可选但推荐）

纯 OCR 输出是"一行行文字 + 坐标"，遇到多列表格会错列、漏行。增强方案：RapidLayout 定位表格区域，RapidTable 只提供单元格几何与行列关系，**文字仍取自原始 OCR**——结构模型绝不生成文字，只给已有文字框找格子。增强元数据随原 OCR JSON 保存，不需要数据库 migration。

关键规则：

- 版本钉死：`rapid-table==3.0.2`、`rapid-layout==1.2.1`、`onnxruntime==1.19.2`，与基础 OCR 的 OpenVINO/ONNX 环境互不干扰；
- 单元格归属保守：文字框被截断时要求中心唯一归属、至少 60% 覆盖、且比次优单元格高 20 个百分点，否则标"待核对"而不是猜；
- 合并单元格、列数不一致、归属冲突只把**涉及的行**标记待核对，不丢整表；歧义行禁止下游自动生成结构化记录；
- 增强子进程上限 90 秒，超时或模型缺失自动回退到纯 OCR 结果；`OCR_TABLE_ENHANCEMENT=off` 可整体关闭（默认 `auto`）；
- OCR 结果首行可携带 `tableDiagnostics`，只记增强状态和采纳/歧义框数量，**不含正文内容**，用于区分未安装/关闭/推理失败/无结构/部分采纳/完整采纳；
- 修复 worker 脚本后需重启应用重新加载常驻进程，不需要重装模型。

## 8. 环境变量速查

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `STORAGE_DIR` | `.data`（开发） | 数据根目录；fnOS 下应为 `TRIM_PKGVAR/data` |
| `OCR_VENV_DIR` | `$DATA/ocr-venv` | 基础环境 venv 位置 |
| `OCR_PYTHON_BIN` / `OCR_WORKER_SCRIPT` / `OCR_SETUP_SCRIPT` | 包内推导 | 覆盖解释器与脚本路径 |
| `OCR_PRIVATE_PYTHON_URL` / `_ARCHIVE` / `_BIN` / `_DIR` | 空 | 私有 Python 3.11 下载与定位 |
| `OCR_FORCE_REINSTALL` | `0` | 忽略就绪标记强制重装 |
| `PIP_INDEX_URL` | 应用设置（默认清华） | pip 镜像 |
| `OCR_WORKER_HEARTBEAT_INTERVAL_MS` | 15000 | worker 心跳间隔 |
| `OCR_WORKER_TIMEOUT_MS` | 120000 | 无心跳/无响应判定失能 |
| `OCR_WORKER_HARD_TIMEOUT_MS` | 1800000 | 单请求绝对上限 |
| `OCR_WORKER_MAX_OCR_REQUESTS_PER_PROCESS` | 32 | 进程请求数回收阈值 |
| `OCR_WORKER_MAX_RSS_BYTES` | 1.5 GiB | 进程内存回收阈值 |
| `OCR_WORKER_ONNX_INTRA_OP_THREADS` / `_INTER_OP_THREADS` | 按核数保守值 | 小内存 ARM 板限核 |
| `OCR_TABLE_ENHANCEMENT` | `auto` | `off` 关闭表格增强 |

## 9. 测试与验收清单

移植到新项目后至少执行：

```bash
# Python worker 单测（合成数据）
python3 -m unittest discover -s packages/ocr-worker -p 'test*.py'
# 安装脚本语法
sh -n packages/ocr-worker/setup-runtime.sh
sh -n packages/ocr-worker/upgrade-runtime.sh
# 服务端相关测试与类型检查
npm test
npm run typecheck
```

设备验收（在目标架构的 fnOS 设备上）：

- 全新设备安装应用 → 触发 OCR 安装 → 中断网络/重试 → 成功后就绪标记存在；
- 应用升级、卸载保留数据重装后 OCR 环境仍可用；
- 分别用 JPEG/PNG/WEBP/HEIC、纯文本 PDF、扫描 PDF、混合 PDF 跑通识别；
- 构造慢页验证心跳不被误判、硬超时能兜底、进程回收不丢页；
- 安装失败时 UI 能看到日志 tail，原件不丢，可重试。

测试数据一律用合成数据；不要把真实证件、报告带进测试 fixtures 和日志。

## 10. 数据与隐私边界

- 原件、OCR 正文、坐标证据都属于用户敏感数据，只存数据目录，不进日志、不进诊断字段、不进 Issue；
- `tableDiagnostics`、安装日志等可外发的信息只包含状态与计数，不包含正文；
- OCR 环境本身（venv、模型）不含用户数据，卸载应用选择"删除数据"时才清除；
- 如果识别结果还要发给云端 AI 整理，文本可在发送前做身份信息过滤，但**页面原图无法过滤**，视觉模型复核类功能要把这一点写进用户提示。
