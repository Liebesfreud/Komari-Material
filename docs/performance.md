# 加载性能与 Cloudflare 缓存

主题包只提供前端文件，不能设置 Komari、反向代理或 Cloudflare 的响应头。不要把 `_headers` 文件当作 Komari 的缓存配置；它只在支持该文件的托管平台上生效。

## Cloudflare Cache Rules

仅对实际的静态资源配置缓存，不要全站设置 Cache Everything。下面的主机名应替换为自己的域名。

1. 绕过动态路径：`/api/`、`/rpc2`、`/admin`、登录与鉴权路径。保留 WebSocket Upgrade 转发。
2. 为构建生成的带哈希 `/assets/` 文件设置缓存资格 Eligible、Edge TTL 一年、Browser TTL 一年；匹配示例：

   ```text
   (http.host eq "komari.example.com" and starts_with(http.request.uri.path, "/assets/") and http.request.method in {"GET" "HEAD"})
   ```

   只对成功响应缓存，404 和其他错误状态的 TTL 设为不缓存。此规则以 `/assets/` 目录只存放构建生成的带哈希文件为前提。

3. 首页和路由 HTML 保持绕过边缘缓存或重新验证；浏览器不使用一年缓存。不要把站点级 Browser Cache TTL 设置为一年后应用到 HTML。
4. `/images/`、`favicon.ico` 等名称不变的文件使用较短 TTL，更新时按 URL 清理缓存。不要套用带哈希文件的 immutable 策略。

Browser TTL 与 Edge TTL 是独立设置。CF 的 `HIT` 表示边缘缓存命中，首次访问的浏览器仍要下载资源。后续访问是否直接读取本地缓存取决于浏览器收到的 `Cache-Control`。

如果可以修改源站响应头，带哈希资源建议：

```http
Cache-Control: public, max-age=31536000, immutable
```

HTML 可使用：

```http
Cache-Control: no-cache
```

私有用户信息、鉴权和实时 API 使用 `private, no-store`，具体由后端控制。只对静态资源设置长缓存，不要覆盖实时接口的缓存策略。

## 发布与验证

- 发布后 HTML 会引用新哈希文件，通常无需清空旧哈希资源。源站尽量保留旧版本资源一段时间，以支持已经打开的页面；无法保留时，发布后刷新旧页面。
- 按 URL 更新无哈希资源；避免每次发布清空全部缓存。
- 连续两次 GET 同一静态文件，检查 `CF-Cache-Status` 与 `Age`；`MISS` 后可能出现 `HIT`，但不同边缘节点、淘汰或规则可能影响结果。
- 在浏览器中检查实际 `Cache-Control`，确认 HTML/API 没有被静态规则误缓存。仅看控制台规则值不足以确认最终响应。
- 用同样设备与网络条件复测 Lighthouse，并检查正常连接与连接失败两种情况。LCP 是实际最大内容元素的出现时间；总传输、布局位移和 WebSocket 故障必须分别诊断。

## 字体与图表维护

Material Symbols 使用项目内的 WOFF2 子集，保持原有图标样式；构建不连接 Google。新增图标后运行 `pnpm icons:update` 更新字体与清单，再提交生成文件。这个命令需要访问 Google Fonts，`pnpm icons:check` 在离线构建时检查图标覆盖及文件摘要。扫描包含动态图标映射，不支持由服务端任意指定新的图标名称。

中文保留 Noto Sans SC 的 unicode-range 分片，避免动态节点名称缺字；`font-display: optional` 允许慢网首次访问继续使用系统字体，后续命中缓存时使用主题字体。Roboto 仅加载仪表盘使用的 Latin 字符集，其余语言由字体回退处理。

地图模块在进入视口附近时加载，占位和地图共享尺寸。折线图及详情弹窗按打开时加载。图表基础库仍会被需要图表的功能下载，不应把分包理解为删除了这些功能的代码。

参考：

- https://developers.cloudflare.com/cache/how-to/cache-rules/settings/
- https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- https://developers.cloudflare.com/cache/concepts/cache-responses/
- https://developers.google.com/fonts/docs/material_symbols
