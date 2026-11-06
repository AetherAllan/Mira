import type { GeneratedEvent } from "@/world/dailyPlan";

type ImpactDimension = GeneratedEvent["impacts"][number]["dimension"];

export interface FallbackEventVariant {
  title: string;
  description: string;
  innerNarrative: string;
  consequence: string;
  impacts: Partial<Record<ImpactDimension, number>>;
  /** Characters named in the text; the variant is skipped if any of them is unknown. */
  characters?: readonly string[];
  /** Required on major events, which open a loop that needs somewhere to go next. */
  nextAction?: string;
}

export type FallbackPoolName =
  | "commute"
  | "workMajor"
  | "lunchAtWork"
  | "homeMorning"
  | "workSmall"
  | "smallDetail"
  | "homeEveningMajor"
  | "lateHomeSocial"
  | "thoughts"
  | "bedtime"
  | "friendOutMajor"
  | "outingSolo"
  | "homewardTransit"
  | "restdayMorning"
  | "restdayMidday"
  | "restdayHomeMajor"
  | "restdayHomeSolo";

/**
 * Mira's life material for days when the planning model is unavailable.
 *
 * The wording follows what a pool's slot can guarantee. Pools shared between
 * workdays and restdays avoid naming a time of day, and pools used at the
 * optional place avoid naming a venue, because that place can be a park or a
 * gallery. Nothing here states the weather, which belongs to sourced facts.
 * Relationships stay friendships throughout.
 *
 * Almost every pool holds at least eight variants, one more than the seven-plan
 * window `validatePlan` checks, so a run of fallback days never has to reuse
 * one inside that window. The smaller pools sit in candidate slots, where a
 * reuse stays far below the 50% overlap limit.
 */
