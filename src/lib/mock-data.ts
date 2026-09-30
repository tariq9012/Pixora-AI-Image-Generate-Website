import city from "@/assets/gen-city.jpg";
import fashion from "@/assets/gen-fashion.jpg";
import product from "@/assets/gen-product.jpg";
import interior from "@/assets/gen-interior.jpg";
import castle from "@/assets/gen-castle.jpg";
import street from "@/assets/gen-street.jpg";
import portrait from "@/assets/gen-portrait.jpg";
import three from "@/assets/gen-3d.jpg";

export const IMAGES = { city, fashion, product, interior, castle, street, portrait, three };

export type Creation = {
  id: string;
  src: string;
  prompt: string;
  model: string;
  style: string;
  category: string;
  creator: string;
  avatar: string;
  likes: number;
  views: number;
  date: string;
  type: "Generated" | "Edited" | "Upscaled";
  favorite: boolean;
  ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
};

const seeds: Array<Omit<Creation, "id">> = [
  {
    src: city,
    prompt: "Cinematic futuristic city at sunset, volumetric haze, 35mm anamorphic",
    model: "Pixora Pro",
    style: "Cinematic",
    category: "Cinematic",
    creator: "@noorstudio",
    avatar: portrait,
    likes: 2841,
    views: 41200,
    date: "2026-09-02T14:20:00Z",
    type: "Generated",
    favorite: true,
    ratio: "3:4",
  },
  {
    src: fashion,
    prompt: "Luxury fashion campaign, sculptural couture, warm editorial lighting",
    model: "Flux",
    style: "Editorial",
    category: "Fashion",
    creator: "@mariastudio",
    avatar: fashion,
    likes: 5120,
    views: 88300,
    date: "2026-09-01T09:05:00Z",
    type: "Generated",
    favorite: true,
    ratio: "3:4",
  },
  {
    src: product,
    prompt: "Minimal product photography, amber perfume bottle on travertine, soft shadow",
    model: "Pixora Fast",
    style: "Product Photography",
    category: "Products",
    creator: "@studio.kern",
    avatar: three,
    likes: 1904,
    views: 27650,
    date: "2026-08-30T18:42:00Z",
    type: "Upscaled",
    favorite: false,
    ratio: "1:1",
  },
  {
    src: interior,
    prompt: "Modern architectural interior, travertine walls, late afternoon sun",
    model: "SDXL",
    style: "Photorealistic",
    category: "Architecture",
    creator: "@archi.lab",
    avatar: interior,
    likes: 3320,
    views: 51900,
    date: "2026-08-29T11:30:00Z",
    type: "Generated",
    favorite: false,
    ratio: "4:3",
  },
  {
    src: castle,
    prompt: "Fantasy castle in the clouds at dawn, painterly concept art",
    model: "Pixora Pro",
    style: "Illustration",
    category: "Illustration",
    creator: "@yusuf.draws",
    avatar: castle,
    likes: 7420,
    views: 132400,
    date: "2026-08-28T20:11:00Z",
    type: "Generated",
    favorite: true,
    ratio: "3:4",
  },
  {
    src: street,
    prompt: "Cyberpunk street photography, rain reflections, shallow depth of field",
    model: "Flux",
    style: "Cinematic",
    category: "Cinematic",
    creator: "@rainframe",
    avatar: street,
    likes: 6031,
    views: 99120,
    date: "2026-08-27T07:15:00Z",
    type: "Edited",
    favorite: false,
    ratio: "3:4",
  },
  {
    src: portrait,
    prompt: "Studio portrait with hard rim light, dark backdrop, editorial retouch",
    model: "Pixora Pro",
    style: "Photorealistic",
    category: "Portraits",
    creator: "@lensofamir",
    avatar: portrait,
    likes: 4482,
    views: 73400,
    date: "2026-08-26T16:48:00Z",
    type: "Upscaled",
    favorite: true,
    ratio: "3:4",
  },
  {
    src: three,
    prompt: "Abstract 3D liquid metal and amber glass forms, octane render",
    model: "SDXL",
    style: "3D",
    category: "3D",
    creator: "@formfield",
    avatar: three,
    likes: 2210,
    views: 34800,
    date: "2026-08-25T13:02:00Z",
    type: "Generated",
    favorite: false,
    ratio: "1:1",
  },
];

