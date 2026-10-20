# Android 壳的平台细节

`MainActivity.kt` 总共两百来行，但每一个看似多余的判断都对应一次真机上的失败。这份笔记记录
WebView 壳为什么长成这样。

## 为什么不用 `file://`

`dist/index.html` 是 ES module 包，Chromium 在 `file://` 下会以 CORS 拒绝加载，而 `navigator.gpu`
需要 secure context。所以 `MainActivity` 用 `WebViewAssetLoader` 把
`https://appassets.androidplatform.net/assets/dist/` 映射到 APK 里的 assets，并拒绝其他所有主机 ——
这个 App 从不联网。

## 平台参数

- `minSdk 24`，`target/compile 35`（Play 对新应用要求 target 35）。
- Edge-to-edge 常开，系统栏 inset 以 WebView padding 的形式应用，布丁永远不会被手势条或
  挖孔遮住（`res/values-v27/themes.xml` 显式进到 cutout 区域）。
- `textZoom = 100` 把布局钉死，不随系统字体缩放变化。
- 缩放、overscroll、长按选择全部关闭，手势全归页面所有（`touch-action:none`）。
- 页面从不滚动：`html,body{overflow:hidden}`，dock 用 `env(safe-area-inset-bottom)` 抬到手势条之上。
- 不持久化任何东西：backup 与 device-transfer 规则排除全部内容。

## 旋转会重载页面

WebGPU 画布在 Android WebView 里，surface 尺寸变化时可能把合成器卡死 —— 页面还活着
（不崩溃、无 JS 错误），但不再绘制。`MainActivity` 监听 `onConfigurationChanged`，方向变化后
延迟 700 ms 重载 bundle，等于重建 device 与 swapchain。页面把当前口味存在 `localStorage`，
所以这个重载除了猫回到静止形状之外无感。

目前 `screenOrientation="portrait"` 把横屏锁掉了。横屏的取景与 CSS 其实都还在，等构图调好再开。

## 返回键

永远退出 App：它是单页 bundle，唯一能产生的历史条目是页内锚点。

## 真机回归脚本

`scripts/lib/device.mjs` 是三个脚本共用的底座：adb 访问、PNG 解码、逐像素比对、WebView devtools 客户端。

> `Page.captureScreenshot` 在这个 WebView 里没用 —— 回来的截图不含 WebGPU 画布，所以每一帧都走
> `adb exec-out screencap` 再在进程内比对。

- `verify_device.sh <serial>` —— 安装、启动、探测 GPU、截图。
- `verify_poke.mjs` —— 通过 devtools socket 注入触摸，验证捏与戳；这个 WebView 的触摸注入时灵时不灵，
  所以捏的覆盖主要靠单测。
- `verify_shake.mjs` —— 注入 `devicemotion`，用真实截屏比对，锁住"复原后摇一摇失效"的回归。

`adb` 走 PATH；platform-tools 不在 PATH 时用 `ADB` 环境变量指过去。