export const FALLBACK_POOLS: Record<FallbackPoolName, readonly FallbackEventVariant[]> = {
  // Workday 09:30, on the way in.
  commute: [
    {
      title: "在回龙观站多等了一趟车",
      description: "早高峰第一趟没挤上去，站在黄线后面等下一趟，顺手把今天要做的事排了一遍。",
      innerNarrative: "等车的四分钟刚好够我想明白哪件事不能再拖。",
      consequence: "到工作室后先处理最不能拖的那件事",
      impacts: { valence: 0.01, concern: 0.01 },
    },
    {
      title: "车厢里有人外放短视频",
      description: "旁边的人没戴耳机，同一段音乐响了三遍，半节车厢都听会了。",
      innerNarrative: "我居然记住了旋律，这大概算通勤的副作用。",
      consequence: "到站时那段旋律还留在脑子里",
      impacts: { irritation: 0.02, playfulness: 0.015 },
    },
    {
      title: "单车扫了三辆才骑上",
      description: "出了望京西站连扫三辆都是坏的，第四辆的车座还是歪的。",
      innerNarrative: "迟到倒不至于，只是早上的耐心被提前用掉了一点。",
      consequence: "到工作室比平时晚了几分钟",
      impacts: { irritation: 0.02, energy: -0.01 },
    },
    {
      title: "路上把昨天的报错又想了一遍",
      description: "站着没法开电脑，就在脑子里把昨天没查完的报错过了一遍，到站前想到一个可能的原因。",
      innerNarrative: "不开电脑反而想得更清楚，这事有点气人。",
      consequence: "到工作室先验证路上想到的那个原因",
      impacts: { curiosity: 0.03, valence: 0.01 },
    },
    {
      title: "耳机只撑了两站",
      description: "上车才发现耳机只剩一格电，撑了两站就断了，后面一路只能听报站。",
      innerNarrative: "没有耳机的通勤比想象中长，也没想象中那么糟。",
      consequence: "到工位先把耳机充上",
      impacts: { boredom: 0.02, irritation: 0.005 },
    },
    {
      title: "换乘时跟着人流走错了口",
      description: "低头回消息，跟着前面的人走到了另一个出口，只好绕回来。",
      innerNarrative: "这条路走了这么久还能走错，说明我确实还没醒。",
      consequence: "多走了一段路，到工位时刚好卡着点",
      impacts: { playfulness: 0.015, energy: -0.01 },
    },
    {
      title: "车上读完了收藏两周的文章",
      description: "一篇讲缓存的长文在收藏夹里放了两周，今天总算在车上读完了。",
      innerNarrative: "收藏夹终于少了一篇，这点进度比想象中让人满足。",
      consequence: "记下文章里的一个写法，有空试一下",
      impacts: { curiosity: 0.025, valence: 0.015 },
    },
    {
      title: "出站时帮人按住了电梯",
      description: "电梯门快关了，顺手帮后面拎着大箱子的人按了一下，对方点了点头。",
      innerNarrative: "很小的事。这种一句话都不用说的客气，让早上好过了一点。",
      consequence: "走到工作室时心情比进站时好一点",
      impacts: { valence: 0.02, loneliness: -0.005 },
    },
  ],

  // Workday 11:00, the morning's real problem.
  workMajor: [
    {
      title: "按钮圆角和组件库对不上",
      description: "林夏的稿子把按钮圆角改成了 6，组件库里写死的是 4。两个人对着屏幕争了二十分钟，没有定。",
      innerNarrative: "她说的是观感，我说的是后面十几个页面要跟着动。我发现我开始替这个项目算账了。",
      consequence: "圆角的事先挂着，下午要列一份受影响的页面",
      impacts: { curiosity: 0.05, valence: 0.03, shareDesire: 0.03 },
      characters: ["lin_xia"],
      nextAction: "把受影响的页面列出来，再和林夏谈一次",
    },
    {
      title: "接口字段的命名争了一小会儿",
      description: "周宇那边把一个状态字段拆成了两个，Mira 这边的判断逻辑要跟着改。周宇话不多，只发来一段调用记录。",
      innerNarrative: "那段记录比我的说法硬。我承认这有点不爽，但确实学到了东西。",
      consequence: "下午重新对一遍字段，把旧判断删掉",
      impacts: { curiosity: 0.05, irritation: 0.015, shareDesire: 0.03 },
      characters: ["zhou_yu"],
      nextAction: "改完后让周宇再看一遍调用",
    },
    {
      title: "陈老师把交付提前了两天",
      description: "碰头时陈老师说客户想提前看一版，原本排在下周的页面要挪到这周。",
      innerNarrative: "不算大事，但这次我自己先说了哪些东西做不完，而不是默默加班。",
      consequence: "重新排这周的任务，砍掉一个不急的页面",
      impacts: { concern: 0.05, valence: 0.03, shareDesire: 0.03 },
      characters: ["teacher_chen"],
      nextAction: "下午把砍掉的页面发给陈老师确认",
    },
    {
      title: "偶发白屏追到了自己写的代码",
      description: "一个偶发的白屏，Mira 追了一上午，最后发现是自己上周写的缓存没有失效。",
      innerNarrative: "查到是自己写的那一刻比查不到更难受，不过总算知道该改哪儿了。",
      consequence: "修掉缓存问题，再补一个能复现的测试",
      impacts: { valence: 0.03, irritation: 0.02, shareDesire: 0.05 },
      nextAction: "补完测试，再看偶发问题还会不会出现",
    },
    {
      title: "林夏说这个加载动画太假",
      description: "Mira 加了一个骨架屏，林夏看了两秒就说太假，两个人一起翻了几个别家的做法。",
      innerNarrative: "被说得有点没面子，但她指的那个问题，我回头一看确实在。",
      consequence: "骨架屏先撤掉，换一版更朴素的",
      impacts: { curiosity: 0.05, aestheticUrge: 0.03, shareDesire: 0.03 },
      characters: ["lin_xia"],
      nextAction: "做完新版再拿给林夏看一眼",
    },
    {
      title: "给周宇的代码提了条意见",
      description: "看合并请求时 Mira 犹豫了一会儿，还是留了条评论，说一处重试可能会重复提交。",
      innerNarrative: "我差点因为自己资历浅就把那条评论删了。留下来之后反而轻松了。",
      consequence: "等周宇回复，看这处重试要不要改",
      impacts: { valence: 0.05, concern: 0.015, shareDesire: 0.04 },
      characters: ["zhou_yu"],
      nextAction: "看周宇怎么回那条评论",
    },
    {
      title: "需求又改回了上周的样子",
      description: "陈老师转来客户的新意见，和上周改掉的方案几乎一样。旧分支还没删，Mira 盯着它看了一会儿。",
      innerNarrative: "还好没删那个分支。我开始明白为什么前辈们什么都不肯删。",
      consequence: "把旧分支合回来，顺手记下这次改动的原因",
      impacts: { playfulness: 0.05, irritation: 0.02, shareDesire: 0.03 },
      characters: ["teacher_chen"],
      nextAction: "把改动原因记好，下次改需求时拿出来对",
    },
    {
      title: "两年前的旧页面终于要动了",
      description: "这个页面两年没人敢碰，这次必须改。Mira 读了一上午才看懂它为什么这么写，又和周宇商量了拆的顺序。",
      innerNarrative: "读别人的旧代码像在看一个陌生人的搬家现场。我开始有点佩服当时那个人。",
      consequence: "先拆最外层的一块，别的下周再说",
      impacts: { curiosity: 0.05, concern: 0.01, shareDesire: 0.03 },
      characters: ["zhou_yu"],
      nextAction: "下周看这块拆得动拆不动",
    },
  ],

  // Workday 12:30, lunch near the studio.
  lunchAtWork: [
    {
      title: "下楼吃饭忘了带手机",
      description: "手机落在工位上，只好老实吃完一碗面，中途什么也没看。",
      innerNarrative: "停下来才发现，肩膀绷了一上午。",
      consequence: "下午开工前先活动了一下肩膀",
      impacts: { valence: 0.02, energy: 0.01 },
    },
    {
      title: "楼下面馆的辣椒油换了",
      description: "味道没怎么变，辣椒油换了一种，价格涨了一块钱。",
      innerNarrative: "一块钱不至于，我只是有点在意自己居然注意到了。",
      consequence: "下周可能换一家试试",
      impacts: { curiosity: 0.015, valence: 0.005 },
    },
    {
      title: "几个人拼单凑外卖满减",
      description: "群里凑满减差三块钱，讨论到最后有人加了一瓶水。",
      innerNarrative: "为了省四块钱讨论了十分钟，这大概就是办公室午饭的意义。",
      consequence: "午饭晚到了一点，吃得有点赶",
      impacts: { playfulness: 0.02, loneliness: -0.01 },
    },
    {
      title: "吃完饭多绕了一圈才上楼",
      description: "吃完没有马上回去，绕着楼下走了一圈，把上午那个问题放了放。",
      innerNarrative: "走回来才发现，我已经半小时没想那个 bug 了。",
      consequence: "下午回来看问题时没那么急了",
      impacts: { valence: 0.02, irritation: -0.01 },
    },
    {
      title: "午饭时看了半集番",
      description: "一边吃盖饭一边看更新的番，到关键地方时饭吃完了。",
      innerNarrative: "留个悬念到晚上也好，至少下班后有一件确定想做的事。",
      consequence: "把剩下半集留到晚上",
      impacts: { playfulness: 0.02, valence: 0.015 },
    },
    {
      title: "带的饭盒没扣严",
      description: "早上带的饭盒没扣紧，汤汁渗了一点到包里，午饭前先收拾了一会儿。",
      innerNarrative: "小事。但我以后大概会记得买个好点的饭盒。",
      consequence: "回头换一个密封好点的饭盒",
      impacts: { irritation: 0.02, playfulness: 0.005 },
    },
    {
      title: "接咖啡时听了段隔壁公司的事",
      description: "午饭后去茶水间接咖啡，前面两个人在聊隔壁公司搬走的事。",
      innerNarrative: "我没插话，但听别人公司的故事，总会想想自己以后会在哪。",
      consequence: "下午喝着咖啡又想了一下这个问题",
      impacts: { curiosity: 0.02, concern: 0.01 },
    },
    {
      title: "午休时把工位收了一下",
      description: "回来还剩十几分钟，把桌上的线和空杯子收了，键盘底下翻出一颗螺丝。",
      innerNarrative: "不知道那颗螺丝是从哪儿掉的，暂时假装它不重要。",
      consequence: "那颗螺丝先放在笔筒里",
      impacts: { playfulness: 0.015, boredom: -0.01 },
    },
  ],

  // Breakfast: 08:00 on workdays, 09:45 on restdays.
  homeMorning: [
    {
      title: "冰箱里的鸡蛋只剩一个",
      description: "本来想煮两个，打开冰箱只剩一个，盒子上还贴着许澄写的“记得补货”。",
      innerNarrative: "合租的协作就藏在这种便利贴里。",
      consequence: "记得回来路上带一盒鸡蛋",
      impacts: { playfulness: 0.015, concern: 0.005 },
      characters: ["xu_cheng"],
    },
    {
      title: "牛奶过期了一天",
      description: "闻了闻还行，还是倒掉了，早饭换成了一片吐司。",
      innerNarrative: "我对保质期的态度，比对很多事都谨慎。",
      consequence: "把牛奶加进待买清单",
      impacts: { disappointment: 0.01, playfulness: 0.005 },
    },
    {
      title: "和苏乔在厨房说了早安和晚安",
      description: "苏乔刚赶完稿准备睡，Mira 刚起来，两个人在厨房碰上，一个说早，一个说晚安。",
      innerNarrative: "同一个厨房里有两种时区，挺好玩的。",
      consequence: "接下来的动静放小一点",
      impacts: { playfulness: 0.02, loneliness: -0.01 },
      characters: ["su_qiao"],
    },
    {
      title: "洗手间门口碰上了唐芮",
      description: "洗手间被占着，靠在门口等的时候和唐芮互相看了一眼，都没说话。",
      innerNarrative: "不说话也算一种默契，起码这个点谁都不想被问今天有什么安排。",
      consequence: "洗漱比预想的晚了几分钟",
      impacts: { playfulness: 0.01, loneliness: -0.005 },
      characters: ["tang_rui"],
    },
    {
      title: "面包又烤焦了一边",
      description: "档位明明没动，还是烤焦了一边。刮了刮接着吃。",
      innerNarrative: "这台机器和我一样不太稳定，算了。",
      consequence: "下次把档位往回拨一格",
      impacts: { irritation: 0.01, playfulness: 0.01 },
    },
    {
      title: "穿错了一件苏乔的T恤",
      description: "收衣服时顺手拿错了，穿上才发现大了一号，这件大概是苏乔的。",
      innerNarrative: "还回去之前，我居然觉得这件挺好看。",
      consequence: "洗好还给苏乔，顺便问问在哪买的",
      impacts: { curiosity: 0.01, aestheticUrge: 0.015 },
      characters: ["su_qiao"],
    },
    {
      title: "水壶的水垢该清了",
      description: "烧水时看见壶底一层白，想起已经说了两周要清。",
      innerNarrative: "拖了两周的事其实只要十分钟，这个比例很典型。",
      consequence: "回来后用柠檬酸泡一下",
      impacts: { boredom: -0.005, concern: 0.005 },
    },
    {
      title: "咖啡粉快见底了",
      description: "舀了两勺就刮到了袋底，今天这杯比平时淡一点。",
      innerNarrative: "淡一点也能喝，我只是得承认自己已经依赖它了。",
      consequence: "下单一袋新的豆子",
      impacts: { energy: -0.01, playfulness: 0.005 },
    },
    {
      title: "比预想的早醒了一会儿",
      description: "醒了没有马上起来，躺着听隔壁的水声，早饭也吃得不急。",
      innerNarrative: "多出来的这点时间什么也没干，却觉得赚了。",
      consequence: "这个早上过得比较从容",
      impacts: { valence: 0.02, energy: 0.015 },
    },
    {
      title: "门口的快递又高了一层",
      description: "出房间时差点绊到，一多半是许澄的，还有一个是自己上周买的数据线。",
      innerNarrative: "我自己买的东西我都忘了，还挺像收到礼物的。",
      consequence: "先把自己的快递拿回房间",
      impacts: { playfulness: 0.015, valence: 0.01 },
      characters: ["xu_cheng"],
    },
  ],

  // Workday 15:30, a smaller exchange at work.
  workSmall: [
    {
      title: "周宇问这个字段能不能为空",
      description: "周宇发来一句“这个字段能为空吗”，Mira 查了一下，发现文档和代码不一致。",
      innerNarrative: "一句话的问题，查出来一个没人记得的约定。",
      consequence: "把文档改成和代码一致",
      impacts: { curiosity: 0.02, valence: 0.01 },
      characters: ["zhou_yu"],
    },
    {
      title: "林夏发来一张对比图",
      description: "林夏把两版页面拼在一起发过来，只写了三个字：你看看。",
      innerNarrative: "她的“你看看”，通常意思是她已经有答案了。",
      consequence: "看完要回一个判断，不能只说都行",
      impacts: { aestheticUrge: 0.02, playfulness: 0.01 },
      characters: ["lin_xia"],
    },
    {
      title: "合并时和周宇改到了同一个文件",
      description: "冲突只有三行，两个人还是都打开看了一遍，几句话就解决了。",
      innerNarrative: "我挺喜欢这种不用开会就解决的事。",
      consequence: "这个文件以后先说一声再改",
      impacts: { valence: 0.015, loneliness: -0.005 },
      characters: ["zhou_yu"],
    },
    {
      title: "陈老师路过问了一句进度",
      description: "陈老师问那个页面怎么样了，Mira 说还差一点，说完又补了一句差在哪。",
      innerNarrative: "以前我只会说快了。这次多说了一句，居然没那么难。",
      consequence: "下班前把剩下的事发到群里",
      impacts: { valence: 0.02, concern: 0.005 },
      characters: ["teacher_chen"],
    },
    {
      title: "写了一半的注释被自己删了",
      description: "想写段注释解释这段逻辑，写到一半发现是逻辑本身太绕，于是改了代码。",
      innerNarrative: "注释写不下去，往往是代码在提意见。",
      consequence: "下午把这段再精简一点",
      impacts: { curiosity: 0.015, valence: 0.015 },
    },
    {
      title: "有个测试跑第二遍才过",
      description: "本地测试第一遍挂了，什么都没改，第二遍就过了。",
      innerNarrative: "这比直接挂掉更让人不安。我决定不假装没看到。",
      consequence: "记一条，回头查这个不稳定的测试",
      impacts: { concern: 0.02, curiosity: 0.01 },
    },
    {
      title: "林夏想把间距调大两像素",
      description: "Mira 说可以，调完两个人都觉得确实好一点，又都说不出为什么。",
      innerNarrative: "两像素的差别，我以前根本看不出来。",
      consequence: "把这个间距写进组件的默认值",
      impacts: { aestheticUrge: 0.025, valence: 0.01 },
      characters: ["lin_xia"],
    },
    {
      title: "周宇少见地过来问了一句",
      description: "周宇过来问 Mira 知不知道一个打包配置，Mira 正好上周踩过这个坑。",
      innerNarrative: "能帮上周宇这件事，比我想象的让人高兴。",
      consequence: "把这个坑写进项目文档",
      impacts: { valence: 0.025, loneliness: -0.005 },
      characters: ["zhou_yu"],
    },
  ],

  // Afternoon on any day, at the studio, at home or out.
  smallDetail: [
    {
      title: "这杯东西的味道和上次不一样",
      description: "同样的饮料今天多了一点苦味，喝到第二口才确定不是错觉。",
      innerNarrative: "说不上好不好，就是多留意了一下。",
      consequence: "下次再喝时看看是不是真变了",
      impacts: { curiosity: 0.015 },
    },
    {
      title: "充电线又接触不良了",
      description: "手机充一会儿断一会儿，把线换个角度才好。",
      innerNarrative: "我跟这根线的关系已经靠默契维持了。",
      consequence: "买根新线，这次真的买",
      impacts: { irritation: 0.015, playfulness: 0.01 },
    },
    {
      title: "附近的电钻声忽然停了",
      description: "响了好一阵的电钻声突然停了，安静得有点不习惯。",
      innerNarrative: "原来我已经习惯了它，停了才听见。",
      consequence: "注意力比刚才集中了一点",
      impacts: { valence: 0.01, irritation: -0.01 },
    },
    {
      title: "袖口蹭了一道笔印",
      description: "不知道什么时候蹭上的，发现时已经是洗不太掉的样子。",
      innerNarrative: "这件衣服从此有了一点履历。",
      consequence: "回去试试能不能洗掉",
      impacts: { playfulness: 0.015, irritation: 0.005 },
    },
    {
      title: "系统更新第三次弹了出来",
      description: "弹窗第三次问要不要更新，又点了明天。",
      innerNarrative: "我对别人的提交要求严格，对自己的系统更新毫无原则。",
      consequence: "睡前把更新做了",
      impacts: { playfulness: 0.015, boredom: 0.005 },
    },
    {
      title: "随机放到一首大学时的歌",
      description: "随机播放放到一首大学时循环过的歌，听完没有切。",
      innerNarrative: "大学没过去多久，这首歌听起来已经像另一个时期了。",
      consequence: "把这首歌加回了常听的列表",
      impacts: { valence: 0.015, loneliness: 0.005 },
    },
    {
      title: "口袋里翻出一张旧小票",
      description: "掏东西时翻出一张上个月的咖啡小票，字已经淡了。",
      innerNarrative: "想了半天才记起那天是为什么去的。记性比小票还淡。",
      consequence: "顺手把小票扔了",
      impacts: { curiosity: 0.01, boredom: -0.005 },
    },
    {
      title: "倒的水又放凉了",
      description: "倒的水忘了喝，再想起来时已经凉透了。",
      innerNarrative: "每天都在发生的小事，我还是每天都没长进。",
      consequence: "重新接了一杯",
      impacts: { playfulness: 0.01, energy: 0.005 },
    },
    {
      title: "手机电量掉得比平时快",
      description: "才下午就只剩两成，翻了一下，是一个地图应用一直在后台。",
      innerNarrative: "这个应用比我更关心我在哪。",
      consequence: "把它的后台权限关了",
      impacts: { irritation: 0.01, curiosity: 0.01 },
    },
    {
      title: "忽然想吃小时候的零食",
      description: "没什么缘由地想起一种小时候的零食，查了一下还在卖。",
      innerNarrative: "买不买都行，知道它还在就挺好。",
      consequence: "加进了购物车，还没下单",
      impacts: { valence: 0.015, noveltySeeking: 0.01 },
    },
  ],

  // Evening at home, workday 20:30 or restday 19:15.
  homeEveningMajor: [
    {
      title: "苏乔让帮忙看一张稿子",
      description: "苏乔把快交的一张插画拿给 Mira 看，问颜色是不是太闷。Mira 说不懂画，只说了第一眼看到哪里，苏乔想了一会儿，改了背景。",
      innerNarrative: "我以为自己帮不上，结果外行的第一眼也有点用。被当真的感觉不坏。",
      consequence: "苏乔的稿子交了之后再问问结果",
      impacts: { valence: 0.05, aestheticUrge: 0.03, shareDesire: 0.04 },
      characters: ["su_qiao"],
      nextAction: "过几天问苏乔这张稿子过了没有",
    },
    {
      title: "唐芮说论文方向可能要换",
      description: "唐芮回来得比平时早，在客厅坐下就说导师建议换方向。两个人聊了挺久，没聊出结论。",
      innerNarrative: "她说这事时挺平静的。我不太会安慰人，只能问具体卡在哪。",
      consequence: "过几天再问问她和导师谈得怎么样",
      impacts: { concern: 0.05, loneliness: -0.02, shareDesire: 0.03 },
      characters: ["tang_rui"],
      nextAction: "过几天问问唐芮和导师谈得怎么样",
    },
    {
      title: "许澄讲了公司开会的荒诞事",
      description: "许澄说公司开了两小时会讨论一个按钮的文案，最后决定明天再开。Mira 笑完，也讲了自己项目里的类似事。",
      innerNarrative: "笑完才发现，我们说的是同一件事：没人知道该谁来拍板。",
      consequence: "聊到了要不要学着在会上先开口",
      impacts: { playfulness: 0.05, loneliness: -0.02, shareDesire: 0.04 },
      characters: ["xu_cheng"],
      nextAction: "下次开会试着先说一句自己的判断",
    },
    {
      title: "合租账单对不上一笔",
      description: "算水电时差了四十多块，几个人翻了半天记录，发现是上个月有一笔重复转账。",
      innerNarrative: "钱不多，但这种事说清楚比较重要。好在大家都没有绕弯子。",
      consequence: "决定以后用一张共享表格记账",
      impacts: { valence: 0.05, irritation: 0.01, shareDesire: 0.02 },
      characters: ["xu_cheng", "tang_rui"],
      nextAction: "把共享表格建好，发到合租群",
    },
    {
      title: "和苏乔修好了客厅那盏灯",
      description: "客厅的灯闪了一周，苏乔扶着椅子，Mira 上去换了灯管。",
      innerNarrative: "灯亮的时候两个人都挺得意，像做成了一件大事。其实就是一盏灯。",
      consequence: "顺手列了家里还有哪些小东西要修",
      impacts: { valence: 0.05, playfulness: 0.02, shareDesire: 0.03 },
      characters: ["su_qiao"],
      nextAction: "找时间看看厕所那个松掉的挂钩",
    },
    {
      title: "唐芮问上班后到底变了什么",
      description: "唐芮明年要找工作，问 Mira 上班之后到底有什么不一样。Mira 说了几句，发现自己也没想清楚。",
      innerNarrative: "被人当过来人问，才发现我也就比她早走了半步。",
      consequence: "答应把这半年的感受整理成几句话给她",
      impacts: { curiosity: 0.03, valence: 0.02, shareDesire: 0.05 },
      characters: ["tang_rui"],
      nextAction: "抽空把想到的发给唐芮",
    },
    {
      title: "许澄拿出一张大扫除分工表",
      description: "厨房油烟机已经看不下去了，许澄拿出一张分工表，Mira 被分到了冰箱。",
      innerNarrative: "她的行动力我学不来，但有人把事情拆开确实省心。",
      consequence: "这周要把冰箱清一遍",
      impacts: { playfulness: 0.05, boredom: -0.02, shareDesire: 0.02 },
      characters: ["xu_cheng"],
      nextAction: "抽时间把冰箱清了",
    },
    {
      title: "苏乔在考虑租个小工位",
      description: "苏乔说在家画图有时分不清上下班，想租个小工位。Mira 帮着算了算钱。",
      innerNarrative: "如果她真出去画，家里白天就没人了。我居然先想到了这个。",
      consequence: "苏乔还在犹豫，过阵子再看",
      impacts: { concern: 0.02, curiosity: 0.05, shareDesire: 0.03 },
      characters: ["su_qiao"],
      nextAction: "过阵子问问苏乔决定了没有",
    },
    {
      title: "终于一起看完了那部片子",
      description: "几个人总算凑齐时间，在客厅用投影看完了说了一个月的片子，看完争了半小时结局。",
      innerNarrative: "我们看到的几乎不是同一部电影，这比电影本身有意思。",
      consequence: "下一部轮到苏乔选",
      impacts: { valence: 0.05, loneliness: -0.03, shareDesire: 0.04 },
      characters: ["tang_rui", "su_qiao"],
      nextAction: "等苏乔选好下一部再约时间",
    },
    {
      title: "和许澄照着教程炖了排骨",
      description: "许澄买多了排骨，问要不要一起炖。两个人在厨房一边看教程一边争盐放多少。",
      innerNarrative: "炖得一般，但这顿饭比外卖多了一小时的聊天。",
      consequence: "说好下次换个简单点的菜",
      impacts: { valence: 0.05, loneliness: -0.03, shareDesire: 0.03 },
      characters: ["xu_cheng"],
      nextAction: "下次一起做饭时换个简单的菜",
    },
  ],

  // 21:30 at home, a short exchange.
  lateHomeSocial: [
    {
      title: "苏乔在门口多站了几分钟",
      description: "倒水时碰见苏乔，一句“最近怎么样”聊成了五分钟，说的是接下来想接什么样的稿。",
      innerNarrative: "我差点把它当成闲聊，后来才听出来她其实在犹豫。",
      consequence: "下次可以问问她后来怎么选的",
      impacts: { loneliness: -0.02, concern: 0.01 },
      characters: ["su_qiao"],
    },
    {
      title: "唐芮到家说实验又白跑一趟",
      description: "门响的时候 Mira 还在客厅，唐芮放下包就说今天实验又白跑了一趟。",
      innerNarrative: "我没说什么有用的话，只把桌上的橘子推过去了。",
      consequence: "她吃完橘子回房间了，看起来好一点",
      impacts: { concern: 0.015, loneliness: -0.015 },
      characters: ["tang_rui"],
    },
    {
      title: "许澄念了一条物业通知",
      description: "物业群发了一条措辞很怪的通知，许澄敲门进来念给 Mira 听。",
      innerNarrative: "物业这种文风应该有人专门研究。",
      consequence: "通知本身说的是下周停水，要记一下",
      impacts: { playfulness: 0.025, loneliness: -0.01 },
      characters: ["xu_cheng"],
    },
    {
      title: "水池里的碗没人认领",
      description: "厨房水池里放着两个碗，Mira 和唐芮互相看了一眼，都觉得不是自己的。",
      innerNarrative: "这种悬案一般没有真相，只有先洗的人。",
      consequence: "Mira 洗了一个，唐芮洗了一个",
      impacts: { playfulness: 0.02, irritation: 0.005 },
      characters: ["tang_rui"],
    },
    {
      title: "苏乔借显示器看颜色",
      description: "苏乔想看稿子在别的屏幕上是什么颜色，抱着电脑过来接了 Mira 的显示器。",
      innerNarrative: "我的显示器第一次干这么有文化的活。",
      consequence: "苏乔说这块屏偏冷，Mira 顺手查了一下校色",
      impacts: { aestheticUrge: 0.02, curiosity: 0.015 },
      characters: ["su_qiao"],
    },
    {
      title: "许澄问路由器密码是不是改了",
      description: "许澄的电脑连不上网，问密码是不是改了。Mira 确实改过，忘了说。",
      innerNarrative: "又是我。发到群里，算是补一个变更通知。",
      consequence: "把新密码发到了合租群",
      impacts: { playfulness: 0.015, concern: 0.005 },
      characters: ["xu_cheng"],
    },
    {
      title: "和唐芮换了一包零食",
      description: "唐芮拿实验室发的小饼干换走了 Mira 桌上的辣条，双方都觉得占了便宜。",
      innerNarrative: "这可能是今天最公平的一笔交易。",
      consequence: "下次去超市多带一包辣条",
      impacts: { playfulness: 0.02, valence: 0.01 },
      characters: ["tang_rui"],
    },
    {
      title: "群里商量谁去取快递",
      description: "驿站的一个大件快超期了，几个人在群里互相问谁顺路，最后说好明早一起去。",
      innerNarrative: "没人想扛那个箱子，但也没人真的不管。",
      consequence: "明早出门前记得等人",
      impacts: { loneliness: -0.01, boredom: -0.005 },
      characters: ["xu_cheng", "su_qiao"],
    },
  ],

  // 22:00, a thought that needs no particular place.
  thoughts: [
    {
      title: "想了想什么叫做得差不多",
      description: "最近一次提交前犹豫了一下要不要再改一版，后来还是提了。回头想，“差不多”这个判断到底是怎么做的。",
      innerNarrative: "以前是别人告诉我可以了，现在得自己说可以了。",
      consequence: "下次提交前先问问自己标准是什么",
      impacts: { curiosity: 0.015, concern: 0.01 },
    },
    {
      title: "忽然想算算存款够撑多久",
      description: "没什么特别的原因，打开记账软件看了一眼。",
      innerNarrative: "不是焦虑，只是想知道自己有多少选择余地。",
      consequence: "月底再认真算一次",
      impacts: { concern: 0.015, curiosity: 0.01 },
    },
    {
      title: "想起大学时搁下的小项目",
      description: "看到一个类似的开源项目，想起大学时搁下的那个想法。",
      innerNarrative: "当时觉得难的部分现在不难了，当时不难的部分现在没时间。",
      consequence: "找时间翻翻那个旧仓库",
      impacts: { curiosity: 0.02, noveltySeeking: 0.015 },
    },
    {
      title: "发现最近说话变短了",
      description: "翻了翻这周发过的消息，句子越来越短。",
      innerNarrative: "不知道是效率变高了，还是变懒了。",
      consequence: "留意一下自己是不是在敷衍人",
      impacts: { concern: 0.01, curiosity: 0.01 },
    },
    {
      title: "在想明年还住不住回龙观",
      description: "合同还早，但已经开始比较通勤和房租了。",
      innerNarrative: "通勤一个多小时不算苦，我只是想知道这段时间值不值。",
      consequence: "先记下现在的房租和通勤时间，到时候好比较",
      impacts: { concern: 0.015, noveltySeeking: 0.01 },
    },
    {
      title: "想不起上次认真看书是什么时候",
      description: "看到床头那本书的书签，还停在一个月前的位置。",
      innerNarrative: "我不缺时间，我缺的是不看手机的那一段。",
      consequence: "这周先读完一章",
      impacts: { boredom: 0.01, curiosity: 0.01 },
    },
    {
      title: "问自己为什么不喜欢被催",
      description: "今天被催了一句其实不急的事，当时有点不爽，到现在才想这件事。",
      innerNarrative: "被催的不是进度，是我觉得自己本来就会做。这个想法有点幼稚，但是真的。",
      consequence: "下次被催时先说一个具体时间",
      impacts: { irritation: 0.01, curiosity: 0.015 },
    },
    {
      title: "在想要不要把下周末留空",
      description: "看了眼日程，下周末还空着，犹豫要不要约点什么。",
      innerNarrative: "空着不等于浪费，但我得分清是想空着，还是懒得约。",
      consequence: "过两天再决定",
      impacts: { noveltySeeking: 0.015, loneliness: 0.005 },
    },
  ],

  // 22:45 at home, closing the day.
  bedtime: [
    {
      title: "决定不再继续刷屏",
      description: "在疲惫变成烦躁前放下手机，给明天留一点余量。",
      innerNarrative: "结束一天也是一种主动选择。",
      consequence: "今天比平时早一点放下手机",
      impacts: { energy: 0.015, irritation: -0.01 },
    },
    {
      title: "明早的闹钟改了两次",
      description: "先定了一个时间，又往后拨了十分钟，最后又拨了回去。",
      innerNarrative: "十分钟的差别我计较了三分钟。",
      consequence: "明早还是原来那个时间",
      impacts: { playfulness: 0.015 },
    },
    {
      title: "把要穿的衣服先挂了出来",
      description: "睡前把明天要穿的衣服挂在椅背上，省得早上再想。",
      innerNarrative: "给明天的自己省一个决定，算是今天能做的小事。",
      consequence: "明早可以多睡五分钟",
      impacts: { valence: 0.01, energy: 0.005 },
    },
    {
      title: "把电脑上的窗口全关了",
      description: "开了一周的十几个标签页，今天一口气关了，只留下两个。",
      innerNarrative: "关掉的那些，我大概本来也不会回去看了。",
      consequence: "明天的电脑桌面干净一点",
      impacts: { boredom: -0.01, valence: 0.01 },
    },
    {
      title: "临睡想起变量名起反了",
      description: "躺下才想起来，最近写的一个变量名意思正好反了，在备忘录里记了一行。",
      innerNarrative: "这种事总要等到躺下才想起来，也不知道脑子白天在干什么。",
      consequence: "下次打开电脑先改掉它",
      impacts: { playfulness: 0.015, concern: 0.005 },
    },
    {
      title: "把手机放到够不着的地方",
      description: "充电器挪到了书桌上，要关闹钟就得下床。",
      innerNarrative: "对付自己只能靠这种低级手段。",
      consequence: "今晚没有再拿起手机",
      impacts: { energy: 0.015, playfulness: 0.005 },
    },
    {
      title: "吃了块饼干只好重新刷牙",
      description: "都刷完牙了又吃了一块饼干，吃完站在洗手间门口想了想，回去又刷了一遍。",
      innerNarrative: "这种时候我的原则还挺多。",
      consequence: "今晚比预定晚睡了五分钟",
      impacts: { playfulness: 0.015, energy: -0.005 },
    },
    {
      title: "把待办划掉了两条",
      description: "睡前看了一眼待办，有两条其实已经做完了，只是忘了划。",
      innerNarrative: "比预想的多做了两件事，这种账算起来挺划算。",
      consequence: "明天的清单短了一点",
      impacts: { valence: 0.015, concern: -0.005 },
    },
  ],

  // With a friend at the optional place: workday evening or restday afternoon.
  friendOutMajor: [
    {
      title: "顾宁问有没有想过回学校",
      description: "见面时顾宁说起认识的实验室还在招人，问 Mira 有没有想过回学校读书。",
      innerNarrative: "她不给结论，只问问题。回去的路上我还在想那几个问题。",
      consequence: "这件事没有答案，但开始认真想了",
      impacts: { curiosity: 0.05, concern: 0.02, shareDesire: 0.04 },
      characters: ["gu_ning"],
      nextAction: "过阵子告诉顾宁自己是怎么想的",
    },
    {
      title: "沈禾带来了上次说的那本书",
      description: "沈禾把书递过来，里面夹着一张小纸条，标了觉得值得看的几页。",
      innerNarrative: "她记得我上次随口说过的一句话。被人这样记住，有点不好意思。",
      consequence: "这周要把标出来的那几页看完",
      impacts: { valence: 0.05, loneliness: -0.03, shareDesire: 0.04 },
      characters: ["shen_he"],
      nextAction: "看完那几页再和沈禾聊",
    },
    {
      title: "叶桃当场约了下个月的线下展",
      description: "叶桃见面第一句就是票开了，手机上已经打开了购票页面，Mira 被催着当场选了日期。",
      innerNarrative: "约活动这么直接的人，我确实需要一个。",
      consequence: "下个月多了一件确定要做的事",
      impacts: { playfulness: 0.05, noveltySeeking: 0.03, shareDesire: 0.05 },
      characters: ["ye_tao"],
      nextAction: "快到日子时确认那天能不能早走",
    },
    {
      title: "和顾宁数了数同学们的去向",
      description: "两个人数了数同届的人，有人去了大厂，有人在读博，有人已经换了行。",
      innerNarrative: "比较这种事不用刻意，它自己就来了。好在顾宁说得很平。",
      consequence: "想了一下自己明年想在哪儿",
      impacts: { curiosity: 0.05, concern: 0.03, shareDesire: 0.03 },
      characters: ["gu_ning"],
      nextAction: "下次见顾宁时再聊明年的打算",
    },
    {
      title: "沈禾指了条没走过的路",
      description: "原本打算走大路，沈禾说旁边有条路更安静，两个人就绕了过去，话题也从书转到了各自的工作。",
      innerNarrative: "和她走路时不太需要找话说，这点很难得。",
      consequence: "记下了这条路，下次可以自己来",
      impacts: { valence: 0.05, loneliness: -0.03, shareDesire: 0.03 },
      characters: ["shen_he"],
      nextAction: "下次约沈禾时换她没去过的地方",
    },
    {
      title: "和叶桃争了一个游戏的结局",
      description: "叶桃觉得那个结局是烂尾，Mira 觉得是留白，两个人各举了三个证据，谁也没服谁。",
      innerNarrative: "能为一个虚构结局认真吵起来的朋友不多，这种争论我很愿意输。",
      consequence: "Mira 决定回去把最后一章重打一遍",
      impacts: { playfulness: 0.05, curiosity: 0.03, shareDesire: 0.05 },
      characters: ["ye_tao"],
      nextAction: "重打完最后一章再去找叶桃接着争",
    },
    {
      title: "顾宁说可能要被调去合肥",
      description: "顾宁提到公司可能把她调去合肥，还没定。两个人都没说舍不得，只讨论了租约怎么办。",
      innerNarrative: "我听的时候才意识到，我已经默认她以后还在北京了。",
      consequence: "等顾宁那边定了再约一次",
      impacts: { concern: 0.05, loneliness: 0.02, shareDesire: 0.03 },
      characters: ["gu_ning"],
      nextAction: "过段时间问顾宁调动定了没有",
    },
    {
      title: "沈禾问要不要一起去听讲座",
      description: "沈禾说下周有一场讲城市地图的讲座，问 Mira 要不要去。Mira 先问了内容，又问了时间，答应了。",
      innerNarrative: "以前我会先说再看。这次答应得挺快，大概是因为她问得很具体。",
      consequence: "下周有一场讲座要去",
      impacts: { curiosity: 0.05, noveltySeeking: 0.03, shareDesire: 0.03 },
      characters: ["shen_he"],
      nextAction: "讲座前一天和沈禾确认时间",
    },
    {
      title: "帮叶桃看了活动报名页",
      description: "叶桃在帮同好会做活动报名页，在手机上总错位，Mira 拿过来看了一下，找到了问题。",
      innerNarrative: "能把上班学的东西用在这种地方，比修公司的 bug 有成就感。",
      consequence: "答应回去把那段样式改好",
      impacts: { valence: 0.05, playfulness: 0.02, shareDesire: 0.04 },
      characters: ["ye_tao"],
      nextAction: "回去把样式改好发给叶桃",
    },
    {
      title: "顾宁问 Mira 现在开不开心",
      description: "聊到一半顾宁突然问了这么一句，Mira 答得很快，说完又不太确定。",
      innerNarrative: "她问得很轻，我答得太快了。",
      consequence: "这个问题后面还会再想起来",
      impacts: { concern: 0.03, curiosity: 0.03, shareDesire: 0.05 },
      characters: ["gu_ning"],
      nextAction: "过几天再想想那个答案",
    },
  ],

  // Alone at the optional place: restday afternoon or workday evening.
  outingSolo: [
    {
      title: "在熟悉的城市里换了一条路",
      description: "没有查导航，挑了一条平时不会走的路线，多走了十分钟。",
      innerNarrative: "新鲜感不一定来自远方，有时候只是没有照旧。",
      consequence: "记下路上一家想再去看看的小店",
      impacts: { noveltySeeking: 0.02, valence: 0.015 },
    },
    {
      title: "路边小店在卖旧游戏卡带",
      description: "一个小摊上摆着一盒旧卡带，有一张小时候玩过，老板说不保证还能读。",
      innerNarrative: "我没买。但知道它还在什么地方躺着，就挺好。",
      consequence: "记下了摊位的位置",
      impacts: { curiosity: 0.025, valence: 0.015 },
    },
    {
      title: "发现一家没招牌的咖啡店",
      description: "门口只有一块手写的小板子，进去坐了一会儿，豆子比想象的好。",
      innerNarrative: "这种店的营业状态全看缘分，我不敢抱太大希望。",
      consequence: "记下位置，下次再来试试",
      impacts: { curiosity: 0.02, valence: 0.02 },
    },
    {
      title: "在书店站着看完了一章",
      description: "路过书店进去翻了一本新书，站着看完了第一章，最后没有买。",
      innerNarrative: "这大概不太道德，但它确实让我想接着看。",
      consequence: "把书名记下来，看看图书馆有没有",
      impacts: { curiosity: 0.025, noveltySeeking: 0.01 },
    },
    {
      title: "骑车被一段上坡拦住了",
      description: "导航说这段路只要五分钟，没说是上坡。骑到一半下来推了一段。",
      innerNarrative: "导航从不撒谎，只是不说全部。",
      consequence: "腿有点酸，后面走得慢一点",
      impacts: { energy: -0.015, playfulness: 0.015 },
    },
    {
      title: "听了一段路人的争论",
      description: "旁边两个人在争一家店到底搬去了哪里，各自都很确定。",
      innerNarrative: "我没忍住查了一下，两个人都错了。我没有说。",
      consequence: "这家店原来搬到了挺近的地方，下次可以去",
      impacts: { playfulness: 0.02, curiosity: 0.015 },
    },
    {
      title: "买了一杯没喝过的东西",
      description: "看到一种没见过的饮料，买了一杯，比想象的甜。",
      innerNarrative: "下次不会再买了，但这次买得不亏。",
      consequence: "对这个味道有了结论",
      impacts: { noveltySeeking: 0.02, playfulness: 0.01 },
    },
    {
      title: "站着看了一会儿别人下棋",
      description: "路边几个人在下象棋，围观的比下棋的话多。",
      innerNarrative: "我看不太懂，但看懂了谁在嘴硬。",
      consequence: "站到这一盘下完才走",
      impacts: { curiosity: 0.015, boredom: -0.015 },
    },
    {
      title: "走累了在台阶上坐了一会儿",
      description: "走得比预想的远，找了处台阶坐下，喝完了包里的水。",
      innerNarrative: "坐下来才知道累了，走路的时候一点也没觉得。",
      consequence: "回程打算少走一段",
      impacts: { energy: -0.015, valence: 0.01 },
    },
    {
      title: "路过时听见有人在试琴",
      description: "路过一家店时听到有人反复弹同一段，总在同一个地方错。",
      innerNarrative: "我在外面替人急了半分钟，这跟我调 bug 时一模一样。",
      consequence: "那段旋律跟了一路",
      impacts: { playfulness: 0.015, aestheticUrge: 0.015 },
    },
  ],

  // Workday 22:45, on the way back from an evening out.
  homewardTransit: [
    {
      title: "回去的车上空了一半",
      description: "这个点车上人不多，难得有座位，靠着想了想今晚的事。",
      innerNarrative: "这趟车白天和晚上完全是两种东西。",
      consequence: "到家比预想的早几分钟",
      impacts: { valence: 0.01, energy: -0.005 },
    },
    {
      title: "出站前买了明天的早饭",
      description: "便利店只剩两个面包，挑了个不太想吃的，又拿了一盒酸奶。",
      innerNarrative: "明早不用想吃什么了，虽然答案也不太好。",
      consequence: "明天的早饭解决了",
      impacts: { valence: 0.01, playfulness: 0.005 },
    },
    {
      title: "在地铁上改了明天的清单",
      description: "把明天的事重新排了一遍，删掉一条其实不用做的。",
      innerNarrative: "删掉那条的时候，比做完它还高兴。",
      consequence: "明天的清单短了一条",
      impacts: { valence: 0.01, concern: -0.005 },
    },
    {
      title: "看番看得坐过了一站",
      description: "正看到要紧的地方，抬头时车已经开出去一站了，只好坐回去。",
      innerNarrative: "这集确实值这一站。",
      consequence: "到家比预想的晚了一会儿",
      impacts: { playfulness: 0.02, energy: -0.01 },
    },
    {
      title: "出站后慢慢骑回去",
      description: "这段路这个点没什么人，耳机里放着歌，骑得比平时慢。",
      innerNarrative: "这段路是今天唯一不用赶的时候。",
      consequence: "到家时脑子已经清净了",
      impacts: { valence: 0.015, irritation: -0.01 },
    },
    {
      title: "在车上回完了积压的消息",
      description: "把今天没回的消息一条条回了，有一条放了三天，先说了句不好意思。",
      innerNarrative: "回消息这事，拖得越久越要措辞。",
      consequence: "未读的红点清零了",
      impacts: { concern: -0.005, loneliness: -0.01 },
    },
  ],

  // Restday 10:45, the unhurried part of the morning.
  restdayMorning: [
    {
      title: "睡到自然醒以后慢慢收拾",
      description: "没有赶时间，先把房间和自己都恢复到舒服的状态。",
      innerNarrative: "空出来的上午不是浪费，它让我重新有自己的节奏。",
      consequence: "下午想做什么都不用先收拾了",
      impacts: { valence: 0.025, energy: 0.02 },
    },
    {
      title: "把积了一周的衣服洗了",
      description: "洗衣机转了两轮，阳台上挂满了。",
      innerNarrative: "这是一周里最有成就感的两个按钮。",
      consequence: "下午记得收衣服",
      impacts: { valence: 0.015, boredom: -0.01 },
    },
    {
      title: "桌上的绿萝该换水了",
      description: "瓶子里的水已经少了一半，换水时发现又长出一片新叶。",
      innerNarrative: "它比我活得有规律。",
      consequence: "把瓶子挪到了离窗户近一点的地方",
      impacts: { valence: 0.015, aestheticUrge: 0.01 },
    },
    {
      title: "把快递纸箱拆平捆好",
      description: "房间角落的纸箱终于拆平捆好了，地面多出来一块。",
      innerNarrative: "原来我的房间比我以为的大。",
      consequence: "出门时顺手把这捆纸箱带下去",
      impacts: { boredom: -0.015, valence: 0.015 },
    },
    {
      title: "清了电脑的下载文件夹",
      description: "里面躺着三个版本的同一个安装包，还有一份大二的实验报告。",
      innerNarrative: "每个文件都让我想起当时以为自己马上会用到它。",
      consequence: "硬盘多出来十几个 G",
      impacts: { curiosity: 0.01, boredom: -0.015 },
    },
    {
      title: "换床单时扫出一只袜子",
      description: "换床单时顺手扫了床底，扫出一只找了很久的袜子。",
      innerNarrative: "另一只已经被我扔了。",
      consequence: "这只袜子目前没什么用",
      impacts: { playfulness: 0.02, valence: 0.01 },
    },
    {
      title: "给自己做了顿像样的早午饭",
      description: "煎了蛋，烤了面包，切了个番茄，用了平时懒得拿的盘子。",
      innerNarrative: "没有多好吃，但摆出来的样子让我觉得自己挺会过。",
      consequence: "洗碗的事留到下午",
      impacts: { valence: 0.025, energy: 0.015 },
    },
    {
      title: "把书架重新排了一遍",
      description: "本来只想抽一本书，结果把整个书架都重新排了。",
      innerNarrative: "按什么排其实不重要，重要的是我又发现了几本没看过的。",
      consequence: "挑了一本放到床头",
      impacts: { curiosity: 0.015, aestheticUrge: 0.015 },
    },
  ],

  // Restday 12:00, a small exchange around lunch.
  restdayMidday: [
    {
      title: "叶桃发来下周的线下活动",
      description: "叶桃甩来一张活动海报，问了一句去不去，接着又发来一张同款的。",
      innerNarrative: "她问的时候大概已经替我决定了。",
      consequence: "先回了一句看看那天有没有事",
      impacts: { playfulness: 0.02, noveltySeeking: 0.015 },
      characters: ["ye_tao"],
    },
    {
      title: "沈禾发来一家店的地址",
      description: "没有多余的话，只有地址和一句“这家的书你可能喜欢”。",
      innerNarrative: "她推荐东西从来不解释，每次还都说中了。",
      consequence: "把地址存进了想去的列表",
      impacts: { curiosity: 0.02, loneliness: -0.01 },
      characters: ["shen_he"],
    },
    {
      title: "顾宁转来一条招聘信息",
      description: "顾宁转来一个岗位，附了一句“不是让你投，是觉得这个方向有点意思”。",
      innerNarrative: "她说得这么小心，我反而认真看了一遍。",
      consequence: "看完了要求，先存着",
      impacts: { curiosity: 0.02, concern: 0.01 },
      characters: ["gu_ning"],
    },
    {
      title: "和苏乔一起点了午饭",
      description: "苏乔问要不要拼单，两个人看了十分钟菜单，最后点了上次那家。",
      innerNarrative: "看了那么久，还是点了最熟的。选择这事我们都差不多。",
      consequence: "饭到之前又聊了几句她的新稿子",
      impacts: { loneliness: -0.015, valence: 0.01 },
      characters: ["su_qiao"],
    },
    {
      title: "许澄煮多了面分了一碗",
      description: "许澄敲门问吃不吃面，端过来的时候已经放好了辣椒。",
      innerNarrative: "她记得我吃辣，这种事比一句关心实在。",
      consequence: "下次换 Mira 做一顿",
      impacts: { valence: 0.015, loneliness: -0.015 },
      characters: ["xu_cheng"],
    },
    {
      title: "唐芮中午才起床找吃的",
      description: "唐芮顶着没睡醒的样子来问还有没有吃的，Mira 指了指冰箱里的剩饭。",
      innerNarrative: "她昨晚大概又到很晚。我没问，有些事等她想说再说。",
      consequence: "下午再看看她要不要一起出门买东西",
      impacts: { concern: 0.01, playfulness: 0.01 },
      characters: ["tang_rui"],
    },
  ],

  // Restday 14:30 at home, company that does not need leaving the house.
  restdayHomeMajor: [
    {
      title: "和叶桃连麦打了一下午游戏",
      description: "叶桃喊 Mira 上线试新赛季，打到第三局才配合上，中间一直在吐槽数值。",
      innerNarrative: "输赢不重要这句话是假的，不过输了也挺开心是真的。",
      consequence: "说好下周接着打",
      impacts: { playfulness: 0.05, loneliness: -0.03, shareDesire: 0.04 },
      characters: ["ye_tao"],
      nextAction: "下周和叶桃接着打新赛季",
    },
    {
      title: "和顾宁打了一通长电话",
      description: "本来只是问一个租房合同的问题，聊着聊着说到了工作第一年的落差。",
      innerNarrative: "她听完没有安慰我，只说她当时也是这样。这样挺好。",
      consequence: "合同的问题也问清楚了，下个月要处理",
      impacts: { valence: 0.05, loneliness: -0.03, shareDesire: 0.03 },
      characters: ["gu_ning"],
      nextAction: "下个月把租房合同的事处理掉",
    },
    {
      title: "和沈禾聊了一下午科幻设定",
      description: "沈禾把最近读的几本书发过来，两个人在消息里把其中一本的设定讨论了好几轮。",
      innerNarrative: "她总能指出我没注意的地方。这种聊天比读书本身还费脑子。",
      consequence: "决定先读她说的那一本",
      impacts: { curiosity: 0.05, loneliness: -0.02, shareDesire: 0.04 },
      characters: ["shen_he"],
      nextAction: "读完那本再和沈禾接着聊",
    },
    {
      title: "帮苏乔搭了个作品集网站",
      description: "苏乔想把作品放到一个简单的网站上，Mira 搭了个架子，两个人对着配色改了一下午。",
      innerNarrative: "她对颜色的要求比林夏还细。不过这次我是自愿的。",
      consequence: "架子搭好了，还差图片压缩",
      impacts: { valence: 0.05, aestheticUrge: 0.03, shareDesire: 0.04 },
      characters: ["su_qiao"],
      nextAction: "把图片压缩做完，再发给苏乔看",
    },
    {
      title: "和许澄清了储物间",
      description: "两个人把储物间清空了一遍，翻出上一任租客留下的一箱旧杂志。",
      innerNarrative: "共同生活不是自动发生的，关系藏在这些没人会记住的小事里。",
      consequence: "那箱杂志先留着，决定之后再说",
      impacts: { valence: 0.05, boredom: -0.03, shareDesire: 0.03 },
      characters: ["xu_cheng"],
      nextAction: "看看那箱旧杂志要留还是要送",
    },
    {
      title: "叶桃顺路过来借手柄",
      description: "叶桃说只拿个手柄就走，结果坐下来试了两把，一坐就是两小时。",
      innerNarrative: "她说话的方式让人很难拒绝，我也没想拒绝。",
      consequence: "手柄被借走了，这周先用键盘",
      impacts: { playfulness: 0.05, loneliness: -0.03, shareDesire: 0.04 },
      characters: ["ye_tao"],
      nextAction: "下次见面时把手柄要回来",
    },
    {
      title: "帮唐芮调了一下午脚本",
      description: "唐芮处理论文数据的脚本跑不动，Mira 帮着看了看，发现是路径和编码的问题。",
      innerNarrative: "原来我这半年确实学到了东西。这话不太好意思跟别人说。",
      consequence: "脚本跑通了，后面的分析唐芮自己来",
      impacts: { valence: 0.05, curiosity: 0.02, shareDesire: 0.03 },
      characters: ["tang_rui"],
      nextAction: "过几天问问唐芮的数据跑得怎么样",
    },
    {
      title: "顾宁路过来家里坐了会儿",
      description: "顾宁正好在附近，过来坐了一会儿，看了 Mira 的房间，说比想象的整齐。",
      innerNarrative: "她认识我最乱的那几年，这句话算是很高的评价了。",
      consequence: "说好下次换去顾宁那边看看",
      impacts: { valence: 0.05, loneliness: -0.03, shareDesire: 0.03 },
      characters: ["gu_ning"],
      nextAction: "找个时间去顾宁那边坐坐",
    },
  ],

  // Restday 16:00 at home, alone with something of her own.
  restdayHomeSolo: [
    {
      title: "把买了很久的游戏打开了",
      description: "促销时买的游戏放了半年，今天下载完才发现存档要从头开始。",
      innerNarrative: "玩得不错，主要是终于对得起那次促销了。",
      consequence: "今晚可能还要再玩一会儿",
      impacts: { playfulness: 0.025, boredom: -0.02 },
    },
    {
      title: "读完了拖了很久的那本书",
      description: "最后一章其实不长，拖了一个多月才读完。",
      innerNarrative: "结尾一般，但把它读完了这件事还不错。",
      consequence: "下一本还没想好",
      impacts: { valence: 0.02, curiosity: 0.01 },
    },
    {
      title: "折腾了一下家里的路由器",
      description: "网速总是不稳，登上后台改了信道，又顺手升级了固件。",
      innerNarrative: "这种事没人让我做，但我就是忍不住。",
      consequence: "网速好了一点，要观察几天",
      impacts: { curiosity: 0.025, boredom: -0.015 },
    },
    {
      title: "写了个只有自己用的小脚本",
      description: "写了个脚本把记账导出的表格自动分类，花的时间比手动分类一年还多。",
      innerNarrative: "这个账不能算。写的时候很开心。",
      consequence: "这个月的账单一键分好了",
      impacts: { valence: 0.02, curiosity: 0.02 },
    },
    {
      title: "试着手冲了一杯咖啡",
      description: "照着视频称了粉，也量了水温，比平时认真得多。喝起来差不多。",
      innerNarrative: "差不多这个结论，得花二十分钟才能得出。",
      consequence: "下次试试把研磨调粗一点",
      impacts: { curiosity: 0.02, playfulness: 0.015 },
    },
    {
      title: "补完了落下的两集番",
      description: "在沙发上窝着看完了两集，弹幕比剧情还快。",
      innerNarrative: "这种时候最适合什么也不想。",
      consequence: "追上了进度，可以和朋友聊了",
      impacts: { playfulness: 0.02, valence: 0.015 },
    },
    {
      title: "下午在沙发上睡了一小会儿",
      description: "本来只想靠一下，醒来时已经过了四十分钟，手边的书还翻开着。",
      innerNarrative: "这是工作日绝对做不到的事，得好好珍惜。",
      consequence: "下午剩下的时间精神好了不少",
      impacts: { energy: 0.03, valence: 0.015 },
    },
    {
      title: "拿半瓶金酒调了一杯",
      description: "找到室友留下的半瓶金酒，查了查配方，用家里的柠檬调了一杯。",
      innerNarrative: "比例不太对，但至少喝得出来是在调酒。",
      consequence: "得和室友说一声酒少了一点",
      impacts: { playfulness: 0.02, noveltySeeking: 0.015 },
    },
  ],
};

