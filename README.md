# fnOS App Template

一个适合开源发布的飞牛 `fnOS Native` 应用模板，使用多包结构管理 Vue 3 前端、Nitro 服务端和 fnOS 资源，内置 `.fpk` 打包流程。

## 特性

- Vue 3 + Vite 页面工程
- Nitro 服务端模板
- 标准化的 fnOS 打包目录生成
- CGI iframe 入口代理
- `app.tgz` 与 `.fpk` 打包脚本
- 统一模板配置源
- 适合二次初始化为自己的 NAS 应用

## 目录结构

```text
packages/ui/          Vue 3 前端源码
packages/server/      Nitro 服务端源码
packages/assets/      fnOS 图标与打包资源
scripts/              构建与打包脚本
.ui-dist/             前端构建产物（由 Vite 生成）
.fnos-build/          构建中间产物
dist/                 发布产物
template.config.json  模板唯一配置源
demo/                 参考项目，仅用于对齐 fnOS 配置习惯
```

## 快速开始

```bash
npm install
npm run dev
```

默认服务端口为 `3333`。

开发模式下：

- Nitro 使用 `3333`
- Vite 默认使用 `3334`

## 版本策略

- `package.json.version` 是主版本源
- `prepare-package` 会自动同步到 `manifest`
  - `version=x.y.z`
  - `sub_version=x.y.z.0`

## 与 demo 对齐后的约定

- 桌面图标路径使用相对地址：`images/icon_{0}.png`
- CGI 文件名可配置，默认是 `index.cgi`
- 默认 `run-as` 使用 `package`
- `wizard/` 默认生成安装/配置端口项与卸载数据选项
- `manifest` 输出风格使用紧凑的 `key=value`

## 构建

```bash
npm run build
npm run pack:app
npm run pack:fpk
```

页面开发：

```bash
npm run dev
```

目录约定：

- `packages/ui/src` 写 Vue 页面、组件、样式
- `packages/server/routes/api` 写 Nitro API
- `packages/assets/icons` 放 fnOS 图标资源
- `.ui-dist/` 由 `npm run build:web` 自动生成，请不要手工维护
- `.server-dist/` 由 Nitro 构建生成，请不要手工维护

构建产物：

- `dist/app.tgz`
- `dist/*.fpk`

## GitHub Actions

当前内置两套工作流：

- `CI`
  - 执行 `npm install`
  - 执行 `npm run build`
  - 执行 `npm run prepare:package`
  - 执行 `npm run pack:app`
  - 上传 `dist/app.tgz` 和渲染后的 `manifest`

- `Release`
  - 在推送 `v*` 标签时触发
  - 自动构建并创建 GitHub Release
  - 默认上传 `dist/app.tgz`
  - 自动下载 `fnpack`
  - 自动上传 `dist/*.fpk`

如果你想在本地自动获取 `fnpack`，可以执行：

```bash
npm run download:fnpack
```

默认会下载官方 `fnpack 1.2.1` 到：

- `tools/fnpack`

## 配置

请优先修改：

- `template.config.json`

它会驱动：

- Nitro 运行时默认配置
- fnOS `manifest`
- `cmd/` 生命周期脚本
- `app/ui/config`
- CGI 代理路径和服务端口
