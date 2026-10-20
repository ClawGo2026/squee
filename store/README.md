# 上架 Google Play · 提交清单

包名 `me.copycat.squee` ｜ 版本 1.0.0 ｜ 目标：免费、简体中文为主

---

## 一、素材都在这了

| 文件 | 用途 | 规格 |
|---|---|---|
| `icon-512.png` | 应用图标（Play 高清图标） | 512×512 PNG ✅ |
| `feature-graphic-1024x500.png` | 商店特色图 | 1024×500 PNG ✅ |
| `screenshots/01-milk.png` `02-berry.png` `03-matcha.png` `04-cocoa.png` `05-cyber.png` | 五种口味（竖屏） | 1080×2400 PNG ✅ |
| `screenshots/06-squeeze.png` | 捏拉形变中（竖屏） | 1080×2400 PNG ✅ |
| `listing.md` | 应用名 / 简短说明 / 完整说明（中英双语） | 直接复制粘贴 |
| `privacy.html` | 隐私政策 | 单文件静态页，**需自行托管** |

APK 内自带的图标（自适应图标 + 5 档 legacy PNG + monochrome）由 `android/tools/make_icons.py` 生成，
已随包发布，不需要额外上传。

---

## 二、Play Console 逐步操作

### 1. 账号
- 需要一个 Google Play 开发者账号（个人账号一次性 25 美元）。
- 身份验证：Google Play 要求提交个人/公司信息与联系方式。

### 2. 建应用
- 名称：`squee · 猫咪牛奶布丁`
- 默认语言：简体中文（建议同时补 en-US）
- 应用/游戏：应用
- 分类：休闲 Casual
- 免费

### 3. 商店素材
- 图标：`store/icon-512.png`
- 特色图：`store/feature-graphic-1024x500.png`
- 截图：上传 `store/screenshots/` 里的 6 张（Play 要求至少 2 张，最多 8 张；建议顺序 04-cocoa → 05-cyber → 01-milk → 06-squeeze → 02-berry → 03-matcha）
- 简短说明 / 完整说明：见 `listing.md`

### 4. 隐私政策（必填）
1. 把 `store/privacy.html` 传到任意静态托管（GitHub Pages / Netlify 拖拽 / 自有域名）。
2. 拿到网址后填进「隐私政策」字段。

### 5. 应用内容（三个问卷）
- **数据安全**：全部选「不收集 / No data collected」（本应用零权限、零网络，符合）。
- **广告**：无广告。
- **内容分级**：全年龄 —— 无暴力、无血腥、无色情、无赌博、无脏话、无酒精烟草；
  只有卡通猫与软体物理。问卷里涉及"用户互动/分享"选"无"，"应用是否可访问外部网络"选**否**。

### 6. 目标受众与内容
- 建议选 13 岁以上（若要进 Google Play 面向儿童分组，需要满足 Families 政策的一整套要求，不建议）。

### 7. 发布
- 先发到**内部测试**轨道跑一轮（审核快），确认无误再转生产。
- 生产发布需要通过 Play 的应用审核（首次通常 1–7 天）。

---

## 三、发布包

```sh
# 1) 生成上传密钥（只需一次，务必备份）
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload

# 2) 把密钥信息写进 ~/.gradle/gradle.properties（不要进仓库）
#    squee.storeFile=/绝对路径/upload.jks
#    squee.storePassword=...
#    squee.keyAlias=upload
#    squee.keyPassword=...

# 3) 打包
cd android && ./gradlew :app:bundleRelease
#    产物：android/app/build/outputs/bundle/release/app-release.aab
```

---

## 四、常见坑（提前记一下）

| 坑 | 说明 |
|---|---|
| 包名不可改 | `me.copycat.squee` 一旦上架无法变更，务必确认 |
| 隐私政策抓不到 | Play 会主动访问该 URL；必须公网可访问、不能需要登录 |
| 数据安全问卷与实际不符 | 我们是"零收集"，若以后加了联网 SDK 必须回来改 |
| 截图必须是真机截图 | 我们这 6 张都是真机直接截图，符合"不得使用设计稿冒充"的要求 |
| 描述里写了已删掉的功能 | 当前文案已只保留捏/拉/摇/戳/五口味/复原，与实现一致 |
| 宣传了横屏 | 应用已锁竖屏，横屏截图已撤下，横屏等优化完再提 |