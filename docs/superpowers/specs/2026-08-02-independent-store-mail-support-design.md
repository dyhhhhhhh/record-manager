# 独立唱片商店邮件支持设计

## 目标

在保留 iMusic 与 HMV Japan 行为的基础上，支持从 QQ 邮箱导入 Mutant、Black Screen Records 和 Laced Records 的订单邮件。第一版严格依据邮箱中已存在且经过授权分析的真实模板，不推测未见过的邮件类型。

新增商家键与界面名称：

- `mutant`：Mutant
- `black_screen`：Black Screen Records
- `laced`：Laced Records

三个商家的订单继续进入统一订单列表、详情页、收藏展示和金额统计。搜索、厂商筛选、状态筛选和分页行为不变。

## 范围

第一版支持：

- Mutant 订单确认邮件。
- Black Screen Records 订单确认、准备发货和已送达邮件。
- Laced Records 订单确认、运输中、派送中和已送达邮件。
- 确认邮件中的全部商品行，不按商品名称猜测 Vinyl、CD、服饰或其他格式。
- 邮件中的商品封面；艺人缺失时使用“未知艺人”。

第一版不支持：

- 三个商家的取消邮件，因为邮箱中没有可验证样本。
- Mutant 发货邮件，因为邮箱中没有可验证样本。
- 从商品页面抓取或猜测艺人。
- 将物流邮件中的“已送达”自动转换为“已收到”。所有观察到的物流状态只更新为“已发货”，收货仍由用户手动确认。

## 解析架构

统一邮件入口改为商家适配器注册表。每个适配器公开相同边界：

- 根据已读取的邮件头进行可信分类。
- 根据完整邮件解析统一 `MailEventPayload`。
- 声明允许的商品链接和封面来源。

适配器组成：

- Mutant：Mutant 分类器，共用 Shopify 确认邮件提取器。
- Laced Records：Laced 分类器，共用 Shopify 确认与物流邮件提取器。
- Black Screen Records：OrderlyEmails 确认邮件解析器，Sendcloud 物流邮件解析器。
- iMusic 与 HMV Japan 保持独立解析器，通过同一注册表接入。

共用 Shopify 提取器只处理模板结构，不决定商家身份。商家身份、主题、可信域和链接白名单始终由对应适配器控制，避免一个宽泛的 Shopify 规则误读营销邮件或其他商家的订单。

## 邮件分类与信任边界

分类只接受已观察到的精确主题形态。订单号部分必须完整匹配对应格式，主题前后不能包含营销文案。

| 商家 | 邮件类型 | 发件条件 | 主题形态 |
| --- | --- | --- | --- |
| Mutant | 确认 | 地址域为 `madebymutant.com` | `order #{数字} confirmed`，大小写不敏感 |
| Black Screen Records | 确认 | 地址域为 `blackscreenrecords.com` | `Order #{数字} confirmed` |
| Black Screen Records | 发货 | 地址域为 `sendcloud.com`，发件名精确为 `Black Screen Records`，Reply-To 域为 `blackscreenrecords.com` | `Your order #{数字} is ready to be shipped` |
| Black Screen Records | 发货 | 与上一行相同 | `Your order #{数字} is delivered` |
| Laced Records | 确认 | 地址域为 `lacedmusic.com` | `Order LREU{数字} confirmed` |
| Laced Records | 发货 | 地址域为 `lacedmusic.com` | `A shipment from order LREU{数字} is on the way` |
| Laced Records | 发货 | 地址域为 `lacedmusic.com` | `A shipment from order LREU{数字} is out for delivery` |
| Laced Records | 发货 | 地址域为 `lacedmusic.com` | `A shipment from order LREU{数字} has been delivered` |

邮件头模型增加发件显示名和 Reply-To 地址。IMAP 信封读取、同步分类和正文解析必须使用相同字段再次验证。Black Screen Records 的 Sendcloud 邮件必须同时满足四个条件，不能只依赖共享的 `sendcloud.com` 域或通用物流主题。

IMAP 查询继续使用外层 OR，把三个新商家的发件条件与精确主题加入现有 iMusic/HMV 查询，同时保留时间范围和 UID 增量条件。营销、订阅、弃购、制造进度和普通配送公告不会读取正文。

## 确认邮件解析

统一确认载荷提取：

- 商家订单号与邮件发生时间。
- 币种、商品小计、运费、优惠、已含税费和实付总额。
- 商品名称、规格、数量、行金额、商品链接和封面。
- 配送方式；模板没有明确值时分别使用 `Mutant 配送`、`Black Screen Records 配送` 或 `Laced Records 配送`，不猜测承运商，确保统一确认载荷仍满足非空约束。

金额规则：

