/** Corpus vocabulary entries for the Lexical Network demo (userId = null in DB),
 * plus relation edges. Chunk relations are keyed by chunk text and resolved to
 * ids at seed time. */

export interface SeedCorpusWord {
  headword: string;
  pos: string;
  cefr: "B1" | "B2" | "C1";
  meaningEn: string;
  meaningZh: string;
  exampleEn: string;
  collocations: string[];
}

export const corpusWords: SeedCorpusWord[] = [
  { headword: "convince", pos: "verb", cefr: "B2", meaningEn: "to make someone BELIEVE something is true", meaningZh: "使信服（改变想法）", exampleEn: "She convinced me that the plan would work.", collocations: ["convince someone that ...", "convince someone of something", "fully convince"] },
  { headword: "persuade", pos: "verb", cefr: "B2", meaningEn: "to make someone AGREE TO DO something", meaningZh: "说服（去做某事）", exampleEn: "He persuaded me to join the club.", collocations: ["persuade someone to do something", "persuade someone into doing"] },
  { headword: "convincing", pos: "adjective", cefr: "B2", meaningEn: "making you believe it is true", meaningZh: "有说服力的", exampleEn: "That's a convincing argument.", collocations: ["a convincing argument", "a convincing performance"] },
  { headword: "convinced", pos: "adjective", cefr: "B2", meaningEn: "certain that something is true", meaningZh: "确信的", exampleEn: "I'm convinced she's right.", collocations: ["be convinced that ...", "be convinced of something"] },
  { headword: "persuasion", pos: "noun", cefr: "C1", meaningEn: "the act of making someone do something by giving reasons", meaningZh: "说服（名词）", exampleEn: "After a lot of persuasion, he agreed.", collocations: ["power of persuasion", "gentle persuasion"] },
  { headword: "impact", pos: "noun", cefr: "B2", meaningEn: "a strong, often noticeable effect", meaningZh: "影响；冲击", exampleEn: "Social media has a huge impact on teenagers.", collocations: ["have an impact on", "a significant impact", "environmental impact"] },
  { headword: "influence", pos: "noun", cefr: "B2", meaningEn: "the power to change how someone thinks or acts (often gradual)", meaningZh: "影响（力）", exampleEn: "Parents have a big influence on children's habits.", collocations: ["have an influence on", "under the influence of", "a bad influence"] },
  { headword: "effect", pos: "noun", cefr: "B1", meaningEn: "a change caused by something (result)", meaningZh: "效果；结果", exampleEn: "The new law had little effect.", collocations: ["have an effect on", "side effects", "cause and effect"] },
];

export interface SeedWordRelation {
  from: string; // headword
  to: string; // headword
  relation: "synonym" | "contrast" | "derivative" | "collocation" | "related";
  note: string;
}

export const wordRelations: SeedWordRelation[] = [
  { from: "convince", to: "persuade", relation: "contrast", note: "convince = change BELIEF (mind); persuade = change BEHAVIOUR (get someone to act). You convince someone that, you persuade someone to." },
  { from: "convince", to: "convinced", relation: "derivative", note: "passive feeling: 'I'm convinced' = I believe it firmly." },
  { from: "convince", to: "convincing", relation: "derivative", note: "active quality: 'a convincing argument' makes others believe." },
  { from: "persuade", to: "persuasion", relation: "derivative", note: "the noun of the action: 'the power of persuasion'." },
  { from: "impact", to: "influence", relation: "contrast", note: "impact = strong, immediate effect; influence = gradual, often invisible shaping." },
  { from: "impact", to: "effect", relation: "related", note: "effect is the neutral word for a result; impact emphasises force and size." },
  { from: "influence", to: "effect", relation: "related", note: "influence comes from people/culture; effect comes from actions/events." },
];

export interface SeedChunkRelation {
  from: string; // chunk text
  to: string; // chunk text
  relation: "synonym" | "contrast" | "related";
  note: string;
}

export const chunkRelations: SeedChunkRelation[] = [
  { from: "end up doing", to: "I was going to", relation: "contrast", note: "'I was going to' announces a plan that failed; 'end up doing' reports the unplanned result. They often appear in the same sentence: I was going to go out, but I ended up staying home." },
  { from: "end up doing", to: "it turns out (that)", relation: "contrast", note: "'end up' = final unexpected result of a process; 'it turns out' = a fact you discovered later." },
  { from: "be supposed to", to: "I was going to", relation: "contrast", note: "'be supposed to' = expectation/rule from outside; 'I was going to' = my own intention." },
  { from: "put off doing", to: "I've been meaning to", relation: "related", note: "Both describe the gap between intention and action: you've been meaning to do it, but you keep putting it off." },
  { from: "when it comes to", to: "as far as ... is concerned", relation: "synonym", note: "Both narrow the topic, but 'when it comes to' is more conversational; 'as far as ... is concerned' is more formal/exam-style." },
  { from: "have an impact on", to: "play a role in", relation: "contrast", note: "'have an impact on' = a strong effect ON something; 'play a role in' = be one contributing factor AMONG several." },
  { from: "cut down on", to: "run out of", relation: "related", note: "Both describe quantity over time: you cut down on what you still have, after you run out you have none left." },
  { from: "I was wondering if", to: "I've been meaning to", relation: "related", note: "'I was wondering if' opens a polite request; 'I've been meaning to' explains a delayed intention — great combined: I've been meaning to ask — I was wondering if you could help." },
];
