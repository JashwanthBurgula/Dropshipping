import type { TaxSlab } from "@/lib/validation/product";

export interface SeedSupplierItem {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  pinCode: string;
  leadTimeDays: number;
  notes: string;
}

export interface SeedProductImageItem {
  url: string;
  altText: string;
  aspectRatio: "1:1" | "4:5";
  sortOrder: number;
}

export interface SeedProductItem {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  tags: string[];
  material: string;
  dimensions: string;
  careInstructions: string;
  pricePaise: number;
  compareAtPaise?: number;
  taxSlab: TaxSlab;
  hsnCode: string;
  supplierId: string;
  supplierSku: string;
  supplierProductUrl: string;
  supplierStock: number;
  reservedStock: number;
  bufferStock: number;
  dispatchTimeDays: number;
  /** Offset in hours relative to seed execution time (negative = hours ago) */
  stockConfirmedHoursAgo: number;
  isActive: boolean;
  images: SeedProductImageItem[];
}

export const SEED_SUPPLIERS: SeedSupplierItem[] = [
  {
    id: "sup-bhadravati-kiln",
    name: "Bhadravati Stoneware Collective",
    contactName: "Raghavendra Rao",
    email: "dispatch@bhadravatikiln.example.in",
    phone: "9845011201",
    city: "Shivamogga",
    state: "Karnataka",
    pinCode: "577301",
    leadTimeDays: 2,
    notes: "High-fired reduction stoneware workshop operating wood and gas kilns.",
  },
  {
    id: "sup-bagalkot-looms",
    name: "Ilkal & Guledgudda Handloom Guild",
    contactName: "Shantabai Deshpande",
    email: "orders@bagalkotlooms.example.in",
    phone: "9845011202",
    city: "Bagalkot",
    state: "Karnataka",
    pinCode: "587101",
    leadTimeDays: 2,
    notes: "Unbleached kala cotton and linen weavers using vat-dyed yarns.",
  },
  {
    id: "sup-moradabad-foundry",
    name: "Peetal Nagri Sand-Cast Foundry",
    contactName: "Farhan Siddiqui",
    email: "foundry@peetalnagri.example.in",
    phone: "9811022301",
    city: "Moradabad",
    state: "Uttar Pradesh",
    pinCode: "244001",
    leadTimeDays: 3,
    notes: "Heavy gauge sand-cast brass and bell metal architectural hardware and vessels.",
  },
  {
    id: "sup-firozabad-glassworks",
    name: "Firozabad Borosilicate & Mouth-Blown Studio",
    contactName: "Vikramaditya Sharma",
    email: "studio@firozabadglass.example.in",
    phone: "9811022302",
    city: "Firozabad",
    state: "Uttar Pradesh",
    pinCode: "283203",
    leadTimeDays: 3,
    notes: "Annealed mouth-blown glass shades, carafes, and brass-collared pendants.",
  },
];

