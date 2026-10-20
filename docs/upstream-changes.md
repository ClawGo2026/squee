# 相对上游的改动

补丁文件： [`patches/squee-ui.diff`](../patches/squee-ui.diff) —— 11 个文件：

```
preview/eyes.html                 src/scene/world.ts
src/fonts/squee-round.woff2       src/styles.css
src/interaction/grab.ts           src/ui/panel.ts
src/main.ts                       tests/interaction.test.ts
src/physics/mesh.ts               tests/physics.test.ts
src/pudding/surface.ts
```

物理求解器（`src/physics/*` 的积分与约束）一行没改，只是不再显示读数、也不再接线勺子。

---

## 1. WebGL 2 回退（`src/scene/world.ts`）

上游 `world.ts` 写死了「拿不到原生 WebGPU 后端就报错」。`createRenderer()` 改为优先 WebGPU，
否则退回同一个渲染器自带的 WebGL 2 后端（`forceWebGL: true`），Android 全平台都支持。

上游那条「无 GPU 报错」的测试依旧通过，因为 Node 里 WebGL 2 探测同样失败；两者都不可用时
抛出的还是原来的错误。

## 2. 极简界面（`src/ui/panel.ts`、`src/main.ts`、`src/styles.css`）

`main.ts` 从 143 行降到约 70 行。

- **保留**：3D 猫咪、顶部玩法提示一行、五个口味按钮（牛奶/草莓/抹茶/黑金/赛博）、复原按钮、
  没有渲染后端时的错误提示。
- **删除**：品牌条、大标题与简介、四项读数 HUD、玩法切换（捏一捏/小勺子）、尝一口、弹性与回弹滑块、
  按下去/晃一晃、慢动作/看网格/暂停、关于面板、页脚、底部悬浮工具条、性能诊断面板、口味序号。

`src/interaction/spoon.ts`、`src/pudding/*` 保留但不再接线，测试照常跑，未被引用的模块被
tree-shaking 排除在产物外。

## 3. 猫脸对称修复（`src/physics/mesh.ts`、`src/scene/world.ts`）

轮廓建模后整体绕 Y 轴转了 `CAT_YAW = 0.44`，而脸贴图原本按**世界坐标 x** 投影，整张脸因此偏到
猫左侧约 1/7 身宽，左眼被挤到轮廓边缘、透视压扁。

改为在猫自身坐标系里算 u 与正面遮罩（`glaze` 早就这么算了），并把相机方位角对齐到 `CAT_YAW`，
消除残余的 1.4° 透视差。`CAT_YAW` 提到 `mesh.ts` 导出，三处共用一个值。

`tests/physics.test.ts` 加了回归断言：静止网格关于自身中心面镜像对称（误差 < 1e-12）。

## 4. 捏一捏与戳一戳（`src/interaction/grab.ts`）

上游只认单指拖拽，"tap" 是一次 0.75 m/s 的向下速度脉冲 —— 软体加地面会把它整个吸收掉，
所以点猫等于没反应。现在：

- 两根手指合成一个跨两处接触斑的抓握，目标点取两指中点，再按手指靠拢的比例向身体中轴收拢，
  捏拢才是真的把布丁挤瘪；抬起一指时抓握交给剩下那指，猫不会被丢下。
- 轻点是真的"按进去"：抓住那处斑往身体中心推 0.2，smoothstep 在 0.16 s 内渐入后松手。
  深度一次性拉满会把猫甩得打转（实测过），所以必须渐入。
- `installGrab` 新增 `update(dt)`，由主循环每帧调用来收尾戳一戳的抓握。

## 5. 摇一摇在复原后仍然有效（`src/main.ts`）

冷却时间 `nextShakeAt` 和摇晃计时 `rock.t0` 都记在 `sim.time` 上，而 `sim.reset()` 会把这个时钟归零。
复原/切后台时没有清理这两个状态，冷却期就永远停在未来（有时还会把猫一直抓着），摇一摇从此毫无反应。

新增 `stopRock()` 在复原与 `visibilitychange` 时释放抓握并把冷却归零；`advanceRock` 再兜一层
"时钟倒流就松手"。`scripts/verify_shake.mjs` 通过 WebView 的 devtools socket 注入 `devicemotion`、
用真实截屏比对，在真机上锁住这个回归（修复前 11.04 → 0.13，修复后 11.04 → 10.91）。

## 6. 相机自适应（`resize` + 每帧 `keepFramed`）

