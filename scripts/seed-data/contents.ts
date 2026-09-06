import type { CEFR, SpeechPhenomenon } from "@/lib/types";

export interface SeedClip {
  speaker: string;
  text: string;
  phenomena: SpeechPhenomenon[];
}

export interface SeedContent {
  slug: string;
  type: "reading" | "listening";
  title: string;
  topic: string;
  cefr: CEFR;
  difficulty: number; // 1-5
  vocabDensity: number; // 0-1
  grammarComplexity: number; // 1-5
  ieltsRelevance: number; // 1-5
  summaryEn: string;
  minutes: number;
  body: string; // reading text, or listening transcript (lines joined by \n)
  clips?: SeedClip[]; // listening only
}

export const seedContents: SeedContent[] = [
  // ── Reading ───────────────────────────────────────────────────────────────
  {
    slug: "remote-work",
    type: "reading",
    title: "Why Remote Work Is Here to Stay",
    topic: "work",
    cefr: "B2",
    difficulty: 3,
    vocabDensity: 0.55,
    grammarComplexity: 3,
    ieltsRelevance: 4,
    summaryEn:
      "How hybrid work became permanent, why offices no longer define professional life, and what successful remote teams do differently.",
    minutes: 6,
    body: `Five years ago, working from home was a rare privilege. Today, it has turned into a permanent feature of modern professional life. It turns out that most office jobs can be done from anywhere, and both employees and employers have noticed.

Many companies were supposed to call everyone back to the office last year. Instead, several of them ended up adopting hybrid models permanently. Employees pushed back hard, and businesses realised that forcing people to commute five days a week was not worth the cost.

Of course, remote work is not perfect. New staff often struggle to figure out the unwritten rules of a company when they never meet their colleagues in person. Many people say they end up working longer hours at home, because the boundary between work and life gradually disappears.

There are solutions, though. Successful remote teams set clear rules: they agree on core hours, they keep meetings short, and they schedule one day a week in the office to catch up on what cannot be discussed over video calls. Some managers were doubtful at first, but as far as productivity is concerned, the results speak for themselves.

When it comes to the future of work, one thing is clear: the office is no longer a building — it is a choice.`,
  },
  {
    slug: "habit-formation",
    type: "reading",
    title: "The Science of Habit Formation",
    topic: "psychology",
    cefr: "B2",
    difficulty: 3,
    vocabDensity: 0.6,
    grammarComplexity: 3,
    ieltsRelevance: 4,
    summaryEn:
      "Why willpower fails, how the brain builds automatic routines, and the cue–routine–reward model for changing behaviour.",
    minutes: 7,
    body: `Have you ever put off an important task until midnight, even though you had plenty of time earlier in the day? You are not alone. Scientists who study behaviour say that habits, not motivation, decide most of what we do every day.

The brain builds habits to save energy. When you repeat an action in the same situation — making coffee after waking up, checking your phone after hearing a notification — the behaviour gradually moves from conscious decision to automatic routine. That is why willpower alone rarely works: you cannot fight a habit by deciding harder. You have to be aware of the cue that starts it.

Researchers have come up with a simple model: cue, routine, reward. If you want to change a habit, keep the cue and the reward, but replace the routine. Someone who snacks when stressed, for example, can swap chocolate for a short walk. The cue and the reward stay the same; only the behaviour in the middle changes.

There is no denying that changing habits takes time — on average, about two months of repetition. Most people who give up do so because they expect instant results and end up disappointed. The secret is to make the new behaviour so small that it feels almost silly to skip it: read one page, write one sentence, do one push-up. Small wins, repeated daily, slowly become who you are.`,
  },
  {
    slug: "urban-gardens",
    type: "reading",
    title: "Urban Gardens: Growing Food in the City",
    topic: "environment",
    cefr: "B1",
    difficulty: 2,
    vocabDensity: 0.45,
    grammarComplexity: 2,
    ieltsRelevance: 4,
    summaryEn:
      "Empty rooftops and parking lots are becoming community gardens — good for food, heat, wildlife and neighbourhoods.",
    minutes: 5,
    body: `In many large cities, empty rooftops and old parking lots are changing into green spaces. Urban gardening — growing vegetables and fruit in the city — has become surprisingly popular in recent years.

City gardens do more than produce fresh food. They help cut down on the heat that builds up in concrete streets, they give insects and birds a home, and they bring neighbours together. In some neighbourhoods, people who never spoke to each other now share tomatoes and advice every weekend.

Getting started is easier than most people think. You do not need a big garden; a few containers on a balcony are enough to grow herbs, peppers, or even small tomatoes. Beginners often take up too much at first: they plant too many things and then run out of energy before the first harvest. Experienced gardeners say it is worth starting small — one or two pots, one season, one lesson at a time.

For people who grew up in cities, digging in the soil feels strange at first, but most get used to it surprisingly quickly. As one community gardener in Detroit put it: "The city gave me a plot of land, and the land gave me back a community."`,
  },
  {
    slug: "fast-fashion",
    type: "reading",
    title: "The Hidden Cost of Fast Fashion",
    topic: "society",
    cefr: "B2",
    difficulty: 4,
    vocabDensity: 0.65,
    grammarComplexity: 3,
    ieltsRelevance: 5,
    summaryEn:
      "Cheap clothes carry a price that never appears on the tag — water, waste, working conditions — and awareness is only now catching up.",
    minutes: 7,
    body: `A t-shirt for the price of a coffee, a new dress every week: fast fashion has made clothing cheaper than ever before. But there is no denying that this convenience has an impact on the planet and on the people who make our clothes.

The numbers are shocking. The fashion industry now produces over 100 billion garments a year, and the average item is worn only seven to ten times before it is thrown away. Making one cotton shirt takes about 2,700 litres of water — enough drinking water for one person for two and a half years.

Why is it so hard to change? Price plays a role, of course: for many families, cheap clothes are the only realistic option. But psychology matters too. Social media has turned clothing into content, and many young people feel pressure to never appear in the same outfit twice. Companies get away with poor working conditions because supply chains are long and difficult to check.

Consumer awareness is slowly growing. Buying second-hand, repairing instead of replacing, and simply buying less are all becoming normal again. Some governments have started to legislate: France now fines companies that destroy unsold clothing.

Fast fashion is a double-edged sword — it gave everyone access to style, but at a price that does not appear on the tag. As shoppers become more aware of the true cost, the industry will eventually have to change. The question is how soon.`,
  },
  {
    slug: "sleep-memory",
    type: "reading",
    title: "How Sleep Shapes Your Memory",
    topic: "health",
    cefr: "B1",
    difficulty: 2,
    vocabDensity: 0.5,
    grammarComplexity: 2,
    ieltsRelevance: 4,
    summaryEn:
      "The brain saves the day's learning into long-term memory during deep sleep — all-nighters quietly delete your effort.",
    minutes: 5,
    body: `Students often stay up late the night before an exam, believing that one more hour of study will help. Science says the opposite: without sleep, the brain cannot properly store what you have learned.

During deep sleep, the brain replays the day's experiences and moves the important ones from short-term into long-term memory. It is a bit like saving files from a desk full of papers into a well-organised archive. If you cut the night short, you run out of "saving time", and much of your effort is simply lost.

In one famous experiment, students who slept well after practising a new skill performed clearly better the next day than students who stayed awake — even though both groups had spent the same time practising. It turns out that the sleeping brain was still learning.

Many people believe they can catch up on sleep at the weekend, but researchers say this only partly works. A regular rhythm beats weekly repair. You are supposed to feel refreshed in the morning; if you don't, your body is telling you something.

So tonight, if you are choosing between one more episode and one more hour of sleep, remember: memory is built at night. The students who sleep are, quite literally, the ones who keep up.`,
  },
  {
    slug: "sharing-economy",
    type: "reading",
    title: "The Rise of the Sharing Economy",
    topic: "economy",
    cefr: "B2",
    difficulty: 3,
    vocabDensity: 0.6,
    grammarComplexity: 4,
    ieltsRelevance: 5,
    summaryEn:
      "Renting rooms, cars and tools through platforms reshaped cities — efficient for consumers, confusing for regulators.",
    minutes: 6,
    body: `Ten years ago, staying in a stranger's spare room or borrowing a stranger's car sounded risky, even strange. Today, millions of people do it every day without a second thought. The sharing economy — platforms that let people rent out rooms, cars, tools and time — has quietly changed how cities live.

When it comes to travel, the change is obvious. In many tourist cities, more visitors now stay in private apartments than in hotels. This has an impact on neighbourhoods, both good and bad: local shops gain customers, but long-term residents are sometimes pushed out as landlords convert homes into short-term rentals. Cities like Barcelona and Amsterdam have come up with strict rules to limit the damage.

Supporters point out that sharing is efficient. A power drill is used for just thirteen minutes in its entire life; sharing means fewer products, less waste and lower costs. Car-sharing services play a growing role in reducing city traffic, and many families have decided that owning a second car is simply not worth the expense.

Critics, however, argue that "sharing" is often just renting with a friendlier name, and that the real winners are the platforms, not the workers. As far as employment law is concerned, regulators are still catching up with an industry that grew faster than the rules.

One thing is certain: the question is no longer whether we will share, but how to share fairly.`,
  },

  // ── Listening ─────────────────────────────────────────────────────────────
  {
    slug: "weekend-plans",
    type: "listening",
    title: "Two Friends Discussing Weekend Plans",
    topic: "daily life",
    cefr: "B1",
    difficulty: 2,
    vocabDensity: 0.35,
    grammarComplexity: 2,
    ieltsRelevance: 3,
    summaryEn:
      "A casual conversation full of connected speech: gonna, was going to, end up staying home, and a last-minute plan.",
    minutes: 3,
    body: "", // built from clips
    clips: [
      {
        speaker: "Mia",
        text: "Hey Tom, what are you going to do this weekend?",
        phenomena: [
          { type: "reduction", span: "going to", spoken: "gonna", note: "In fast speech 'going to' almost always reduces to 'gonna' before a verb." },
          { type: "linking", span: "what are you", spoken: "wha-dya", note: "'are you' links into the previous word: 'what-are-you' becomes 'whadaya'." },
        ],
      },
      {
        speaker: "Tom",
        text: "I'm not sure. I was going to go camping, but the weather looks bad.",
        phenomena: [
          { type: "reduction", span: "was going to", spoken: "was gonna", note: "Past plan: 'was going to' — listen for 'was gonna'." },
          { type: "weak_form", span: "but the", spoken: "bət-thə", note: "'but' and 'the' are both weak here; the stress falls on 'weather'." },
        ],
      },
      {
        speaker: "Mia",
        text: "Yeah, it's supposed to rain all day Saturday.",
        phenomena: [
          { type: "weak_form", span: "supposed to", spoken: "sə-POUST-tə", note: "Only the second syllable is stressed; 'to' almost disappears." },
        ],
      },
      {
        speaker: "Tom",
        text: "Exactly. So I might just end up staying home and watching movies.",
        phenomena: [
          { type: "linking", span: "end up", spoken: "en-DUP", note: "'end up' is pronounced as one unit with stress on 'up'." },
          { type: "elision", span: "staying home and", spoken: "stayin-home-an", note: "Final 'ng' often becomes 'n' before a consonant; 'and' reduces to 'n'." },
        ],
      },
      {
        speaker: "Mia",
        text: "You know what you should do? Come to the bike market with me on Sunday.",
        phenomena: [
          { type: "reduction", span: "what you should", spoken: "wha-cha", note: "'what you' merges into 'whacha' — extremely common in suggestions." },
        ],
      },
      {
        speaker: "Tom",
        text: "The one in the old factory? I've been meaning to check that out for ages!",
        phenomena: [
          { type: "weak_form", span: "I've been meaning to", spoken: "aiv-bin-MEE-nin-tə", note: "Stress only on 'meaning'; the rest is a fast weak stream." },
          { type: "linking", span: "check that out", spoken: "che-THA-DOWT", note: "The three words link into one: 'checktha-dout'." },
        ],
      },
      {
        speaker: "Mia",
        text: "Perfect. It starts at ten. Do you want to grab breakfast first?",
        phenomena: [
          { type: "reduction", span: "Do you want to", spoken: "D'you wanna", note: "Four weak words in a row reduce to two syllables: 'dya-wanna'." },
        ],
      },
      {
        speaker: "Tom",
        text: "Sure. There's a café near my place that does amazing pancakes.",
        phenomena: [
          { type: "linking", span: "near my", spoken: "near-RY", note: "Linking 'r' connects 'near' to 'my'." },
        ],
      },
      {
        speaker: "Mia",
        text: "Sounds good. Oh — can I bring my cousin? She's visiting from Chengdu.",
        phenomena: [
          { type: "weak_form", span: "can I", spoken: "kə-NAI", note: "Modal 'can' is weak; 'I' carries the stress." },
        ],
      },
      {
        speaker: "Tom",
        text: "Of course! The more, the merrier.",
        phenomena: [
          { type: "linking", span: "the more, the merrier", spoken: "thə-MOR-thə-MERRY-ər", note: "A fixed saying said as one rhythm group — learn it as a whole chunk." },
        ],
      },
    ],
  },
  {
    slug: "wildlife-photographer",
    type: "listening",
    title: "Interview with a Wildlife Photographer",
    topic: "career",
    cefr: "B2",
    difficulty: 3,
    vocabDensity: 0.5,
    grammarComplexity: 3,
    ieltsRelevance: 4,
    summaryEn:
      "How a lawyer ended up photographing snow leopards — on patience, reading animals, and why gear matters less than you think.",
    minutes: 5,
    body: "",
    clips: [
      {
        speaker: "Host",
        text: "My guest today is Lena Ford, a wildlife photographer who has worked in more than forty countries. Lena, welcome.",
        phenomena: [],
      },
      { speaker: "Lena", text: "Thanks. Great to be here.", phenomena: [] },
      {
        speaker: "Host",
        text: "How does someone end up photographing snow leopards in minus thirty degrees?",
        phenomena: [
          { type: "linking", span: "end up", spoken: "en-DUP", note: "'end up' functions like one word meaning 'finally do'." },
        ],
      },
      {
        speaker: "Lena",
        text: "By accident, honestly. I was supposed to be a lawyer. I took a camera on a hiking trip, and I never came back — professionally, I mean.",
        phenomena: [
          { type: "weak_form", span: "was supposed to", spoken: "wəz-sə-POUST-tə", note: "'supposed' keeps its stress on the second syllable; everything else weakens." },
        ],
      },
      {
        speaker: "Host",
        text: "It turns out law's loss was photography's gain.",
        phenomena: [
          { type: "linking", span: "turns out", spoken: "TURN-zowt", note: "'turns out' links: the 's' attaches to 'out'." },
        ],
      },
      {
        speaker: "Lena",
        text: "Ha, that's one way to put it. But I'll be honest: people imagine it's romantic. Most of the time, when it comes to wildlife photography, you're sitting still for eleven hours, freezing, and nothing happens.",
        phenomena: [
          { type: "weak_form", span: "when it comes to", spoken: "wə-nət-KAMZ-tə", note: "The idiom 'when it comes to' is always unstressed except 'comes'." },
        ],
      },
      { speaker: "Host", text: "How do you keep going?", phenomena: [] },
      {
        speaker: "Lena",
        text: "You learn patience. And you learn to read animals. As far as equipment is concerned, honestly, the cheapest modern camera is good enough. What matters is knowing what the animal will do next.",
        phenomena: [
          { type: "weak_form", span: "as far as ... is concerned", spoken: "əz-FAR-əz ... iz-cən-SERND", note: "Only 'far' and 'cerned' are stressed — a long frame with two stresses." },
        ],
      },
      { speaker: "Host", text: "Any advice for beginners?", phenomena: [] },
      {
        speaker: "Lena",
        text: "Don't chase the big dramatic shots. The small moments — a fox listening, birds arguing — those are the ones worth waiting for.",
        phenomena: [
          { type: "elision", span: "worth waiting", spoken: "wor-th-WAY-ting", note: "The 'th' at the end of 'worth' barely stops before 'w'." },
        ],
      },
    ],
  },
  {
    slug: "campus-services",
    type: "listening",
    title: "Campus Tour: Student Services",
    topic: "education",
    cefr: "B1",
    difficulty: 2,
    vocabDensity: 0.4,
    grammarComplexity: 2,
    ieltsRelevance: 5,
    summaryEn:
      "An IELTS Section-2 style monologue: library bookings, the health centre, writing support, and the student job office.",
    minutes: 4,
    body: "",
    clips: [
      {
        speaker: "Guide",
        text: "Good morning, everyone, and welcome to Central University. Before the walking tour begins, let me spend a few minutes on the services you'll use most.",
        phenomena: [
          { type: "weak_form", span: "let me", spoken: "lem-me", note: "'let me' reduces to 'lemme' in natural speech." },
        ],
      },
      {
        speaker: "Guide",
        text: "First, the library. It's open twenty-four hours during exam weeks, and you're supposed to book study rooms online at least a day in advance — walk-ins rarely get a room.",
        phenomena: [
          { type: "weak_form", span: "you're supposed to", spoken: "yer-sə-POUST-tə", note: "'you're supposed to' = rule or expected arrangement." },
        ],
      },
      {
        speaker: "Guide",
        text: "If you feel unwell, the health centre is behind the sports hall. Don't just show up; call first, or you may end up waiting for two hours.",
        phenomena: [
          { type: "linking", span: "end up waiting", spoken: "en-DUP-WAY-ting", note: "Notice 'end up + -ing' — the classic pattern for unexpected results." },
        ],
      },
      {
        speaker: "Guide",
        text: "The writing support centre deserves a special mention. Many international students think it's only for people who struggle with English. It turns out most visitors are native speakers who want help with structure and argument.",
        phenomena: [
          { type: "linking", span: "it turns out", spoken: "it-TURN-zowt", note: "'turns out' always links; hear it as one unit meaning 'apparently'." },
        ],
      },
      {
        speaker: "Guide",
        text: "Finally, the student job office. Jobs on campus fill up fast, so if you're hoping to work at the café or the library, sign up this week. Trust me — you don't want to run out of options in October.",
        phenomena: [
          { type: "elision", span: "run out of", spoken: "rə-NAOW-dəv", note: "'out of' compresses to 'owdəv' — a top listening trap." },
        ],
      },
    ],
  },
  {
    slug: "restaurant-booking",
    type: "listening",
    title: "Booking a Restaurant Over the Phone",
    topic: "daily life",
    cefr: "B2",
    difficulty: 2,
    vocabDensity: 0.35,
    grammarComplexity: 2,
    ieltsRelevance: 3,
    summaryEn:
      "A polite phone call: I was wondering if..., fully booked, see what I can do — the language of requests and negotiation.",
    minutes: 3,
    body: "",
    clips: [
      {
        speaker: "Caller",
        text: "Hi, I was wondering if I could book a table for Saturday night.",
        phenomena: [
          { type: "weak_form", span: "I was wondering if", spoken: "ai-wəz-WƏN-də-ring-if", note: "The polite opener 'I was wondering if' is said quickly — stress only 'wonder'." },
        ],
      },
      { speaker: "Host", text: "Of course. For what time, and how many people?", phenomena: [] },
      { speaker: "Caller", text: "Seven thirty, if possible. There'll be six of us.", phenomena: [] },
      {
        speaker: "Host",
        text: "Let me check... I'm afraid we're fully booked at seven thirty. Would eight o'clock work?",
        phenomena: [
          { type: "linking", span: "fully booked", spoken: "FUL-lee-BOOKT", note: "The -ly ending links into 'booked'; the -ed is a sharp /t/." },
        ],
      },
      {
        speaker: "Caller",
        text: "Eight is fine, actually. It's for a birthday — could we get a table near the window?",
        phenomena: [
          { type: "weak_form", span: "could we", spoken: "kəd-wi", note: "Polite 'could' is always weak; stress 'table' and 'window'." },
        ],
      },
      {
        speaker: "Host",
        text: "I'll see what I can do, but I can't promise anything.",
        phenomena: [
          { type: "reduction", span: "see what I can do", spoken: "SEE-wha-dai-kən-DO", note: "A fixed polite formula — learn the whole rhythm." },
        ],
      },
      {
        speaker: "Caller",
        text: "No problem. Oh, and does the restaurant have any vegetarian options?",
        phenomena: [
          { type: "elision", span: "does the", spoken: "dəz-zə", note: "Question word 'does' + weak 'the' merge together." },
        ],
      },
      { speaker: "Host", text: "Absolutely — we have a full vegetarian menu, and most dishes can be made vegan.", phenomena: [] },
      { speaker: "Caller", text: "Perfect. One more thing: is there parking nearby?", phenomena: [] },
      { speaker: "Host", text: "There's a public garage two doors down. We validate tickets for up to three hours.", phenomena: [] },
      { speaker: "Caller", text: "Great. The name is Chen — C-H-E-N — and my phone number is 555-0192.", phenomena: [] },
      { speaker: "Host", text: "All set, Mr Chen. Table for six, Saturday at eight. See you then.", phenomena: [] },
    ],
  },
];

export function clipsBody(c: SeedContent): string {
  return (c.clips ?? []).map((cl) => `${cl.speaker}: ${cl.text}`).join("\n");
}