export const CREATIONS: Creation[] = Array.from({ length: 32 }, (_, i) => {
  const base = seeds[i % seeds.length] as Omit<Creation, "id">;
  return {
    ...base,
    id: `cr_${1000 + i}`,
    likes: base.likes - i * 37,
    views: base.views - i * 411,
    favorite: i % 3 === 0 ? base.favorite : false,
  };
});

export const POPULAR_PROMPTS = [
  "Cinematic futuristic city at sunset",
  "Luxury fashion campaign",
  "Minimal product photography",
  "Fantasy castle in the clouds",
  "Cyberpunk street photography",
  "Modern architectural interior",
];

export const MODELS = [
  {
    id: "pixora-fast",
    name: "Pixora Fast",
    desc: "Draft ideas in seconds. Great for exploration.",
    cost: 4,
    speed: "~3s",
    badge: "Fastest",
  },
  {
    id: "pixora-pro",
    name: "Pixora Pro",
    desc: "Our flagship model for photoreal, high-detail work.",
    cost: 8,
    speed: "~11s",
    badge: "Recommended",
  },
  {
    id: "flux",
    name: "Flux",
    desc: "Exceptional prompt adherence and typography.",
    cost: 10,
    speed: "~14s",
    badge: "Precise",
  },
  {
    id: "sdxl",
    name: "SDXL",
    desc: "Open, flexible and reliable for stylised output.",
    cost: 6,
    speed: "~8s",
    badge: "Versatile",
  },
];

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
export const RESOLUTIONS = ["512", "1024", "2048", "4K"] as const;
export const IMAGE_COUNTS = [1, 2, 4] as const;
export const STYLES = [
  "Photorealistic",
  "Cinematic",
  "Anime",
  "3D",
  "Illustration",
  "Editorial",
  "Minimal",
  "Product Photography",
] as const;

export const CATEGORIES = [
  "Portraits",
  "Products",
  "Architecture",
  "Anime",
  "Cinematic",
  "Fashion",
  "3D",
  "Illustration",
];

export const USE_CASES = [
  { title: "Marketing", desc: "Campaign visuals that ship the same afternoon." },
  { title: "Social Media", desc: "On-brand posts and stories at feed pace." },
  { title: "Product Photography", desc: "Studio-grade shots without a studio." },
  { title: "Fashion", desc: "Lookbooks, editorials and campaign concepts." },
  { title: "Architecture", desc: "Interiors and exteriors rendered from a sentence." },
  { title: "YouTube", desc: "Thumbnails that earn the click." },
  { title: "Branding", desc: "Moodboards, identity explorations and key art." },
  { title: "Concept Art", desc: "Worlds, characters and environments, fast." },
];

export const FEATURES = [
  { title: "Text to Image", desc: "Turn a sentence into a finished visual." },
  { title: "Image to Image", desc: "Transform a reference with full control." },
  { title: "AI Editing", desc: "Replace, remove and relight with a prompt." },
  { title: "Image Variations", desc: "Explore four directions from one result." },
  { title: "Background Removal", desc: "Clean cutouts with crisp edges." },
  { title: "Upscaling", desc: "Up to 8× with face and detail enhancement." },
  { title: "AI Expand", desc: "Outpaint beyond the original frame." },
  { title: "Reference Images", desc: "Lock composition, style or identity." },
];