export const SEED_PRODUCTS: SeedProductItem[] = [
  // --- CATEGORY 1: Tableware & Ceramics (6 products) ---
  {
    slug: "ash-glaze-stoneware-dinner-plate",
    name: "Ash-Glaze Stoneware Dinner Plate (27 cm)",
    shortDescription:
      "Wheel-thrown stoneware dinner plate with wood-ash feldspar glaze and unglazed foot ring.",
    description:
      "Thrown from iron-rich Karnataka stoneware clay and fired to 1280 degrees Celsius in a reduction atmosphere. The rim carries a subtle lip to hold broths and gravies, while the raw foot ring is wet-sanded so it will not scratch timber tables.",
    category: "Tableware & Ceramics",
    tags: ["stoneware", "dinnerware", "wheel-thrown", "dishwasher-safe"],
    material: "High-fired iron stoneware with natural wood-ash glaze (lead-free)",
    dimensions: "Diameter 27 cm, Rim height 2.6 cm, Weight 740 g",
    careInstructions:
      "Dishwasher and microwave safe. Avoid direct stovetop flame or sudden thermal shock from freezer to oven.",
    pricePaise: 145000,
    compareAtPaise: 165000,
    taxSlab: "GST_12",
    hsnCode: "69120010",
    supplierId: "sup-bhadravati-kiln",
    supplierSku: "BKC-PL-27-ASH",
    supplierProductUrl: "https://bhadravatikiln.example.in/catalog/bkc-pl-27-ash",
    supplierStock: 28,
    reservedStock: 2,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 4,
    isActive: true,
    images: [
      {
        url: "/api/uploads/4ed4af06-ec79-440f-9e15-f18d13266595.jpg",
        altText: "Ash-Glaze Stoneware Dinner Plate top profile",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
      {
        url: "/api/uploads/b3176727-4f47-4783-8a3e-4a890c39f144.jpg",
        altText: "Ash-Glaze Stoneware Dinner Plate foot ring detail",
        aspectRatio: "1:1",
        sortOrder: 1,
      },
    ],
  },
  {
    slug: "tenmoku-iron-katori-bowl-set",
    name: "Tenmoku Iron-Glaze Katori Bowl Set (Set of 4)",
    shortDescription:
      "Four deep stoneware katori bowls finished in oil-spot iron tenmoku glaze for dals and chutneys.",
    description:
      "Proportioned for Indian thali service, each 180 ml katori is hand-thrown with thick walls that retain heat at the table. The iron-saturated glaze breaks warm rust brown along the rim.",
    category: "Tableware & Ceramics",
    tags: ["stoneware", "bowls", "katori", "set"],
    material: "Reduction-fired stoneware with iron oxide glaze",
    dimensions: "Diameter 10.5 cm, Height 5.2 cm, Capacity 180 ml per bowl",
    careInstructions: "Dishwasher and microwave safe. Stack with felt spacers if stored on mobile shelves.",
    pricePaise: 220000,
    taxSlab: "GST_12",
    hsnCode: "69120010",
    supplierId: "sup-bhadravati-kiln",
    supplierSku: "BKC-KT-04-TEN",
    supplierProductUrl: "https://bhadravatikiln.example.in/catalog/bkc-kt-04-ten",
    supplierStock: 18,
    reservedStock: 1,
    bufferStock: 2,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 6,
    isActive: true,
    images: [
      {
        url: "/api/uploads/5b4dff5f-0dfa-4ae0-b307-e47ba43859d0.jpg",
        altText: "Set of four Tenmoku Iron-Glaze Katori Bowls",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
      {
        url: "/api/uploads/8ae1de51-2d55-4827-ad59-2b8a7a6105a3.jpg",
        altText: "Tenmoku glaze rim detail",
        aspectRatio: "1:1",
        sortOrder: 1,
      },
    ],
  },
  {
    slug: "shino-filter-coffee-tumbler-dabarah",
    name: "Raw Clay & White Shino Filter Coffee Dabarah Pair",
    shortDescription:
      "Stoneware tumbler and cooling saucer inspired by South Indian filter coffee vessels.",
    description:
      "Reinterprets the classic dabarah and tumbler in dense stoneware so the outer wall remains comfortable to hold while pulling a long pour to aerate decoction coffee.",
    category: "Tableware & Ceramics",
    tags: ["coffee", "stoneware", "tumbler", "shino"],
    material: "Stoneware with crawl-free white shino liner glaze",
    dimensions: "Tumbler: 7.5 cm H x 7 cm Dia (160 ml). Dabarah: 4.2 cm H x 9.5 cm Dia",
    careInstructions: "Hand wash or top-rack dishwasher safe.",
    pricePaise: 118000,
    taxSlab: "GST_12",
    hsnCode: "69120020",
    supplierId: "sup-bhadravati-kiln",
    supplierSku: "BKC-CF-02-SHI",
    supplierProductUrl: "https://bhadravatikiln.example.in/catalog/bkc-cf-02-shi",
    supplierStock: 9,
    reservedStock: 2,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 12,
    isActive: true,
    images: [
      {
        url: "/api/uploads/ea97d819-8a84-4d23-8f69-ce6a26452613.jpg",
        altText: "White Shino Filter Coffee Tumbler and Dabarah",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "fluted-terracotta-water-carafe",
    name: "Unburnished Fluted Terracotta Water Carafe (1.2 L)",
    shortDescription:
      "Naturally porous low-fired red clay carafe with fitted stoneware stopper for evaporative cooling.",
    description:
      "Turned on a potter's wheel from alluvial tank clay and fired to 980 degrees Celsius so micropores remain open, cooling drinking water by 3 to 4 degrees below room temperature.",
    category: "Tableware & Ceramics",
    tags: ["terracotta", "carafe", "water-vessel", "cooling"],
    material: "Unglazed alluvial terracotta with glazed stoneware lid",
    dimensions: "Height 24.5 cm, Base diameter 11.5 cm, Capacity 1.2 Litres",
    careInstructions:
      "Rinse with warm water and baking soda using a soft brush. Do not use scented dish soap on unglazed terracotta.",
    pricePaise: 135000,
    taxSlab: "GST_5",
    hsnCode: "69120040",
    supplierId: "sup-bhadravati-kiln",
    supplierSku: "BKC-TC-12-CRF",
    supplierProductUrl: "https://bhadravatikiln.example.in/catalog/bkc-tc-12-crf",
    supplierStock: 22,
    reservedStock: 0,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 96, // Stale (>72h) -> triggers "Limited stock"
    isActive: true,
    images: [
      {
        url: "/api/uploads/5bc9cea5-582f-4851-a544-0683f10b987f.jpg",
        altText: "Fluted Terracotta Water Carafe with stoneware stopper",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "speckled-granite-serving-platter",
    name: "Speckled Granite Oval Serving Platter (36 cm)",
    shortDescription:
      "Generous slab-built stoneware oval platter with manganese speckles for shared flatbreads and roasts.",
    description:
      "Hand-pressed over a plaster mould from grogged stoneware clay that resists warping across wide spans. Finished in a satin matte dolomite glaze that does not glare under dining lights.",
    category: "Tableware & Ceramics",
    tags: ["platter", "serving", "stoneware", "slab-built"],
    material: "Grogged stoneware with satin dolomite glaze",
    dimensions: "Length 36 cm, Width 23.5 cm, Rim height 2.8 cm, Weight 1.35 kg",
    careInstructions: "Oven safe up to 220 degrees Celsius (preheat gradually). Dishwasher safe.",
    pricePaise: 265000,
    taxSlab: "GST_12",
    hsnCode: "69120010",
    supplierId: "sup-bhadravati-kiln",
    supplierSku: "BKC-PL-36-GRN",
    supplierProductUrl: "https://bhadravatikiln.example.in/catalog/bkc-pl-36-grn",
    supplierStock: 14,
    reservedStock: 1,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 8,
    isActive: true,
    images: [
      {
        url: "/api/uploads/38245478-ede8-48e8-9423-30a692337574.jpg",
        altText: "Speckled Granite Oval Serving Platter",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "celadon-ribbed-tea-caddy",
    name: "Celadon Ribbed Stoneware Tea Caddy (250 g)",
    shortDescription:
      "Airtight stoneware canister with cork-lined lid for loose-leaf Assam or Nilgiri tea.",
    description:
      "Chatoyant green celadon glaze pools inside vertical lathe-cut flutes. A dense natural cork collar seals against humidity during monsoon months.",
    category: "Tableware & Ceramics",
    tags: ["tea", "storage", "celadon", "stoneware"],
    material: "Stoneware body, reduction celadon glaze, high-density natural cork seal",
    dimensions: "Height 14 cm, Diameter 10.8 cm, Holds 200 to 250 g loose leaf tea",
    careInstructions: "Wipe cork lid with a damp cloth; ceramic body is dishwasher safe.",
    pricePaise: 158000,
    taxSlab: "GST_12",
    hsnCode: "69120010",
    supplierId: "sup-bhadravati-kiln",
    supplierSku: "BKC-TC-25-CEL",
    supplierProductUrl: "https://bhadravatikiln.example.in/catalog/bkc-tc-25-cel",
    supplierStock: 4,
    reservedStock: 1,
    bufferStock: 3, // displayedStock = 0 -> Out of stock
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 3,
    isActive: true,
    images: [
      {
        url: "/api/uploads/fa52a74a-ab05-4fc9-847f-2a3b5bc08909.jpg",
        altText: "Celadon Ribbed Stoneware Tea Caddy",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },

  // --- CATEGORY 2: Linen & Textiles (6 products) ---
  {
    slug: "kala-cotton-handloom-table-runner",
    name: "Unbleached Kala Cotton Handloom Table Runner (240 cm)",
    shortDescription:
      "Heavyweight pit-loom woven rain-fed cotton runner with madder-red extra-weft border.",
    description:
      "Woven on traditional pit looms in northern Karnataka using indigenous short-staple kala cotton. The fabric softens with every wash while maintaining a crisp architectural drape along six-to-eight-seater dining tables.",
    category: "Linen & Textiles",
    tags: ["handloom", "kala-cotton", "table-runner", "natural-dye"],
    material: "100% rain-fed unbleached Kala Cotton (280 GSM)",
    dimensions: "Length 240 cm, Width 42 cm (excluding 4 cm hand-twisted fringes)",
    careInstructions: "Machine wash cold on gentle cycle with mild detergent. Dry in shade.",
    pricePaise: 189000,
    taxSlab: "GST_5",
    hsnCode: "63025100",
    supplierId: "sup-bagalkot-looms",
    supplierSku: "BLG-TR-240-KAL",
    supplierProductUrl: "https://bagalkotlooms.example.in/items/blg-tr-240-kal",
    supplierStock: 32,
    reservedStock: 2,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 5,
    isActive: true,
    images: [
      {
        url: "/api/uploads/e9119a6c-e4fb-434d-b924-819b1f61a78e.jpg",
        altText: "Unbleached Kala Cotton Handloom Table Runner",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "indigo-mitre-corner-linen-napkins",
    name: "Natural Indigo Mitre-Corner Linen Napkins (Set of 6)",
    shortDescription:
      "Generous 45 cm square flax-cotton blend dinner napkins with wide tailored mitred hems.",
    description:
      "Vat-dyed in natural plant indigo and stone-washed so they will not crock onto light clothing. Finished with 2.5 cm double-turned mitred corners stitched at 12 stitches per inch.",
    category: "Linen & Textiles",
    tags: ["napkins", "linen", "indigo", "dining"],
    material: "55% European flax linen, 45% long-staple Indian cotton",
    dimensions: "45 cm x 45 cm each (Set of 6 napkins)",
    careInstructions: "Gentle wash at 30 degrees Celsius. Steam iron while slightly damp.",
    pricePaise: 215000,
    taxSlab: "GST_5",
    hsnCode: "63025200",
    supplierId: "sup-bagalkot-looms",
    supplierSku: "BLG-NP-06-IND",
    supplierProductUrl: "https://bagalkotlooms.example.in/items/blg-np-06-ind",
    supplierStock: 25,
    reservedStock: 1,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 7,
    isActive: true,
    images: [
      {
        url: "/api/uploads/1210f14e-a0d0-4f3a-993b-9805766aeaca.jpg",
        altText: "Set of six Natural Indigo Mitre-Corner Linen Napkins",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "guledgudda-khana-cushion-cover-pair",
    name: "Guledgudda Khana Geometric Cushion Cover Pair (45 x 45 cm)",
    shortDescription:
      "Extra-warp geometric weave cushion covers backed with heavy unbleached canvas and concealed brass zips.",
    description:
      "Woven by master weavers in Guledgudda, featuring micro-stepped diamond motifs in terracotta and charcoal yarn against an oatmeal ground.",
    category: "Linen & Textiles",
    tags: ["cushion", "khana-weave", "handloom", "living"],
    material: "Front: Cotton-silk Khana handloom; Back: 320 GSM duck cotton canvas",
    dimensions: "45 cm x 45 cm (Set of 2 covers; inserts sold separately)",
    careInstructions: "Dry clean or cold hand wash separately. Do not wring.",
    pricePaise: 175000,
    taxSlab: "GST_5",
    hsnCode: "63049239",
    supplierId: "sup-bagalkot-looms",
    supplierSku: "BLG-CC-45-KHA",
    supplierProductUrl: "https://bagalkotlooms.example.in/items/blg-cc-45-kha",
    supplierStock: 19,
    reservedStock: 0,
    bufferStock: 2,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 9,
    isActive: true,
    images: [
      {
        url: "/api/uploads/cc631f2d-ee0a-492e-91c4-b500e8cb91e7.jpg",
        altText: "Guledgudda Khana Geometric Cushion Cover Pair",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "waffle-weave-organic-bath-sheet-pair",
    name: "Deep-Pocket Waffle Weave Organic Cotton Bath Sheet Pair",
    shortDescription:
      "Fast-drying honeycomb waffle bath sheets woven for humid coastal and monsoon climates.",
    description:
      "Unlike dense terry towels that stay damp indoors during the monsoon, our 380 GSM deep-pocket waffle weave absorbs water rapidly and dries in half the time on a standard towel rail.",
    category: "Linen & Textiles",
    tags: ["bath", "waffle-weave", "organic-cotton", "towels"],
    material: "100% GOTS-certified combed Indian organic cotton (380 GSM)",
    dimensions: "155 cm x 85 cm per bath sheet (Pair of 2, pre-washed for shrinkage)",
    careInstructions: "Machine wash warm. Avoid fabric softeners as they coat cotton fibres.",
    pricePaise: 248000,
    compareAtPaise: 280000,
    taxSlab: "GST_5",
    hsnCode: "63026090",
    supplierId: "sup-bagalkot-looms",
    supplierSku: "BLG-TW-02-WAF",
    supplierProductUrl: "https://bagalkotlooms.example.in/items/blg-tw-02-waf",
    supplierStock: 29,
    reservedStock: 2,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 5,
    isActive: true,
    images: [
      {
        url: "/api/uploads/8995fe10-d6f8-41ba-add4-6f46e0a4ec26.jpg",
        altText: "Deep-Pocket Waffle Weave Organic Cotton Bath Sheet Pair",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "handspun-dohar-summer-quilt-queen",
    name: "Three-Layer Handspun Mulmul Dohar Blanket (Queen)",
    shortDescription:
      "Three Whisper-soft layers of hand-block printed mulmul cotton edged with flanged piping.",
    description:
      "Constructed with an internal layer of block-printed madder and myrobalan botanical stripes sandwiched between two layers of fine 80-count mulmul voile for breathable AC and summer sleep.",
    category: "Linen & Textiles",
    tags: ["bedding", "dohar", "mulmul", "queen"],
    material: "100% combed 80s count mulmul cotton, three-ply stitched",
    dimensions: "225 cm x 250 cm (Fits Queen and standard King beds as a top layer)",
    careInstructions: "Gentle cold machine wash in a mesh bag. Line dry in shade.",
    pricePaise: 345000,
    taxSlab: "GST_12",
    hsnCode: "63013000",
    supplierId: "sup-bagalkot-looms",
    supplierSku: "BLG-DH-QN-MUL",
    supplierProductUrl: "https://bagalkotlooms.example.in/items/blg-dh-qn-mul",
    supplierStock: 8,
    reservedStock: 2,
    bufferStock: 3, // displayedStock = 3 -> "Only 3 left"
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 10,
    isActive: true,
    images: [
      {
        url: "/api/uploads/b5de0e15-a3dc-43bc-820a-9f923ac702ba.jpg",
        altText: "Three-Layer Handspun Mulmul Dohar Blanket",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "ribbed-kora-canvas-placemat-set",
    name: "Ribbed Kora Cotton Canvas Placemat Set (Set of 6)",
    shortDescription:
      "Heavy 450 GSM two-ply ribbed cotton placemats that lie flat without curling at the corners.",
    description:
      "Woven with doubled warp and thick weft cords to insulate wood and marble dining surfaces from hot serving dishes.",
    category: "Linen & Textiles",
    tags: ["placemats", "dining", "kora-cotton", "handloom"],
    material: "100% unbleached 2-ply Kora cotton canvas (450 GSM)",
    dimensions: "48 cm x 34 cm each (Set of 6)",
    careInstructions: "Spot clean or cold wash flat; reshape while damp.",
    pricePaise: 162000,
    taxSlab: "GST_5",
    hsnCode: "63025100",
    supplierId: "sup-bagalkot-looms",
    supplierSku: "BLG-PM-06-KOR",
    supplierProductUrl: "https://bagalkotlooms.example.in/items/blg-pm-06-kor",
    supplierStock: 27,
    reservedStock: 0,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 6,
    isActive: true,
    images: [
      {
        url: "/api/uploads/7953f8fc-5b74-449f-a23b-5179c1e2a4c8.jpg",
        altText: "Ribbed Kora Cotton Canvas Placemat Set",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },

  // --- CATEGORY 3: Brass & Metalwork (6 products) ---
  {
    slug: "sand-cast-brass-agarbatti-ash-catcher",
    name: "Sand-Cast Solid Brass Incense Trough (26 cm)",
    shortDescription:
      "Heavy architectural brass trough with removable angled pin block that catches all incense ash cleanly.",
    description:
      "Cast in solid yellow brass and hand-finished to a brushed satin sheen without synthetic lacquer, allowing the metal to develop a warm natural patina over time.",
    category: "Brass & Metalwork",
    tags: ["brass", "incense", "sand-cast", "ritual"],
    material: "100% solid unlacquered sand-cast yellow brass",
    dimensions: "Length 26 cm, Width 4.2 cm, Height 2.2 cm, Weight 620 g",
    careInstructions: "Wipe ash with a dry cloth. Polish with tamarind paste or Pitambari if bright lustre is preferred.",
    pricePaise: 195000,
    taxSlab: "GST_12",
    hsnCode: "74181021",
    supplierId: "sup-moradabad-foundry",
    supplierSku: "PNF-BR-26-INC",
    supplierProductUrl: "https://peetalnagri.example.in/products/pnf-br-26-inc",
    supplierStock: 21,
    reservedStock: 1,
    bufferStock: 3,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 8,
    isActive: true,
    images: [
      {
        url: "/api/uploads/ba4215f2-7b22-40d2-a504-7b0cab1c8c7b.jpg",
        altText: "Sand-Cast Solid Brass Incense Trough",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "kalai-tinned-brass-tadka-pan",
    name: "Heavy-Gauge Kalai-Lined Brass Tadka & Spice Tempering Pan",
    shortDescription:
      "Hand-hammered 3 mm thick brass tempering pan with pure tin (kalai) interior and teakwood handle.",
    description:
      "Designed for precise spice tempering (tadka/baghaar) with high thermal mass so mustard seeds, curry leaves, and whole chillies toast evenly without scorching.",
    category: "Brass & Metalwork",
    tags: ["cookware", "brass", "kalai", "tadka"],
    material: "3 mm hammered brass body, food-grade tin (kalai) lining, seasoned Burma teak handle",
    dimensions: "Pan diameter 11.5 cm, Depth 4.8 cm, Total length with handle 28 cm, Weight 540 g",
    careInstructions: "Cook on low-to-medium gas flame. Never heat empty. Hand wash with soft sponge only.",
    pricePaise: 235000,
    taxSlab: "GST_12",
    hsnCode: "74181021",
    supplierId: "sup-moradabad-foundry",
    supplierSku: "PNF-CK-11-TDK",
    supplierProductUrl: "https://peetalnagri.example.in/products/pnf-ck-11-tdk",
    supplierStock: 16,
    reservedStock: 0,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 11,
    isActive: true,
    images: [
      {
        url: "/api/uploads/16ff672a-c10b-4a88-9870-353107bcabe1.jpg",
        altText: "Kalai-Lined Brass Tadka Pan with teakwood handle",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "bell-metal-kansa-dinner-thali-set",
    name: "Hand-Forged Kansa (Bell Metal) Thali & Katori Set (4-Piece)",
    shortDescription:
      "Authentic 78:22 copper-tin bronze alloy dinner thali with two katoris and a straight-sided tumbler.",
    description:
      "Forged by heating and hammering bronze ingots on stone anvils. Kansa is non-reactive with sour curries, curd, and tamarind preparations.",
    category: "Brass & Metalwork",
    tags: ["kansa", "bronze", "thali", "dining"],
    material: "Certificated 78% Copper, 22% Tin (Lead-free Kansa bell metal)",
    dimensions: "Thali: 29 cm Dia (980 g); 2 Katoris: 9.5 cm Dia; Tumbler: 300 ml",
    careInstructions: "Hand wash immediately after meals with mild dish liquid and dry with a soft cotton towel.",
    pricePaise: 540000,
    compareAtPaise: 590000,
    taxSlab: "GST_12",
    hsnCode: "74181022",
    supplierId: "sup-moradabad-foundry",
    supplierSku: "PNF-KN-04-THL",
    supplierProductUrl: "https://peetalnagri.example.in/products/pnf-kn-04-thl",
    supplierStock: 8,
    reservedStock: 1,
    bufferStock: 3, // displayedStock = 4 -> "Only 4 left"
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 14,
    isActive: true,
    images: [
      {
        url: "/api/uploads/7184852e-b657-49d9-9f7a-f0e14eca87e2.jpg",
        altText: "Hand-Forged Kansa Thali and Katori 4-Piece Set",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "turned-brass-cabinet-knobs-set-of-4",
    name: "Knurled Solid Brass Architectural Cabinet Pulls (Set of 4)",
    shortDescription:
      "Lathe-turned solid brass T-bar and disc pulls with diamond knurling and M4 stainless machine screws.",
    description:
      "Machined from solid C36000 free-cutting brass bar stock with crisp diamond-pitch knurling that provides tactile grip on wardrobe doors and kitchen drawers.",
    category: "Brass & Metalwork",
    tags: ["hardware", "brass", "knobs", "architectural"],
    material: "Solid C36000 brass bar stock, 304 stainless steel M4 bolts (25 mm and 35 mm included)",
    dimensions: "Face diameter 32 mm, Projection 30 mm, Base collar 14 mm (Set of 4)",
    careInstructions: "Unlacquered satin finish; wipe with dry microfibre cloth.",
    pricePaise: 184000,
    taxSlab: "GST_18",
    hsnCode: "83024200",
    supplierId: "sup-moradabad-foundry",
    supplierSku: "PNF-HW-04-KNR",
    supplierProductUrl: "https://peetalnagri.example.in/products/pnf-hw-04-knr",
    supplierStock: 34,
    reservedStock: 2,
    bufferStock: 4,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 9,
    isActive: true,
    images: [
      {
        url: "/api/uploads/480062e4-da8f-4733-8fd7-81172e23760c.jpg",
        altText: "Knurled Solid Brass Architectural Cabinet Pulls Set of 4",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "heavy-brass-mortar-pestle-khalbatta",
    name: "Heavy-Cast Brass Mortar & Pestle (Khalbatta / Imam Dasta)",
    shortDescription:
      "Thick-walled 1.9 kg brass mortar and weighted pestle for crushing whole spices, garlic, and cardamom.",
    description:
      "A kitchen workhorse cast with an internal grooved floor so black peppercorns and cloves do not skitter when pounded.",
    category: "Brass & Metalwork",
    tags: ["kitchen", "brass", "mortar-pestle", "spices"],
    material: "Solid heavy-cast yellow brass",
    dimensions: "Mortar: 10.5 cm Dia x 9.8 cm H; Pestle: 17.5 cm L; Combined weight 1.92 kg",
    careInstructions: "Rinse and dry thoroughly after crushing wet ginger or garlic pastes.",
    pricePaise: 279000,
    taxSlab: "GST_12",
    hsnCode: "74181021",
    supplierId: "sup-moradabad-foundry",
    supplierSku: "PNF-KT-10-KHL",
    supplierProductUrl: "https://peetalnagri.example.in/products/pnf-kt-10-khl",
    supplierStock: 15,
    reservedStock: 0,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 100, // Stale (>72h) -> triggers "Limited stock"
    isActive: true,
    images: [
      {
        url: "/api/uploads/d5269b61-f25b-4b38-8edc-2c5867fa4050.jpg",
        altText: "Heavy-Cast Brass Mortar and Pestle Khalbatta",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "stepped-brass-urli-shallow-vessel",
    name: "Stepped Rim Sand-Cast Brass Urli Vessel (30 cm)",
    shortDescription:
      "Low-profile architectural brass bowl for floating flowers or dry botanical arrangements.",
    description:
      "Proportioned after temple stepwell geometry with a three-tier stepped rim and substantial base ring that sits steadily on console tables.",
    category: "Brass & Metalwork",
    tags: ["urli", "brass", "vessel", "decor"],
    material: "Sand-cast brass with matte wire-brushed finish",
    dimensions: "Outer diameter 30 cm, Height 8.5 cm, Weight 2.4 kg",
    careInstructions: "Change standing water every two days to prevent mineral rings; dry with soft cloth.",
    pricePaise: 425000,
    taxSlab: "GST_12",
    hsnCode: "74181021",
    supplierId: "sup-moradabad-foundry",
    supplierSku: "PNF-DC-30-URL",
    supplierProductUrl: "https://peetalnagri.example.in/products/pnf-dc-30-url",
    supplierStock: 12,
    reservedStock: 0,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 7,
    isActive: true,
    images: [
      {
        url: "/api/uploads/be274ea6-7884-4da0-bdef-28dd54464c42.jpg",
        altText: "Stepped Rim Sand-Cast Brass Urli Vessel",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },

  // --- CATEGORY 4: Lighting & Glass (6 products) ---
  {
    slug: "fluted-amber-glass-brass-pendant-light",
    name: "Mouth-Blown Fluted Amber Glass & Brass Gallery Pendant",
    shortDescription:
      "Optic-ribbed amber glass shade suspended from a turned solid brass gallery with braided cotton cord.",
    description:
      "Mouth-blown into a cast-iron optic mould in Firozabad and annealed for four hours for structural strength. Includes CE/BIS-certified E27 brass holder, ceiling rose, and 1.5 metres of twisted fabric cable.",
    category: "Lighting & Glass",
    tags: ["pendant", "lighting", "mouth-blown-glass", "brass"],
    material: "Annealed soda-lime optic glass, turned brass gallery, 3-core braided cotton flex",
    dimensions: "Shade diameter 24 cm, Shade height 19 cm, Adjustable cord drop up to 150 cm",
    careInstructions: "Wipe shade with a dry lint-free cloth when cool. Max 15W LED E27 bulb (warm 2700K recommended).",
    pricePaise: 385000,
    compareAtPaise: 430000,
    taxSlab: "GST_18",
    hsnCode: "94051900",
    supplierId: "sup-firozabad-glassworks",
    supplierSku: "FGW-LT-24-AMB",
    supplierProductUrl: "https://firozabadglass.example.in/lighting/fgw-lt-24-amb",
    supplierStock: 14,
    reservedStock: 1,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 6,
    isActive: true,
    images: [
      {
        url: "/api/uploads/c9a0164c-7c79-4282-a7e9-8be10bd7f640.jpg",
        altText: "Mouth-Blown Fluted Amber Glass and Brass Gallery Pendant",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "opal-milk-glass-desk-reading-lamp",
    name: "Cased Opal Milk-Glass & Stoneware Base Reading Lamp",
    shortDescription:
      "Weighted stoneware column base paired with a glare-free cased milk-glass dome shade and inline toggle.",
    description:
      "Combines a Bhadravati stoneware plinth with a double-layered Firozabad opal glass shade that diffuses warm light evenly across a study desk or bedside table.",
    category: "Lighting & Glass",
    tags: ["table-lamp", "opal-glass", "reading-lamp", "lighting"],
    material: "Cased opal glass shade, unglazed stoneware base, solid brass stem and toggle switch",
    dimensions: "Total height 39 cm, Shade diameter 22 cm, Base diameter 14 cm, 2 m fabric cord",
    careInstructions: "Disconnect from mains before cleaning. Use standard E27 LED bulb (4W to 9W).",
    pricePaise: 465000,
    taxSlab: "GST_18",
    hsnCode: "94052900",
    supplierId: "sup-firozabad-glassworks",
    supplierSku: "FGW-LT-39-OPL",
    supplierProductUrl: "https://firozabadglass.example.in/lighting/fgw-lt-39-opl",
    supplierStock: 10,
    reservedStock: 1,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 12,
    isActive: true,
    images: [
      {
        url: "/api/uploads/be092f66-8aea-4a21-8bcd-7b5403941aea.jpg",
        altText: "Cased Opal Milk-Glass and Stoneware Base Reading Lamp",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "borosilicate-stacked-bedside-carafe-tumbler",
    name: "Hand-Blown Smoke Borosilicate Bedside Carafe & Tumbler",
    shortDescription:
      "Heat-resistant smoke-tinted borosilicate water carafe where the drinking glass nests cleanly as the lid.",
    description:
      "Lampworked from 3.3 borosilicate glass tubing with a clean shear-polished rim that pours without dripping.",
    category: "Lighting & Glass",
    tags: ["glassware", "borosilicate", "carafe", "bedside"],
    material: "100% 3.3 thermal-shock resistant borosilicate glass",
    dimensions: "Carafe height 20 cm, Diameter 9.2 cm (850 ml); Tumbler height 8 cm (240 ml)",
    careInstructions: "Dishwasher safe. Safe for both chilled water and hot herbal infusions.",
    pricePaise: 149000,
    taxSlab: "GST_18",
    hsnCode: "70134200",
    supplierId: "sup-firozabad-glassworks",
    supplierSku: "FGW-GL-85-SMK",
    supplierProductUrl: "https://firozabadglass.example.in/glassware/fgw-gl-85-smk",
    supplierStock: 26,
    reservedStock: 2,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 5,
    isActive: true,
    images: [
      {
        url: "/api/uploads/95d4a85a-9eb7-496a-8a7c-65f530c5c99e.jpg",
        altText: "Hand-Blown Smoke Borosilicate Bedside Carafe and Tumbler",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "hammered-forest-green-glass-tumblers-set-6",
    name: "Mouth-Blown Forest Green Optic Water Tumblers (Set of 6)",
    shortDescription:
      "Weighted-base recycled soda-lime glass tumblers with subtle dimpled texture for everyday dining.",
    description:
      "Blown from cullet-rich green glass with a thick sham base that feels grounded in the hand and resists tipping.",
    category: "Lighting & Glass",
    tags: ["tumblers", "glassware", "recycled-glass", "dining"],
    material: "Mouth-blown soda-lime glass (60% post-studio cullet)",
    dimensions: "Height 9.8 cm, Rim diameter 8.2 cm, Capacity 290 ml each (Set of 6)",
    careInstructions: "Dishwasher safe on standard glass cycle.",
    pricePaise: 168000,
    taxSlab: "GST_18",
    hsnCode: "70133700",
    supplierId: "sup-firozabad-glassworks",
    supplierSku: "FGW-GL-06-GRN",
    supplierProductUrl: "https://firozabadglass.example.in/glassware/fgw-gl-06-grn",
    supplierStock: 30,
    reservedStock: 1,
    bufferStock: 3,
    dispatchTimeDays: 2,
    stockConfirmedHoursAgo: 8,
    isActive: true,
    images: [
      {
        url: "/api/uploads/40652973-042a-4c0a-ba38-a2dd07ea73aa.jpg",
        altText: "Set of six Mouth-Blown Forest Green Optic Water Tumblers",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "brass-collared-hurricane-candle-lantern",
    name: "Ribbed Glass & Brass-Collared Hurricane Candle Cylinder",
    shortDescription:
      "Tall wind-shielding borosilicate hurricane cylinder resting in a heavy spun-brass base tray.",
    description:
      "Protects pillar candle flames from ceiling fan drafts on verandahs and dining tables while casting linear shadow patterns through vertical ribs.",
    category: "Lighting & Glass",
    tags: ["candle-holder", "hurricane", "brass", "glass"],
    material: "Ribbed borosilicate glass cylinder, spun yellow brass tray with felt base pad",
    dimensions: "Total height 25 cm, Diameter 13.5 cm (Fits 7.5 cm pillar candles)",
    careInstructions: "Allow glass cylinder to cool before washing in warm soapy water.",
    pricePaise: 210000,
    taxSlab: "GST_18",
    hsnCode: "94055059",
    supplierId: "sup-firozabad-glassworks",
    supplierSku: "FGW-HR-25-BRS",
    supplierProductUrl: "https://firozabadglass.example.in/lighting/fgw-hr-25-brs",
    supplierStock: 17,
    reservedStock: 0,
    bufferStock: 2,
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 6,
    isActive: true,
    images: [
      {
        url: "/api/uploads/8c47d3e2-2842-4654-823d-ea8d3f5fab04.jpg",
        altText: "Ribbed Glass and Brass-Collared Hurricane Candle Cylinder",
        aspectRatio: "4:5",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "pleated-linen-wall-sconce-brass-arm",
    name: "Articulated Brass Knuckle Wall Sconce with Handloom Linen Shade",
    shortDescription:
      "Hardwired solid brass wall sconce with a locking knuckle joint and raw kora linen empire shade.",
    description:
      "Combining Moradabad brass machining with Bagalkot handloom linen, this wall sconce pivots 90 degrees vertically for reading beside beds or framing mirrors.",
    category: "Lighting & Glass",
    tags: ["wall-sconce", "lighting", "brass", "linen-shade"],
    material: "Turned solid brass backplate and knuckle joint, handloom linen shade on PVC-free parchment liner",
    dimensions: "Projection 26 cm, Backplate diameter 11 cm, Shade base diameter 18 cm",
    careInstructions: "Professional electrical installation recommended. Dust linen shade with a soft brush.",
    pricePaise: 329000,
    taxSlab: "GST_18",
    hsnCode: "94051900",
    supplierId: "sup-firozabad-glassworks",
    supplierSku: "FGW-SC-18-LIN",
    supplierProductUrl: "https://firozabadglass.example.in/lighting/fgw-sc-18-lin",
    supplierStock: 7,
    reservedStock: 1,
    bufferStock: 2, // displayedStock = 4 -> "Only 4 left"
    dispatchTimeDays: 3,
    stockConfirmedHoursAgo: 4,
    isActive: true,
    images: [
      {
        url: "/api/uploads/52705937-345f-4e3f-8889-220364a883a2.jpg",
        altText: "Articulated Brass Knuckle Wall Sconce with Handloom Linen Shade",
        aspectRatio: "1:1",
        sortOrder: 0,
      },
    ],
  },
];
