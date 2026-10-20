# 发布流程

发版 = 签名构建 → 打 tag → 建 release 挂 APK。一次准备，之后每版重复第 3 步起。

## 0. 为什么不能直接发 `app-debug.apk`

`debug` 变体不是这个 App 的正式形态，直接传上 Releases 会留下三个后患：

| 项 | 实测值 | 后果 |
|---|---|---|
| 包名 | `me.copycat.squee.debug` | 跟正式版 `me.copycat.squee` 是两个独立 App，用户从 Release 装了再装 Play 版会出现两个图标 |
| 版本名 | `1.0.0-debug` | 商店/统计口径不同 |
| 签名 | `CN=Android Debug`（所有人共用的调试密钥） | 无法升级到任何正式签名版本；且私钥公开在 AOSP 里，任何人都能伪造更新 |
| 标记 | `application-debuggable` | WebView 远程调试通道对任意 adb 连接开放 |

所以第一版必须先建 upload keystore，走 `assembleRelease`。

## 1. 生成 upload keystore（只做一次）

```sh
keytool -genkeypair -v -keystore ~/squee-upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=squee, O=CopyCat, C=CN"
```

- **`-dname` 里不要写真实姓名**，这个字符串会出现在每个 APK 的证书里，任何人都能读到。
- **文件必须备份**：丢了就再也无法给已安装的用户推送更新，只能换包名重发。
- 仓库根 `.gitignore` 已经挡住 `*.keystore`；`.jks` 不在名单里，所以别把它放进仓库目录。

## 2. 把口令写进用户级 Gradle 配置（只做一次）

`~/.gradle/gradle.properties`（**不是**仓库里的 `android/gradle.properties`）：

```properties
squee.storeFile=C:/path/to/squee-upload.jks
squee.storePassword=…
squee.keyAlias=upload
squee.keyPassword=…
```

Windows 路径用正斜杠，反斜杠会被 Properties 当成转义符吃掉。构建脚本只在四个属性齐全时
才启用 release 签名，缺一个就产出 `app-release-unsigned.apk`。

## 3. 构建并校验

```sh
cd android
./gradlew :app:assembleRelease
```

产物：`app/build/outputs/apk/release/app-release.apk`。

```sh
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
aapt2 dump badging app/build/outputs/apk/release/app-release.apk | head -2
```

必须看到包名是 `me.copycat.squee`（没有 `.debug`）、签名 DN 是你自己的、且**没有**
`application-debuggable`。

`assembleRelease` 会顺带跑 `lintVitalRelease`，它将 error 级别的 lint 问题视为构建失败。
确实需要跳过时加 `-x lintVitalRelease`，但别把跳过的理由留在 CI 里。

## 4. 打 tag 并推送

```sh
git tag -a v1.0.0 -m "squee 1.0.0"
git push squee main --follow-tags
```

`versionName`（`android/app/build.gradle.kts`）与 tag 保持一致；**每次发版 `versionCode`
必须比上一版大**，否则 Android 拒绝覆盖安装，Play 也拒绝上传。

## 5. 建 release 并挂 APK

### 方式 A：网页上传（无需额外工具）

Releases → Draft a new release → 选 `v1.0.0` → 标题/说明 → 拖入 `app-release.apk` → Publish。

同时附一行校验和，用户能自证包没被替换：

```sh
sha256sum app-release.apk > app-release.apk.sha256
```

### 方式 B：`gh` CLI

```sh
gh release create v1.0.0 \
  android/app/build/outputs/apk/release/app-release.apk \
  --title "squee 1.0.0" \
  --notes-file docs/release-notes/v1.0.0.md
```

### 方式 C：curl + PAT

需要一个 `Contents: read and write` 权限的 token（`GH_TOKEN=…`）。release 的资产不能直接
PUT 上传，必须先建 release、拿到 `upload_url`，再以
`POST <upload_url>?name=...&label=...` + `Content-Type: application/vnd.android.package-archive`
提交二进制。走这条路的脚本要处理「release 已存在」的重入。

## 6. 签名身份是不可逆的决定

Android 的更新机制只认「同包名 + 同签名」。两条渠道的签名一旦分叉，用户就无法互相覆盖：

- **只用 Release 直发** —— 自签 upload key，永远用同一把。
- **只用 Play** —— AAB + Play App Signing，Google 用它的密钥重新签，你的 upload key 只用来上传。
- **两者都要** —— Play 上架的 APK 与 GitHub 上的 APK **签名必然不同**（除非退出 Play App Signing，
  新应用已不允许）。同一台设备从 GitHub 版换到 Play 版必须先卸载，反之亦然。

因此要么认下「GitHub 版是独立分发渠道」这个事实，要么只保留一个渠道。别在发布说明里
暗示两者可以互升级。

## 检查清单

- [ ] 包名无 `.debug`、版本号已递增
- [ ] `apksigner verify` 通过，签名 DN 是自己的
- [ ] `application-debuggable` 不存在
- [ ] `assets/dist/NOTICE.md` 与 `LICENSE` 随包
- [ ] tag 名与 `versionName` 一致
- [ ] Release 说明里写清「与 Play 版签名不同，切换需卸载」