export const PLANS = [
  {
    name: "Free",
    price: 0,
    yearly: 0,
    tagline: "For trying Pixora out.",
    features: ["50 credits", "Standard generation", "Limited resolution", "Public creations"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Creator",
    price: 12,
    yearly: 115,
    tagline: "For independent creators.",
    features: [
      "1,000 credits",
      "HD generation",
      "Image editing",
      "Private generations",
      "Faster processing",
    ],
    cta: "Choose Creator",
    highlight: true,
  },
  {
    name: "Pro",
    price: 29,
    yearly: 278,
    tagline: "For studios shipping daily.",
    features: [
      "3,500 credits",
      "4K output",
      "Advanced models",
      "Priority generation",
      "Commercial usage",
    ],
    cta: "Choose Pro",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: null,
    yearly: null,
    tagline: "For teams and platforms.",
    features: ["Team workspace", "Higher limits", "API access", "Priority support"],
    cta: "Contact Sales",
    highlight: false,
  },
];

export const TESTIMONIALS = [
  {
    quote:
      "We replaced three stock subscriptions and a photoshoot budget. Pixora now sits at the front of every campaign we run.",
    name: "Amara Osei",
    role: "Creative Director, Northwind",
    avatar: fashion,
  },
  {
    quote:
      "The variation workflow is the part I can't work without. Four directions, pick one, refine — that's my whole day now.",
    name: "Dan Whitaker",
    role: "Freelance Art Director",
    avatar: portrait,
  },
  {
    quote:
      "Our product listings went from a two-week shoot cycle to an afternoon. The upscaler holds up in print.",
    name: "Sofia Marchetti",
    role: "Head of Brand, Aurea",
    avatar: three,
  },
];

export const FAQS = [
  {
    q: "Do I own the images I generate?",
    a: "Yes. On Creator and above, everything you generate is yours to use commercially, including client work.",
  },
  {
    q: "How do credits work?",
    a: "Each action costs credits based on model and resolution — a Pixora Pro generation is 8 credits, an upscale is 12. Unused credits roll over for 30 days.",
  },
  {
    q: "Can I keep my generations private?",
    a: "Creations are public on the Free plan. From Creator upward you can mark any generation, project or profile as private.",
  },
  {
    q: "Which models can I use?",
    a: "Pixora Fast, Pixora Pro, Flux and SDXL are all available in the studio. Pro unlocks the advanced tiers and priority queue.",
  },
  {
    q: "Can I use my own reference images?",
    a: "Yes — upload a reference in Image to Image and control how strongly it drives composition, style and identity.",
  },
  {
    q: "Is there an API?",
    a: "API access is included with Enterprise. Talk to us about volume, regions and dedicated capacity.",
  },
];

export const PROJECTS = [
  {
    id: "p1",
    name: "Nike Campaign",
    assets: 12,
    desc: "Autumn running campaign — hero visuals, product shots and social cutdowns.",
    cover: street,
    updated: "2 hours ago",
  },
  {
    id: "p2",
    name: "YouTube Thumbnails",
    assets: 24,
    desc: "Weekly thumbnail set for the channel, high-contrast editorial look.",
    cover: portrait,
    updated: "Yesterday",
  },
  {
    id: "p3",
    name: "Restaurant Branding",
    assets: 18,
    desc: "Identity moodboard, interior renders and menu photography.",
    cover: interior,
    updated: "3 days ago",
  },
  {
    id: "p4",
    name: "Fashion Collection",
    assets: 36,
    desc: "SS27 lookbook concepts and campaign key art exploration.",
    cover: fashion,
    updated: "Last week",
  },
];

export type HistoryItem = {
  id: string;
  src: string;
  prompt: string;
  model: string;
  settings: string;
  date: string;
  credits: number;
  status: "Completed" | "Processing" | "Failed";
};

export const HISTORY: HistoryItem[] = [
  {
    id: "gen_84021",
    src: city,
    prompt: "Cinematic futuristic city at sunset, volumetric haze",
    model: "Pixora Pro",
    settings: "16:9 · 2048 · Cinematic · 4 images",
    date: "Today, 14:20",
    credits: 32,
    status: "Completed",
  },
  {
    id: "gen_84018",
    src: fashion,
    prompt: "Luxury fashion campaign, sculptural couture",
    model: "Flux",
    settings: "3:4 · 1024 · Editorial · 2 images",
    date: "Today, 12:03",
    credits: 20,
    status: "Processing",
  },
  {
    id: "gen_84012",
    src: product,
    prompt: "Amber perfume bottle on travertine, soft shadow",
    model: "Pixora Fast",
    settings: "1:1 · 1024 · Product Photography · 1 image",
    date: "Today, 09:41",
    credits: 4,
    status: "Completed",
  },
  {
    id: "gen_83997",
    src: castle,
    prompt: "Fantasy castle in the clouds, painterly concept art",
    model: "Pixora Pro",
    settings: "3:4 · 4K · Illustration · 4 images",
    date: "Yesterday, 21:15",
    credits: 48,
    status: "Failed",
  },
  {
    id: "gen_83980",
    src: interior,
    prompt: "Modern architectural interior, travertine walls",
    model: "SDXL",
    settings: "4:3 · 2048 · Photorealistic · 2 images",
    date: "Yesterday, 17:52",
    credits: 12,
    status: "Completed",
  },
  {
    id: "gen_83964",
    src: street,
    prompt: "Cyberpunk street photography, rain reflections",
    model: "Flux",
    settings: "3:4 · 1024 · Cinematic · 4 images",
    date: "Sep 2, 11:08",
    credits: 40,
    status: "Completed",
  },
];

export const CREDIT_USAGE = [
  { label: "Generation", detail: "Pixora Pro · 4 images", amount: -8, time: "14:20" },
  { label: "Upscale", detail: "4× with face enhancement", amount: -12, time: "12:44" },
  { label: "Edit", detail: "Replace background", amount: -10, time: "11:02" },
  { label: "Generation", detail: "Pixora Fast · 1 image", amount: -4, time: "09:41" },
  { label: "Monthly refill", detail: "Creator plan", amount: 1000, time: "Sep 1" },
];

/* ---------- Admin mock data ---------- */

export const ADMIN_STATS = [
  { label: "Total Users", value: "48,219", delta: "+6.4%", positive: true },
  { label: "Active Users", value: "12,904", delta: "+3.1%", positive: true },
  { label: "Images Generated", value: "3.42M", delta: "+11.8%", positive: true },
  { label: "Images Today", value: "28,441", delta: "+4.2%", positive: true },
  { label: "Credits Consumed", value: "1.84M", delta: "+9.0%", positive: true },
  { label: "Revenue", value: "$284,120", delta: "+7.6%", positive: true },
  { label: "Failed Generations", value: "1,204", delta: "-2.3%", positive: true },
  { label: "API Usage", value: "612k calls", delta: "+18.4%", positive: true },
];

export const DAILY_GENERATIONS = [
  { day: "Mon", generations: 24100, users: 820 },
  { day: "Tue", generations: 26800, users: 910 },
  { day: "Wed", generations: 25400, users: 870 },
  { day: "Thu", generations: 29900, users: 1040 },
  { day: "Fri", generations: 31200, users: 1180 },
  { day: "Sat", generations: 27600, users: 990 },
  { day: "Sun", generations: 28441, users: 1020 },
];

export const REVENUE_SERIES = [
  { month: "Mar", revenue: 168000 },
  { month: "Apr", revenue: 191400 },
  { month: "May", revenue: 204800 },
  { month: "Jun", revenue: 226300 },
  { month: "Jul", revenue: 248900 },
  { month: "Aug", revenue: 264500 },
  { month: "Sep", revenue: 284120 },
];

export const MODEL_POPULARITY = [
  { name: "Pixora Pro", value: 42 },
  { name: "Pixora Fast", value: 27 },
  { name: "Flux", value: 19 },
  { name: "SDXL", value: 12 },
];

export const STYLE_POPULARITY = [
  { name: "Cinematic", value: 31 },
  { name: "Photorealistic", value: 26 },
  { name: "Product", value: 17 },
  { name: "Illustration", value: 14 },
  { name: "3D", value: 12 },
];

export const ADMIN_USERS = [
  {
    name: "Amara Osei",
    email: "amara@northwind.co",
    plan: "Pro",
    credits: 2840,
    generations: 1204,
    status: "Active",
    joined: "Mar 14, 2026",
  },
  {
    name: "Dan Whitaker",
    email: "dan.whitaker@gmail.com",
    plan: "Creator",
    credits: 620,
    generations: 488,
    status: "Active",
    joined: "Apr 2, 2026",
  },
  {
    name: "Sofia Marchetti",
    email: "sofia@aurea.studio",
    plan: "Pro",
    credits: 3105,
    generations: 2310,
    status: "Active",
    joined: "Jan 9, 2026",
  },
  {
    name: "Yusuf Kara",
    email: "yusuf.draws@proton.me",
    plan: "Free",
    credits: 12,
    generations: 96,
    status: "Suspended",
    joined: "Jul 21, 2026",
  },
  {
    name: "Lena Fischer",
    email: "lena@formfield.io",
    plan: "Enterprise",
    credits: 18400,
    generations: 9820,
    status: "Active",
    joined: "Nov 3, 2025",
  },
  {
    name: "Marcus Bell",
    email: "marcus.bell@rainframe.tv",
    plan: "Creator",
    credits: 410,
    generations: 733,
    status: "Pending",
    joined: "Aug 18, 2026",
  },
];

export const ADMIN_GENERATIONS = [
  {
    id: "gen_84021",
    user: "@noorstudio",
    model: "Pixora Pro",
    prompt: "Cinematic futuristic city at sunset",
    status: "Completed",
    credits: 32,
    created: "2 min ago",
  },
  {
    id: "gen_84020",
    user: "@mariastudio",
    model: "Flux",
    prompt: "Luxury fashion campaign, sculptural couture",
    status: "Processing",
    credits: 20,
    created: "4 min ago",
  },
  {
    id: "gen_84019",
    user: "@studio.kern",
    model: "Pixora Fast",
    prompt: "Amber perfume bottle on travertine",
    status: "Queued",
    credits: 4,
    created: "6 min ago",
  },
  {
    id: "gen_84018",
    user: "@yusuf.draws",
    model: "Pixora Pro",
    prompt: "Fantasy castle in the clouds at dawn",
    status: "Failed",
    credits: 0,
    created: "11 min ago",
  },
  {
    id: "gen_84017",
    user: "@archi.lab",
    model: "SDXL",
    prompt: "Modern architectural interior, travertine",
    status: "Completed",
    credits: 12,
    created: "18 min ago",
  },
];

export const ADMIN_TRANSACTIONS = [
  {
    id: "tx_5521",
    user: "amara@northwind.co",
    type: "Subscription",
    plan: "Pro",
    amount: "$29.00",
    status: "Paid",
    date: "Sep 4, 2026",
  },
  {
    id: "tx_5520",
    user: "dan.whitaker@gmail.com",
    type: "Credit Purchase",
    plan: "2,000 credits",
    amount: "$18.00",
    status: "Paid",
    date: "Sep 4, 2026",
  },
  {
    id: "tx_5519",
    user: "sofia@aurea.studio",
    type: "Subscription",
    plan: "Pro",
    amount: "$29.00",
    status: "Paid",
    date: "Sep 3, 2026",
  },
  {
    id: "tx_5518",
    user: "marcus.bell@rainframe.tv",
    type: "Refund",
    plan: "Creator",
    amount: "-$12.00",
    status: "Refunded",
    date: "Sep 2, 2026",
  },
  {
    id: "tx_5517",
    user: "lena@formfield.io",
    type: "Subscription",
    plan: "Enterprise",
    amount: "$1,400.00",
    status: "Paid",
    date: "Sep 1, 2026",
  },
];

export const MODERATION_ITEMS = {
  images: [
    { id: "rp_311", src: street, reason: "Graphic content", reporter: "@archi.lab", age: "12m" },
    { id: "rp_309", src: portrait, reason: "Likeness misuse", reporter: "@formfield", age: "1h" },
    { id: "rp_305", src: fashion, reason: "Trademark", reporter: "@rainframe", age: "3h" },
  ],
  users: [
    { id: "ru_88", user: "@spamforge", reason: "Bulk spam uploads", reports: 14, age: "20m" },
    { id: "ru_84", user: "@copycat.art", reason: "Impersonation", reports: 6, age: "2h" },
  ],
  prompts: [
    { id: "pv_140", prompt: "[redacted violent prompt]", user: "@anon_9182", age: "35m" },
    { id: "pv_137", prompt: "[redacted celebrity likeness prompt]", user: "@fanedits", age: "4h" },
  ],
  removed: [
    {
      id: "rm_71",
      src: castle,
      reason: "Policy violation",
      by: "@moderator.kim",
      age: "Yesterday",
    },
    { id: "rm_69", src: three, reason: "Duplicate spam", by: "@moderator.raj", age: "2 days ago" },
  ],
};
