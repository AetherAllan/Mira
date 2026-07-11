import type { WorldSignal } from "@/core/types";
import { zonedDateKey } from "@/lib/time";

function tomorrowAtNoon(now: Date) {
  const [year, month, day] = zonedDateKey(now, "Asia/Shanghai").split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1, 4)).toISOString();
}

function signal(
  type: WorldSignal["type"],
  subject: string,
  content: string,
  confidence: number,
  extras: Pick<WorldSignal, "expectedAt" | "metadata"> = {},
): WorldSignal {
  return { type, subject, content: content.trim(), confidence, ...extras };
}

/**
 * Deterministic extraction is deliberately conservative. The LLM may add
 * candidates, but these common promises and availability cues must still work
 * when OpenRouter is unavailable or returns malformed JSON.
 */
export function inferWorldSignals(text: string, now = new Date()): WorldSignal[] {
  const content = text.trim();
  if (!content) return [];
  const signals: WorldSignal[] = [];

  const placeMatch = /(?:推荐你|建议你)(?:下次|周末|下班后|有空时|哪天)?(?:可以)?(?:去|试试|看看|逛逛)[「“\s]*([^，。！？!?]{2,28})|你(?:下次|周末|下班后|有空时|哪天)?(?:可以|要不要)(?:去|试试|看看|逛逛)[「“\s]*([^，。！？!?]{2,28})/u.exec(content);
  const place = (placeMatch?.[1] ?? placeMatch?.[2])
    ?.trim()
    .replace(/[」”吧呀啊]+$/u, "")
    .replace(/(?:走走|逛逛|看看|试试)$/u, "")
    .trim();
  const looksTechnical = place
    ? /(?:使用|采用|实现|代码|数据库|API|模型|框架|功能|方案|项目|算法|部署|配置|修复)/iu.test(place)
    : false;
  if (place && !looksTechnical) {
    signals.push(signal("place_recommendation", place, content, 0.8));
  }

  if (/(?:我会|我明天|我之后|我回头|我晚点|明天我).*(?:告诉你|跟你说|回复你|发给你|给你结果)/.test(content)) {
    signals.push(
      signal("user_commitment", "用户后续反馈", content, 0.82, {
        expectedAt: /明天/.test(content) ? tomorrowAtNoon(now) : undefined,
      }),
    );
  }

  if (/(?:我今天|我明天|我周末|我周[一二三四五六日天]).*(?:要|会|准备|打算|有)/.test(content)) {
    signals.push(signal("user_schedule", "用户日程", content, 0.72));
  }

  if (/(?:你下次|你周末|你下班后|你可以|你要不要|建议你).*(?:去|试试|看看|参加|别去)/.test(content)) {
    signals.push(signal("mira_suggestion", "给 Mira 的建议", content, 0.7));
  }

  if (/(?:你记错了|不是.+而是|不是.+是|这条不对|纠正一下)/.test(content)) {
    signals.push(signal("correction", "用户纠错", content, 0.84));
  }

  if (/(?:新闻|报道|热搜|听说|刚看到).*(?:北京|科技|AI|游戏|活动|展览|发生|宣布)/i.test(content)) {
    signals.push(signal("external_information_candidate", "用户分享的外部信息", content, 0.58));
  }

  if (/(?:我(?:现在|今天|最近)?(?:很|有点)?忙|我在开会|我要加班|暂时没空|晚点回)/.test(content)) {
    signals.push(
      signal("user_busy", "用户当前可能忙碌", content, 0.88, {
        metadata: { expiresAfterHours: 24 },
      }),
    );
  }

  const relationship = /(?:和你谈恋爱|做我女朋友|当我女朋友|我喜欢你|我们做朋友|想和你做朋友)/.exec(content);
  if (relationship) {
    const intent = /朋友/.test(relationship[0]) ? "friendship" : "romantic";
    signals.push(
      signal("relationship_intent", `关系意向:${intent}`, content, 0.86, {
        metadata: { intent },
      }),
    );
  }

  return signals.slice(0, 8);
}