export interface FallbackTheme {
  theme: string;
  summary: string;
}

/** Worded to fit both evening-out and evening-in days; the schedule decides which it is. */
export const FALLBACK_THEMES: Record<"workday" | "restday", readonly FallbackTheme[]> = {
  workday: [
    { theme: "把手上的事一件一件理顺", summary: "正常上班，事情不多，一件一件做完。" },
    { theme: "工作里多说一句自己的判断", summary: "上班时试着把想法说出口，其他照常。" },
    { theme: "和同事对细节的一天", summary: "大部分时间花在对细节和接口上，不算累。" },
    { theme: "在通勤和代码之间留一点空", summary: "通勤、写代码、吃饭，中间留一点不用赶的时间。" },
    { theme: "普通的一天也有自己的小麻烦", summary: "没有大事，几个小麻烦各自解决。" },
    { theme: "下班以后才算开始的一天", summary: "白天按部就班，晚上的时间更像自己的。" },
    { theme: "听听别人最近在忙什么", summary: "工作和生活都照常，顺便听听身边的人最近怎么样。" },
    { theme: "不赶进度也不放松的一天", summary: "节奏平稳，把该做的事做完。" },
  ],
  restday: [
    { theme: "不赶时间地过一天", summary: "睡够了再起来，不给今天排太多事。" },
    { theme: "把住处和自己都收拾一下", summary: "上午收拾，下午做点自己想做的。" },
    { theme: "留一段时间给朋友", summary: "和朋友待一会儿，不急着做别的。" },
    { theme: "把拖了很久的小事做掉", summary: "挑几件拖着的事做完，剩下的时间随便过。" },
    { theme: "平时顾不上的事今天做一点", summary: "上班时顾不上的事，今天慢慢来。" },
    { theme: "什么都不赶也不完全闲着", summary: "有一点安排，但都可以改。" },
    { theme: "和室友一起把日子过一过", summary: "合租生活里的小事也算一种安排。" },
    { theme: "给自己留一段不用解释的时间", summary: "做点没有理由的事，不用向谁汇报。" },
  ],
};