- 竖屏窄画幅横向视野不够，会把猫切到两边 → 按宽高比后退镜头（最多 1.45 倍）；
- 横竖屏共用同一套取景（距离 7.7、垂直偏移 -10%），猫在两种朝向下占据画面的比例一致；
- 旋转时 Chromium 会交给渲染器一帧 0 尺寸的画布，`resize` 直接忽略小于 2 px 的尺寸，
  并由每帧的 `keepFramed()` 兜底重算；画布另铺与舞台同色的底色，未绘制时不闪白；
- 尺寸比较两边都取整到整像素：拿小数 rect 和整数 `clientWidth` 比会每帧判定为"变了"，
  反复重建画布缓冲，边缘会被重采样发糊（v4 的糊边就是这个原因）；
- 顺带把阴影从 VSM 换成 PCFSoft，贴图提到 1024/2048，自阴影的法线偏移加大。

**最关键的一条**：three r185 的 `WebGPURenderer.setSize(w, h, false)` 在 Android WebView 里不会把
逻辑尺寸写进画布 —— `renderer.getSize()` 一直停在默认的 `300×150`，绘制缓冲停在 `300×150 × DPR`，
而 CSS 尺寸是 `360×800`，画面被拉伸五倍多铺开。这就是「一直有点糊、深色口味尤其明显」的根因。

现在 `resize()` 会在 `setSize` 之后把 `canvas.width/height` 显式对齐到 `逻辑尺寸 × 像素比`，
并补一次 `setViewport`。实测缓冲从 `900×450` 修正为 `1080×2400`，与屏幕 1:1，轮廓明显变锐。

## 7. 猫脸不用绕体展开（`src/scene/world.ts`）

上游用 `atan2` 把脸绕身体一圈展开成 u，在 x=0 / z<0 的经线上 u 会跳变；跨过它的三角形会在
一个像素里插值穿过整张贴图，于是背部中线出现一条**金色（嘴/腮红）细虚线**。
复制接缝顶点能消掉它，但会撕裂网格。

现在改用**线性 u**（`u = .5 + x / (4·maxX)`，全场无跳变），再用一个逐顶点的 `face` 遮罩
（`smoothstep(z/maxZ, -.15, .3)`）把脸限制在正面半球 —— 没有接缝，也就没有接缝问题。

## 8. 表面法线平滑（`src/pudding/surface.ts`）

四面体投影出来的可见皮肤里会夹杂又细又长的 sliver 三角形，面积加权平均出的法线在那一列上明显偏掉，
渲染出来就是一条**一像素宽的虚线状明暗痕**（深色猫上最明显，像划痕）。

现在面积加权后再做两遍邻域平均法线，痕迹消失；几何、拓扑、测试都不受影响。

## 9. 渲染分辨率

触屏设备的像素比上限从 1 提到 3（桌面 2），在 1080×2400 / DPR 3 的屏幕上 1:1 成像，轮廓不再有锯齿；
实测竖屏 551 帧、横屏 372 帧，掉帧 0%，帧时间中位数 7–9 ms。

---

## 摇一摇怎么实现的

`devicemotion` 的线性加速度超过 13 m/s²（0.7 秒冷却）时，取加速度的主轴方向，对猫头做一次
「受控摇动」：抓住被摇那一侧的头顶，沿该方向来回摆 2.5 个来回（1 秒），然后松手，猫自己晃回原位。
幅度随摇动力度在 0.20–0.46 之间。

最初试过直接注入角速度（`SoftBody.tumble`），但软体的体积与边长约束保形状不保朝向，猫会直接躺倒
不回来，于是换成了上面的抓取式摇动。若某台设备不派发 `devicemotion`，摇一摇静默失效，
其余交互不受影响。

## 在真机上验证回退路径

```sh
./gradlew :app:assembleDebug -Psquee.forceWebgl=true
```

或在页面地址后加 `?webgl`。在一台 Android 15 设备（System WebView 137）上实测：`navigator.gpu`
存在且能拿到 adapter，发布版走原生 WebGPU；强制 WebGL 的版本渲染同一场景，只是高光稍柔。

## 跟进上游新版

1. 把新版 checkout 拉到同级目录，`git -C ../milk-meow-jelly log --oneline` 记下基准提交；
2. 在新源码上重放 `patches/squee-ui.diff`（`git apply -3` 通常能吃掉大部分）；
3. `bash scripts/sync_web.sh` 跑一遍 typecheck + test，任何一处物理回归都会在这里炸；
4. 用 `scripts/verify_{poke,shake}.mjs` 和 `verify_device.sh` 在真机上复核触摸与摇晃；
5. 更新 README 的口味/包体数字与 `NOTICE.md` 里的上游版本号。
