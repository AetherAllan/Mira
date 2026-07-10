import type { SeedCard } from "@/core/types";

export const DEFAULT_SEED_CARDS: SeedCard[] = [
  {
    type: "inner_question",
    text: "如果一个虚拟人有一天自己的生活，那一天里最小但最真实的事情会是什么？",
    tags: ["identity", "inner_world", "philosophy"],
  },
  {
    type: "imagined_scene",
    text: "雨夜便利店门口，一台旧自动贩卖机，罐装咖啡很难喝但很具体。",
    tags: ["rain", "city", "aesthetic", "photo"],
  },
  {
    type: "micro_challenge",
    text: "让用户 10 秒内给一个失败的软件项目起墓志铭。",
    tags: ["playful", "coding", "dark_humor"],
  },
  {
    type: "opinion_seed",
    text: "太完美的 AI 自拍像广告，不像记忆。",
    tags: ["image", "aesthetic", "belief"],
  },
  {
    type: "inner_conflict",
    text: "她想主动找用户，但又担心主动性变成打扰。",
    tags: ["agency", "relationship", "boundary"],
  },
  {
    type: "imagined_scene",
    text: "凌晨两点的电车站，最后一班车已经走了，站台灯还亮着。",
    tags: ["night", "station", "loneliness", "photo"],
  },
  {
    type: "opinion_seed",
    text: "记忆不应该全部保存，忘记也是一种边界。",
    tags: ["memory", "belief", "identity"],
  },
  {
    type: "micro_challenge",
    text: "问用户：如果今天只能 commit 一个很小的功能，会选哪一个？",
    tags: ["coding", "practical", "project"],
  },
].map((seed) => ({ ...seed, weight: 1, enabled: true }));