- Mutant 与现有 Laced 样本使用 CNY；以 Total 行的 ISO 币种为整封邮件的权威币种。
- Black Screen Records 样本使用 EUR；欧洲小数逗号统一为小数点，例如 `€214,90` 转为 `214.90`。
- 缺少优惠行时优惠为 `0`。
- 税费沿用现有“已包含金额”语义，不重复加入订单实付。
- 商品行金额为整行合计时，根据数量精确换算单价；不能整除到货币最小单位时解析失败，不静默舍入。
- 商品单价乘数量必须等于商品小计；商品小计加运费减优惠必须等于实付。
- 未来模板若出现税费另加、币种含糊或金额无法核对，保存为失败事件并等待真实样本，不猜测金额口径。

商品规则：

- 导入确认邮件中的全部商品行，避免 Laced 等商品名称没有格式关键词时误删唱片。
- 邮件没有稳定的独立艺人字段时使用“未知艺人”。用户编辑后的艺人不被物流邮件覆盖。
- 只从商品行对应的图片节点提取封面，不从邮件全局收集图片。
- Mutant 与 Laced 使用 Shopify 的 `.order-list__product-image`；Black Screen Records 使用 OrderlyEmails 的 `.product-image`。
- 封面必须是 HTTPS `cdn.shopify.com`，并位于 Shopify 文件路径。下载失败继续使用中性占位图。
- 商品链接仅接受对应官方域：`madebymutant.com`、`lacedrecords.co` 或 `blackscreenrecords.com`。邮件没有商品链接时保持为空。
- 已有本地封面或用户手动上传封面永不覆盖。

## 物流邮件与订单状态

所有已观察到的物流邮件统一产生 `shipment` 载荷，不新增邮件事件类型：

- “ready to be shipped”与“on the way”更新为已发货。
- “out for delivery”仍为已发货。
- “delivered”仍为已发货，不自动更新为已收到。

事件按“用户 + 商家 + 订单号”关联。Laced 物流样本缺少用于唯一匹配的单价，因此只保留商品提示，不猜测 `unitPrice`；确认邮件仍是商品链接、封面与金额的权威来源。Black Screen Records 的 Sendcloud 样本不含可靠商品元数据，只用于状态更新。

物流邮件早于确认邮件时，订单列表显示只读的已发货事件，不允许导入；后续确认邮件到达后，同商家同订单号自动汇总为可导入订单。重复物流状态依靠 UID、Message-ID 和事件去重规则跳过。

## 数据库与界面

新增迁移扩展 `orders.merchant` 与 `mail_events.merchant` 约束，允许 `mutant`、`black_screen` 和 `laced`。现有复合去重、订单关联、取消检测与并发锁继续使用“用户 + 商家 + 订单号”，不增加新的金额或物流字段。

界面变化：

- 订单列表厂商筛选加入 Mutant、Black Screen Records 和 Laced Records。
- 订单行、详情页和收藏卡片显示对应商家标识。
- 详情地址继续为 `/orders/{merchant}/{订单号}`。
- 确认阶段缺少艺人或封面时继续使用现有占位。
- 不新增商家专用页面或独立物流状态筛选器。

## 错误处理与隐私

- 缺少订单号、必填金额、商品行或有效日期时保存失败事件和结构化错误，不保存邮件正文。
- 可信条件不满足时在读取正文前忽略邮件。
- 图片和商品链接必须在解析与下载两层校验商家白名单。
- 封面下载失败是非致命告警，不阻止订单导入。
- 解析失败不会覆盖既有成功事件；完整维护重扫可以在修正解析器后重试。
- 测试夹具由已授权样本制作，但必须替换姓名、地址、邮箱、真实订单号、追踪号、商品名称和可识别链接标识；仓库不提交原始邮件正文。

## 测试与验收

解析与分类测试覆盖：

- Mutant 确认邮件的两件商品、CNY 金额、数量、规格和 Shopify 封面。
- 两种 Laced 确认模板的 CNY 金额与没有格式关键词的商品。
- Laced 三个物流主题全部归一为 `shipment`。
- Black Screen Records 的 EUR 小数逗号、OrderlyEmails 商品结构和官方商品链接。
- Black Screen Records 的 Sendcloud 准备发货与已送达邮件都归一为 `shipment`。
- 相似域、共享 Sendcloud 域错误发件名、错误 Reply-To、相似主题和营销邮件均被拒绝。
- 非商品图片、非 Shopify CDN 图片和非官方商品链接被忽略。
- 缺失必填字段、金额不平、币种含糊和商品行单价无法精确换算。

集成与界面测试覆盖：

- 同订单号跨五个商家隔离，商家复合锁与去重正确。
- 物流先到、确认先到、重复物流和未导入只读状态。
- 未知艺人、封面占位、后续补全和手动封面保护。
- 五个商家标签与筛选、详情路由、收藏链接和分页参数保留。
- iMusic 与 HMV 历史载荷继续兼容。

完成后运行 `pnpm test`、`pnpm lint`、`pnpm typecheck` 和 `pnpm build`。

## 上线顺序

1. 应用数据库迁移。
2. 部署应用。
3. 在订单页选择“一年”执行同步，导入此前未被查询的三个商家邮件。
4. 检查新商家的确认与物流事件；没有样本的取消和 Mutant 发货邮件继续忽略。
