# Hanime 爬虫（独立 · 仅 MySQL）

与主站无关。抓取 hanime1.me → 本地下载 → **只写 MySQL**（无 D1）。

## 实测：标题如何区分有无中文字幕

在详情页读取 `shareBtn-title`（**不要**先去掉 `[]`）抽样结果：

| 类型 | 详情页标题特征 | 真实例子 |
|------|----------------|----------|
| **有中文字幕** | 标题带 **`[中文字幕]`** | `OVA 田舎にはこれくらいしか娯楽がない ＃2 [中文字幕]` |
| **有中文字幕** | 作者括号 + `[中文字幕]` | `[AlphaG] Capture Phrolova [中文字幕]` |
| **无中文字幕** | **没有** `[中文字幕]`（多为 UGC/MMD） | `[RD] Himeko Nova`、`[Tocher] Phrolova x Camellya` |

补充观察：

1. 站内搜索「無字幕 / 無字」几乎没有结果 —— **无字片不是靠「無字幕」三个字**，而是**标题里没有 `[中文字幕]`**。
2. **列表页中文 UI 标题**（如「鄉下幾乎沒有娛樂活動 2」）**通常不带** `[中文字幕]`，但点进详情后 raw 标题会有。
   → 列表阶段不能因为没有该标记就丢掉；**必须在详情页用 raw 标题再判**。
3. 站点筛选项「中文字幕」是内容标签；详情标题上的 **`[中文字幕]`** 是最稳定的可解析信号。

## 当前过滤实现

| 阶段 | 规则 |
|------|------|
| 列表 `stage=list` | 只跳过无字幕显式词、後補等；**不因缺少 `[中文字幕]` 拦截** |
| 详情 `stage=detail` | 必须有 **`[中文字幕]`**（或标签「中文字幕/中文配音」）；否则跳过 |
| 始终 | 命中 `無字幕/无字/生肉` 等 → 跳过；命中 `後補/补字` → 跳过 |

配置见 `production_config.example.yml` 的 `require_chinese_subtitle` / `no_subtitle_markers` / `skip_keywords`。

## 运行

```bash
cd crawler/hanime
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp production_config.example.yml production_config.yml
# 编辑本地 production_config.yml，或 export MYSQL_HOST/USER/PASSWORD/DATABASE
python production_crawler.py production_config.yml
```

`production_config.yml` 已被 Git 忽略，禁止提交生产数据库、代理、域名或文件路径。

运行不访问网络和数据库的过滤测试：

```bash
python -m unittest test_subtitle_filter.py
```
