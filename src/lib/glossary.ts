import type { CEFR } from "@/lib/types";

export interface GlossaryEntry {
  pos: string;
  cefr: CEFR;
  meaningEn: string;
  meaningZh: string;
  example: string;
  collocations: string[];
}

/** Corpus glossary — English-first definitions for notable words in the seed
 * library. The Mock provider and the word popover both read from here. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  // remote-work
  privilege: { pos: "noun", cefr: "B2", meaningEn: "a special advantage that not everyone has", meaningZh: "特权；优惠", example: "Working from home was a rare privilege.", collocations: ["a rare privilege", "have the privilege of"] },
  permanent: { pos: "adj", cefr: "B1", meaningEn: "continuing for a long time or forever, not temporary", meaningZh: "永久的；长期的", example: "Hybrid models became permanent.", collocations: ["a permanent feature", "permanent job", "permanent damage"] },
  hybrid: { pos: "adj/noun", cefr: "B2", meaningEn: "a mixture of two things, e.g. home + office work", meaningZh: "混合的（模式）", example: "Several companies adopted hybrid models.", collocations: ["hybrid model", "hybrid car", "a hybrid approach"] },
  commute: { pos: "verb/noun", cefr: "B2", meaningEn: "to travel regularly between home and work", meaningZh: "通勤", example: "Forcing people to commute five days a week was not worth the cost.", collocations: ["commute to work", "a long commute", "daily commute"] },
  boundary: { pos: "noun", cefr: "B2", meaningEn: "a line that marks the limit of something; a dividing line", meaningZh: "边界；界限", example: "The boundary between work and life gradually disappears.", collocations: ["set boundaries", "blur the boundary", "cross the line"] },
  gradually: { pos: "adv", cefr: "B1", meaningEn: "slowly, step by step, over a period of time", meaningZh: "逐渐地", example: "The behaviour gradually moves from decision to routine.", collocations: ["gradually change", "gradually become", "gradually improve"] },
  productivity: { pos: "noun", cefr: "B2", meaningEn: "how much work is produced in a certain time", meaningZh: "生产力；效率", example: "As far as productivity is concerned, the results speak for themselves.", collocations: ["boost productivity", "productivity gains", "labour productivity"] },
  doubtful: { pos: "adj", cefr: "B2", meaningEn: "not sure that something is good or true", meaningZh: "怀疑的；不确定的", example: "Some managers were doubtful at first.", collocations: ["be doubtful about", "highly doubtful"] },
  // habit-formation
  behaviour: { pos: "noun", cefr: "B1", meaningEn: "the way a person or animal acts", meaningZh: "行为", example: "Habits, not motivation, decide most of our behaviour.", collocations: ["human behaviour", "change behaviour", "consumer behaviour"] },
  motivation: { pos: "noun", cefr: "B2", meaningEn: "the feeling of wanting to do something; enthusiasm", meaningZh: "动力；积极性", example: "Habits, not motivation, decide most of what we do.", collocations: ["lack motivation", "intrinsic motivation", "motivation to do sth"] },
  automatic: { pos: "adj", cefr: "B2", meaningEn: "done without thinking; happening by itself", meaningZh: "自动的；无意识的", example: "The behaviour becomes an automatic routine.", collocations: ["an automatic reaction", "automatic routine"] },
  routine: { pos: "noun", cefr: "B1", meaningEn: "a regular, repeated way of doing things", meaningZh: "常规；惯例", example: "It moves from conscious decision to automatic routine.", collocations: ["daily routine", "break the routine", "a regular routine"] },
  willpower: { pos: "noun", cefr: "B2", meaningEn: "the mental strength to control yourself and do difficult things", meaningZh: "意志力", example: "Willpower alone rarely works.", collocations: ["sheer willpower", "run out of willpower"] },
  cue: { pos: "noun", cefr: "C1", meaningEn: "a signal that makes something start (a habit, an action)", meaningZh: "提示；触发信号", example: "You have to be aware of the cue that starts it.", collocations: ["a visual cue", "take your cue from"] },
  swap: { pos: "verb", cefr: "B2", meaningEn: "to replace one thing with another; exchange", meaningZh: "替换；交换", example: "Swap chocolate for a short walk.", collocations: ["swap A for B", "swap seats", "swap jobs"] },
  instant: { pos: "adj", cefr: "B2", meaningEn: "happening immediately, without delay", meaningZh: "立即的", example: "They expect instant results.", collocations: ["instant results", "instant success", "instant noodles"] },
  // urban-gardens
  rooftop: { pos: "noun", cefr: "B1", meaningEn: "the flat top surface of a building", meaningZh: "屋顶", example: "Empty rooftops are changing into green spaces.", collocations: ["rooftop garden", "rooftop bar"] },
  container: { pos: "noun", cefr: "B1", meaningEn: "a box, pot or similar object used to hold something", meaningZh: "容器", example: "A few containers on a balcony are enough.", collocations: ["a plastic container", "container gardening"] },
  balcony: { pos: "noun", cefr: "A2", meaningEn: "a small outside area attached to an apartment, upstairs", meaningZh: "阳台", example: "A few containers on a balcony are enough.", collocations: ["on the balcony", "balcony door"] },
  harvest: { pos: "noun/verb", cefr: "B2", meaningEn: "the act of collecting crops when they are ready", meaningZh: "收获；收成", example: "They run out of energy before the first harvest.", collocations: ["a good harvest", "harvest season", "harvest crops"] },
  plot: { pos: "noun", cefr: "B2", meaningEn: " a small piece of land used for growing things", meaningZh: "小块土地", example: "The city gave me a plot of land.", collocations: ["a plot of land", "an allotment plot"] },
  neighbourhood: { pos: "noun", cefr: "B1", meaningEn: "the area around where you live; a small community area", meaningZh: "街区；社区", example: "In some neighbourhoods, people now share tomatoes every weekend.", collocations: ["a quiet neighbourhood", "in the neighbourhood", "neighbourhood watch"] },
  concrete: { pos: "noun/adj", cefr: "B2", meaningEn: "the hard grey building material; real and definite", meaningZh: "混凝土；具体的", example: "Heat builds up in concrete streets.", collocations: ["concrete streets", "concrete evidence", "in concrete terms"] },
  // fast-fashion
  garment: { pos: "noun", cefr: "C1", meaningEn: "a piece of clothing (formal/industry word)", meaningZh: "衣服（行业用语）", example: "The industry produces over 100 billion garments a year.", collocations: ["garment industry", "a knitted garment"] },
  average: { pos: "adj/noun", cefr: "B1", meaningEn: "the usual level; typical, not special", meaningZh: "平均的；普通的", example: "The average item is worn only seven to ten times.", collocations: ["on average", "the average person", "above average"] },
  outfit: { pos: "noun", cefr: "B1", meaningEn: "a set of clothes worn together", meaningZh: "一套衣服", example: "Young people never appear in the same outfit twice.", collocations: ["wear an outfit", "a new outfit", "put together an outfit"] },
  supply: { pos: "noun/verb", cefr: "B2", meaningEn: "providing goods; the amount available", meaningZh: "供应", example: "Supply chains are long and difficult to check.", collocations: ["supply chain", "supply and demand", "supply goods to"] },
  awareness: { pos: "noun", cefr: "B2", meaningEn: "knowing that something exists and matters", meaningZh: "意识；认识", example: "Consumer awareness is slowly growing.", collocations: ["raise awareness", "public awareness", "be aware of"] },
  legislate: { pos: "verb", cefr: "C1", meaningEn: "to make a law about something", meaningZh: "立法", example: "Some governments have started to legislate.", collocations: ["legislate against", "legislate for sth"] },
  fine: { pos: "verb", cefr: "B2", meaningEn: "to make someone pay money as a punishment", meaningZh: "处以罚款", example: "France now fines companies that destroy unsold clothing.", collocations: ["fine sb for sth", "be fined heavily"] },
  secondhand: { pos: "adj", cefr: "B2", meaningEn: "not new; owned by someone before", meaningZh: "二手的", example: "Buying second-hand is becoming normal again.", collocations: ["second-hand shop", "second-hand smoke"] },
  // sleep-memory
  exam: { pos: "noun", cefr: "A2", meaningEn: "a formal test of knowledge", meaningZh: "考试", example: "Students stay up late the night before an exam.", collocations: ["take an exam", "pass an exam", "exam nerves"] },
  replay: { pos: "verb", cefr: "B2", meaningEn: "to play or run through something again", meaningZh: "重放；回放", example: "During deep sleep, the brain replays the day's experiences.", collocations: ["replay a memory", "replay the match"] },
  archive: { pos: "noun", cefr: "C1", meaningEn: "a place where records or information are stored", meaningZh: "档案库", example: "Saving files into a well-organised archive.", collocations: ["a national archive", "archive footage"] },
  rhythm: { pos: "noun", cefr: "B2", meaningEn: "a regular pattern of events or beats", meaningZh: "节奏；规律", example: "A regular rhythm beats weekly repair.", collocations: ["circadian rhythm", "a steady rhythm"] },
  refreshed: { pos: "adj", cefr: "B2", meaningEn: "feeling energetic again after rest", meaningZh: "精神恢复的；清爽的", example: "You are supposed to feel refreshed in the morning.", collocations: ["feel refreshed", "refreshed and rested"] },
  literally: { pos: "adv", cefr: "B2", meaningEn: "exactly true, without exaggeration", meaningZh: "字面上地；真正地", example: "The students who sleep are, quite literally, the ones who keep up.", collocations: ["quite literally", "literally impossible"] },
  // sharing-economy
  platform: { pos: "noun", cefr: "B2", meaningEn: "a digital service that connects two groups (e.g. riders & drivers)", meaningZh: "平台", example: "Platforms let people rent out rooms and cars.", collocations: ["a digital platform", "platform economy"] },
  rental: { pos: "noun", cefr: "B2", meaningEn: "the act of renting; something that is rented", meaningZh: "租赁；出租物", example: "Landlords convert homes into short-term rentals.", collocations: ["short-term rental", "rental income", "car rental"] },
  landlord: { pos: "noun", cefr: "B2", meaningEn: "a person who owns a house and rents it to others", meaningZh: "房东", example: "Landlords convert homes into short-term rentals.", collocations: ["a private landlord", "landlord and tenant"] },
  resident: { pos: "noun", cefr: "B2", meaningEn: "a person who lives in a place", meaningZh: "居民", example: "Long-term residents are sometimes pushed out.", collocations: ["local residents", "a permanent resident"] },
  efficient: { pos: "adj", cefr: "B2", meaningEn: "working well without wasting time, money or energy", meaningZh: "高效的", example: "Supporters point out that sharing is efficient.", collocations: ["energy-efficient", "highly efficient", "efficient use of"] },
  expense: { pos: "noun", cefr: "B2", meaningEn: "money that you spend; cost", meaningZh: "费用；开销", example: "Owning a second car is simply not worth the expense.", collocations: ["at the expense of", "living expenses", "spare no expense"] },
  critic: { pos: "noun", cefr: "B2", meaningEn: "a person who disagrees with or attacks an idea", meaningZh: "批评者", example: "Critics argue that 'sharing' is just renting.", collocations: ["critics argue that", "a fierce critic of"] },
  regulator: { pos: "noun", cefr: "C1", meaningEn: "an official body that controls an industry by rules", meaningZh: "监管机构", example: "Regulators are still catching up with the industry.", collocations: ["a financial regulator", "the regulator said"] },
  // listening corpora
  camping: { pos: "noun", cefr: "A2", meaningEn: "staying in a tent for a holiday", meaningZh: "露营", example: "I was going to go camping.", collocations: ["go camping", "a camping trip"] },
  factory: { pos: "noun", cefr: "A2", meaningEn: "a building where goods are made", meaningZh: "工厂", example: "The one in the old factory?", collocations: ["a factory worker", "factory floor"] },
  pancake: { pos: "noun", cefr: "A2", meaningEn: "a thin flat cake made from batter", meaningZh: "煎饼", example: "A café that does amazing pancakes.", collocations: ["a stack of pancakes"] },
  cousin: { pos: "noun", cefr: "A2", meaningEn: "a child of your uncle or aunt", meaningZh: "堂/表兄弟姐妹", example: "Can I bring my cousin?", collocations: ["a distant cousin", "first cousin"] },
  leopard: { pos: "noun", cefr: "B2", meaningEn: "a large wild cat with spots", meaningZh: "豹", example: "Photographing snow leopards in minus thirty degrees.", collocations: ["a snow leopard"] },
  patience: { pos: "noun", cefr: "B1", meaningEn: "the ability to wait calmly without getting angry", meaningZh: "耐心", example: "You learn patience.", collocations: ["have patience", "run out of patience", "test sb's patience"] },
  equipment: { pos: "noun", cefr: "B1", meaningEn: "the tools or machines needed for an activity (uncountable)", meaningZh: "设备（不可数）", example: "As far as equipment is concerned, the cheapest camera is good enough.", collocations: ["a piece of equipment", "sports equipment"] },
  beginner: { pos: "noun", cefr: "A2", meaningEn: "a person who is new to an activity", meaningZh: "初学者", example: "Any advice for beginners?", collocations: ["a complete beginner", "beginner's luck"] },
  vegetarian: { pos: "adj/noun", cefr: "B1", meaningEn: "(food) without meat; a person who doesn't eat meat", meaningZh: "素食的；素食者", example: "Does the restaurant have vegetarian options?", collocations: ["a vegetarian option", "a vegetarian menu", "go vegetarian"] },
  vegan: { pos: "adj/noun", cefr: "B1", meaningEn: "using or eating no animal products at all", meaningZh: "纯素的；纯素者", example: "Most dishes can be made vegan.", collocations: ["go vegan", "vegan products"] },
  validate: { pos: "verb", cefr: "C1", meaningEn: "to officially confirm something (e.g. a parking ticket)", meaningZh: "使有效；验证", example: "We validate tickets for up to three hours.", collocations: ["validate a ticket", "validate data"] },
  // convince network (lexical network demo)
  convince: { pos: "verb", cefr: "B2", meaningEn: "to make someone believe that something is true", meaningZh: "使信服（改变想法）", example: "She convinced me that the plan would work.", collocations: ["convince sb of sth", "convince sb that...", "be convinced of"] },
  persuade: { pos: "verb", cefr: "B2", meaningEn: "to make someone agree to DO something by giving reasons", meaningZh: "说服（去做某事）", example: "He persuaded me to join the club.", collocations: ["persuade sb to do sth", "persuade sb into doing"] },
  convincing: { pos: "adj", cefr: "B2", meaningEn: "making you believe it is true (of arguments, performances)", meaningZh: "有说服力的", example: "That's a convincing argument.", collocations: ["a convincing argument", "a convincing performance"] },
  convinced: { pos: "adj", cefr: "B2", meaningEn: "certain that something is true", meaningZh: "确信的", example: "I'm convinced she's right.", collocations: ["be convinced that...", "half convinced"] },
  persuasion: { pos: "noun", cefr: "C1", meaningEn: "the act of making someone do something by giving reasons", meaningZh: "说服（名词）", example: "After a lot of persuasion, he agreed.", collocations: ["power of persuasion", "gentle persuasion"] },
  impact: { pos: "noun/verb", cefr: "B2", meaningEn: "a strong effect on someone or something", meaningZh: "影响；冲击", example: "Social media has a huge impact on teenagers.", collocations: ["have an impact on", "a positive impact", "impact on the environment"] },
  influence: { pos: "noun/verb", cefr: "B2", meaningEn: "the power to change how someone thinks or behaves", meaningZh: "影响（力）", example: "Parents have a big influence on children's habits.", collocations: ["have an influence on", "under the influence of", "a bad influence"] },
  effect: { pos: "noun", cefr: "B1", meaningEn: "a change that is caused by something", meaningZh: "效果；影响", example: "The new law had little effect.", collocations: ["have an effect on", "side effects", "in effect"] },
};

export function lookupGlossary(word: string): { key: string; entry: GlossaryEntry } | null {
  const lower = word.toLowerCase().replace(/[^a-z'-]/g, "");
  if (!lower) return null;
  if (GLOSSARY[lower]) return { key: lower, entry: GLOSSARY[lower] };
  // simple morphology: try stripping common endings
  const tries: string[] = [];
  if (lower.endsWith("s")) tries.push(lower.slice(0, -1));
  if (lower.endsWith("es")) tries.push(lower.slice(0, -2));
  if (lower.endsWith("ing")) {
    tries.push(lower.slice(0, -3), lower.slice(0, -3) + "e");
  }
  if (lower.endsWith("ed")) {
    tries.push(lower.slice(0, -2), lower.slice(0, -1));
  }
  if (lower.endsWith("ly")) tries.push(lower.slice(0, -2));
  if (lower.endsWith("ies")) tries.push(lower.slice(0, -3) + "y");
  for (const t of tries) {
    if (GLOSSARY[t]) return { key: t, entry: GLOSSARY[t] };
  }
  return null;
}
