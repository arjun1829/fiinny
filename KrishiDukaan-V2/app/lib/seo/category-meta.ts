/**
 * Category metadata for SEO category landing pages (/category/[category]).
 *
 * The canonical category names mirror PRODUCT_CATEGORIES in
 * app/dashboard/_lib/category-info.ts. This module is server-safe (no client
 * imports) and only provides display names, URL slugs and intro copy — it does
 * not touch product data or any business logic.
 */

export interface CategoryMeta {
  /** URL slug, e.g. "fertilizers" */
  slug: string;
  /** Canonical category name as stored on product docs, e.g. "Fertilizers" */
  name: string;
  /** Plural display heading */
  heading: string;
  /** 400–600 word indexable intro copy rendered above the product grid */
  intro: string;
  /** SEO meta description */
  metaDescription: string;
  /** Optional FAQ pairs for FAQPage JSON-LD structured data */
  faqs?: { q: string; a: string }[];
}

export const SEO_CATEGORIES: CategoryMeta[] = [
  {
    slug: "seeds",
    name: "Seeds",
    heading: "Seeds",
    intro:
      "Buy high-quality agricultural seeds online at KrishiDukan. We offer a wide range of hybrid and open-pollinated seed varieties for cereals, pulses, oilseeds, vegetables and cash crops — sourced directly from verified manufacturers and trusted local retailers across India. Whether you are sowing soybean in Vidarbha, cotton in Gujarat, paddy in the Konkan belt or vegetables in a peri-urban farm, you will find the right variety here.\n\nChoosing the right seed is the single most important decision a farmer makes each season. A poor seed choice cannot be corrected by adding more fertilizer or water — the variety determines the ceiling on your yield before any other input is applied. Every seed listing on KrishiDukan includes the variety name, seed type (hybrid or OP), germination rate, days to maturity, recommended seed rate per acre, and the seasons and agro-climatic zones it is best suited for. Crops covered include soybean, cotton, wheat, paddy, maize, sorghum, groundnut, sunflower, onion, tomato, chilli, brinjal and more.\n\nHybrid seeds are produced by crossing two inbred parent lines under controlled conditions. They deliver higher yields, more uniform plant stands and better field tolerance to biotic and abiotic stress. The trade-off is cost — hybrid seed is more expensive — and the fact that seeds saved from the harvest will not perform like the parent crop, so fresh seed must be purchased every season. Open-pollinated varieties reproduce true from saved seed, are often better adapted to local soils and microclimates, and remain an economical choice for low-input farming systems.\n\nWhen buying seeds, always check the seed class tag attached to the packet. Seed classes in India follow a statutory certification system: Breeder seed (golden yellow tag) is the foundation of the chain, produced under the direct supervision of the plant breeder. Foundation seed (white tag) is produced from Breeder seed. Certified seed (azure blue tag) is the commercial grade sold to farmers. Truthfully Labelled (opal green tag) seed is not government-certified but carries the seller's truthful declaration of variety, germination and purity. Our verified sellers supply only genuine tagged seed — no spurious or counterfeit varieties.\n\nAdditional checks before buying: confirm the lot number for traceability, check the expiry or test date on the packet (germination rates decline over time), and verify that the variety is approved for cultivation in your state. Some high-yielding varieties have state-specific approval and perform differently outside their recommended zone.\n\nCompare prices from nearby retailers and manufacturers, read product specifications side by side, and order online with doorstep delivery to your village or farm. Stock up before the sowing season begins — certified seed often sells out in the weeks before kharif or rabi sowing windows, and buying early avoids both shortages and fake seed risks.",
    metaDescription:
      "Buy agricultural seeds online at KrishiDukan — hybrid & open-pollinated varieties for vegetables, cereals, pulses & cash crops. Best prices, verified sellers, doorstep delivery.",
    faqs: [
      {
        q: "What is the difference between hybrid and open-pollinated seeds?",
        a: "Hybrid seeds are produced by crossing two parent lines and deliver higher, more uniform yields. However, seeds saved from hybrid plants do not breed true, so new seed must be bought each season. Open-pollinated (OP) varieties breed true from saved seed, are often better adapted to local soils, and cost less — but typically yield less than modern hybrids.",
      },
      {
        q: "How do I choose the right seed variety for my region?",
        a: "Check the agro-climatic zone recommendation on each seed packet or product listing. Key factors are rainfall pattern (rainfed vs irrigated), soil type (black cotton soil, red laterite, alluvial), days available before the next crop, and local pest or disease pressure. KrishiDukan listings include region suitability so you can filter for your district.",
      },
      {
        q: "What seed rate should I use per acre?",
        a: "Seed rate varies by crop and variety. Common examples: soybean 25–30 kg/acre, cotton 1–1.5 kg/acre (BT hybrid), wheat 40–50 kg/acre, paddy 8–10 kg/acre (transplanting) or 20–25 kg/acre (direct seeding). Each product page on KrishiDukan lists the manufacturer-recommended seed rate for that specific variety.",
      },
      {
        q: "How can I verify that seeds are genuine and certified?",
        a: "Buy only from verified sellers on KrishiDukan. Look for the seed class label — Breeder (golden yellow), Foundation (white), Certified (azure blue) or Truthfully Labelled (opal green) — printed on the official tag attached to every genuine seed packet. Check the lot number and expiry date. Avoid loose seeds or packets with missing or printed-on (not attached) tags.",
      },
    ],
  },
  {
    slug: "fertilizers",
    name: "Fertilizers",
    heading: "Fertilizers",
    intro:
      "Shop fertilizers online at KrishiDukan — from straight macronutrients like urea (46% N) and DAP (18-46-0) to complex NPK grades, water-soluble fertilizers, micronutrient mixtures and organic options including vermicompost and bio-compost. Whether your crop is a nutrient-hungry cereal like wheat or paddy, a legume like soybean or chickpea that fixes its own nitrogen, or a high-value horticultural crop under drip irrigation, you will find the right product and dosage guidance here.\n\nPlant nutrition is best understood in four stages: soil preparation (incorporating basal phosphorus and potassium before sowing), basal application at or just after sowing (DAP or complex NPK), top dressing during active vegetative growth (urea or CAN split over 2–3 doses), and foliar or fertigation feeding at reproductive stages (water-soluble NPK and micronutrients). Getting the timing, source and quantity right at each stage determines whether a crop reaches its yield potential or falls short. KrishiDukan product pages list the complete nutrient analysis, recommended dosage per acre, application method and suitable growth stages — so you can plan a complete nutrition calendar, not just buy one product.\n\nPopular fertilizers available include: urea (46% N) for nitrogen top dressing; DAP (18-46-0) and SSP (16% P₂O₅) for phosphorus; MOP (muriate of potash, 60% K₂O) and SOP (sulphate of potash, 50% K₂O) for potassium; complex granular NPK grades like 10-26-26, 12-32-16 and 20-20-0 for basal use; water-soluble NPK grades like 19:19:19, 12:61:0, 0:0:50, 13:40:13 and 0:52:34 for drip fertigation and foliar programmes; zinc sulphate (21% or 33%), boron (Solubor), ferrous sulphate and manganese sulphate for micronutrient correction; and humic acid-enriched granules to improve soil carbon and cation exchange capacity.\n\nOrganic fertilizers including vermicompost, FYM (farmyard manure), neem cake, castor cake and rock phosphate are also listed for farmers following organic or natural farming systems. Unlike soluble fertilizers that provide instant nutrition, organic inputs build soil microbial activity, improve water-holding capacity and release nutrients slowly over the full growing season. They are especially valuable for high-value crops where soil health is a long-term investment.\n\nCompare prices from verified manufacturers and nearby retailers, check the nutrient guarantee printed on labels (required by the Fertilizers (Control) Order, 1985), and order online with home delivery. Bulk quantities are available from many sellers for large farms — some sellers offer discount pricing for orders above 5 or 10 bags. Use the category filter to browse by product type: granular basal fertilizers, water-soluble grades, micronutrients, or organic amendments, and narrow down by the crop stage that matches your current field requirement.",
    metaDescription:
      "Buy fertilizers online at KrishiDukan — urea, DAP, water-soluble NPK, micronutrients & organic fertilizers with NPK details, dosage & crop guidance. Best prices, doorstep delivery.",
    faqs: [
      {
        q: "What is the best fertilizer for paddy (rice) crop?",
        a: "Paddy requires nitrogen, phosphorus and potassium at specific stages. A common schedule is: DAP or SSP as basal dose at transplanting, urea split into two top dressings at tillering and panicle initiation, and MOP or SOP at panicle stage. Exact doses depend on soil test results and target yield. Zinc sulphate (25 kg/acre) is also recommended if the soil is zinc-deficient, which is common in paddy soils across Maharashtra and Madhya Pradesh.",
      },
      {
        q: "What does NPK 19:19:19 fertilizer do?",
        a: "NPK 19:19:19 is a fully water-soluble complex fertilizer containing 19% nitrogen, 19% phosphorus (P2O5) and 19% potassium (K2O) in equal proportion. It is used for drip fertigation and foliar spray to provide balanced nutrition at vegetative and early reproductive stages. It dissolves completely, leaving no residue in drip systems. Typical dose is 1–2 kg per acre per application via fertigation.",
      },
      {
        q: "How often should I apply urea to my crop?",
        a: "Urea should be split into 2–3 applications rather than one large dose to reduce nitrogen loss through volatilisation and leaching. Common practice: one-third as basal, one-third at first top dressing (25–30 days after sowing or transplanting), one-third at second top dressing (45–55 days). Always apply in moist soil and avoid foliar contact to prevent leaf burn.",
      },
      {
        q: "Can I mix DAP and urea and apply together?",
        a: "DAP and urea should not be mixed and left for extended periods as the reaction can cause nitrogen loss. Apply them separately, or mix immediately before broadcasting. If using a mechanical spreader, calibrate for each fertilizer separately. Some farmers broadcast DAP and incorporate it at ploughing, then apply urea as a top dressing — this sequence avoids direct mixing.",
      },
    ],
  },
  {
    slug: "pesticides",
    name: "Pesticides",
    heading: "Pesticides",
    intro:
      "Protect your crops with the right pesticides from KrishiDukan. We stock a comprehensive range of insecticides, acaricides and nematicides targeting sucking pests, chewing pests, mites and soil pests — covering cotton, soybean, paddy, wheat, vegetables, pulses and horticultural crops across India.\n\nEvery pesticide listing on KrishiDukan details the active ingredient and its concentration, chemical group and IRAC resistance management code, target pest or pest complex, mode of action (contact, systemic, translaminar or stomach poison), formulation type (EC, SC, WG, WP, SL, GR), recommended dosage per acre and per litre of water, crop safety notes, and the pre-harvest interval (PHI) — the minimum number of days between the last spray and harvest that ensures residues stay below legal maximum residue limits (MRLs). This information helps farmers choose the right product, rotate chemical groups across the season to prevent resistance, and comply with safe-use guidelines required by the Insecticides Act, 1968.\n\nInsecticide resistance is a serious and growing problem in Indian agriculture. In Bt cotton areas, whitefly (Bemisia tabaci) has developed resistance to multiple neonicotinoid molecules. Spotted bollworm has shown reduced sensitivity to some pyrethroid formulations. The IRAC group system — where each numbered group shares a common mode of action — is the most reliable resistance management tool available. Rotating between groups (e.g. Group 4A neonicotinoids → Group 28 diamides → Group 6 avermectins → Group 23 tetramic acids) across spray cycles prevents any single mechanism from selecting resistant individuals.\n\nCommonly available products include imidacloprid 17.8% SL, thiamethoxam 25% WG, chlorpyrifos 20% EC, acephate 75% SP, emamectin benzoate 5% SG, fipronil 5% SC, lambda-cyhalothrin, cypermethrin, profenofos, buprofezin, spiromesifen, flonicamid, chlorantraniliprole 18.5% SC and coragen. Products from manufacturers such as Bayer, Syngenta, UPL, PI Industries, Sumitomo, FMC and BASF are all available through KrishiDukan's verified seller network.\n\nSafe pesticide use means more than choosing the right molecule. Always wear chemical-resistant gloves, goggles and a mask during mixing and application. Never spray in high wind, during peak heat, or near water bodies. Strictly observe the PHI before harvest. Dispose of empty containers by triple-rinsing and puncturing, then surrendering to an authorised waste handler — do not reuse, burn or discard in open fields. Keep a usage record showing product name, batch number, date, dose and field treated for traceability and compliance. Browse KrishiDukan's pesticide listings, compare IRAC groups and active ingredients across products, and order from verified sellers who supply only registered, quality-tested formulations at competitive prices with doorstep delivery.",
    metaDescription:
      "Buy pesticides & insecticides online at KrishiDukan with active ingredient, target pest, dosage & waiting-period details. Verified sellers, best prices, doorstep delivery.",
    faqs: [
      {
        q: "Which pesticide is best for whitefly in cotton?",
        a: "Whitefly in cotton is best controlled with systemic insecticides that work through plant uptake. Effective options include thiamethoxam 25% WG (0.2 g/litre), dinotefuran 20% SG, flonicamid 50% WG (0.3 g/litre) or spiromesifen 240 SC. Rotate between IRAC groups — neonicotinoids (Group 4A), butenolides (Group 4D), chordotonal organ disruptors (Group 9C) and tetramic acid derivatives (Group 23) — to prevent resistance, which is a serious problem in Bt cotton.",
      },
      {
        q: "What is the pre-harvest interval (PHI) and why does it matter?",
        a: "The PHI (pre-harvest interval) is the minimum number of days that must pass between the last pesticide application and harvest, to ensure residues fall below the maximum residue limit (MRL) for that crop. For example, imidacloprid on vegetables typically has a PHI of 3–7 days. Harvesting before the PHI causes pesticide residues in food and can result in rejection by traders or export markets. Always check the PHI on the product label.",
      },
      {
        q: "How do I mix pesticides safely?",
        a: "Fill the spray tank half full with clean water first. Add the measured pesticide slowly, stir gently, then top up to the required volume. Never mix pesticides in their concentrate form. Wear gloves, goggles and a mask during mixing and spraying. Do not spray in high wind or during the hottest part of the day. Wash hands and face thoroughly after use. Check the label for any specific incompatibilities before tank-mixing two products.",
      },
      {
        q: "What does 'IRAC group' mean on a pesticide label?",
        a: "IRAC (Insecticide Resistance Action Committee) classifies insecticides by their mode of action. Products with the same IRAC group number work the same way and should not be used consecutively, as pests exposed to one product in a group may already be resistant to others in the same group. Rotating between different IRAC groups — for example Group 4A (neonicotinoids) then Group 28 (diamides) then Group 6 (avermectins) — is the key strategy for managing insecticide resistance.",
      },
    ],
  },
  {
    slug: "herbicides",
    name: "Herbicides",
    heading: "Herbicides (Weedicides)",
    intro:
      "Control weeds effectively with herbicides (weedicides) from KrishiDukan. Weeds are the single most costly pest category in Indian agriculture — weed competition during the first 30–45 days after sowing or transplanting can reduce yields by 20–60% depending on weed species density and the crop. Choosing the right herbicide and applying it at the correct growth stage is as important an agronomic decision as seed or fertilizer choice.\n\nKrishiDukan lists selective and non-selective herbicides for both pre-emergence and post-emergence use. Pre-emergence herbicides are applied to moist soil immediately after sowing and before crop or weed emergence. They form a chemical barrier in the upper soil layer that prevents weed seedlings from establishing. Most pre-emergence herbicides require a light rainfall or irrigation within 3–4 days of application to activate them. Post-emergence herbicides are applied after both crop and weeds have emerged and must be matched precisely to the weed species present: narrow-leaved (grass) weeds like Echinochloa, Phalaris and Digitaria; broad-leaved weeds like Parthenium, Chenopodium, Convolvulus and Commelina; or sedges like Cyperus rotundus (nutgrass, motha).\n\nHerbicide selectivity is crop-specific. An herbicide safe on wheat may damage soybean, and one registered for paddy may not be approved for maize. Always confirm that the product label lists your crop before application. Every KrishiDukan herbicide listing includes the active ingredient, chemical family, weed spectrum covered, application timing, recommended dose per acre and per litre of water, required water volume, crop safety notes, re-entry interval and PHI.\n\nPopular products available include: for pre-emergence — pendimethalin 30% EC, atrazine 50% WP, butachlor 50% EC, metolachlor, alachlor and metribuzin; for post-emergence on wheat — clodinafop-propargyl + metsulfuron, sulfosulfuron, isoproturon; for paddy — bispyribac-sodium (Nominee), pretilachlor, oxadiargyl, cyhalofop-butyl; for soybean — imazethapyr, quizalofop-p-ethyl, fenoxaprop-p-ethyl; for cotton and maize — 2,4-D, tembotrione, topramezone, nicosulfuron.\n\nHerbicide resistance is increasing in India, particularly Phalaris minor resistance to ACCase inhibitors in wheat-growing states. Rotating herbicide modes of action across seasons — using HRAC group A (ACCase inhibitors) one year and HRAC group B (ALS inhibitors) the next — is the recommended management strategy. Spray using a flat fan nozzle calibrated to deliver 150–200 litres of water per acre, avoid application in windy conditions to prevent drift, and observe the sprayer exclusion zone near field boundaries, water sources and sensitive crops. Browse KrishiDukan's herbicide listings filtered by crop, weed type or application timing, compare active ingredients and dosages from multiple verified sellers, and order online with doorstep delivery to your farm.",
    metaDescription:
      "Buy herbicides & weedicides online at KrishiDukan — selective & non-selective, pre- and post-emergence, with active ingredient, target weeds & dosage. Best prices, doorstep delivery.",
    faqs: [
      {
        q: "What is the difference between pre-emergence and post-emergence herbicides?",
        a: "Pre-emergence herbicides are applied to the soil after sowing but before weed seeds germinate. They inhibit germination or early seedling growth and are most effective in moist soil. Post-emergence herbicides are applied after both the crop and weeds have emerged. They must be selected based on the type of weeds present — grass weeds, broad-leaved weeds or sedges — and applied at the correct weed growth stage (usually 2–4 leaf stage for best control).",
      },
      {
        q: "Which herbicide controls nutgrass (motha / Cyperus rotundus)?",
        a: "Cyperus rotundus (nutgrass) is one of the most difficult weeds to control because of its underground tuber network. Effective options include halosulfuron-methyl (Sempra), which is registered for use in sugarcane and maize; EPTC, used as a pre-plant incorporated treatment; and 2,4-D amine for post-emergence suppression in tolerant crops like wheat and maize. Multiple applications over 2–3 seasons are needed for meaningful reduction in nutgrass populations.",
      },
      {
        q: "How much water should I use per acre when spraying herbicides?",
        a: "For most post-emergence herbicides, 200 litres of water per acre (approximately 2 tanks of a 10-litre knapsack sprayer per 0.1 acre) gives good coverage. Pre-emergence herbicides also require uniform application over moist soil — typically 150–200 litres/acre. Always calibrate your sprayer before starting and adjust nozzle pressure to produce medium-sized droplets. Very fine droplets drift in wind; very coarse droplets run off leaves. Check the product label for the specific recommendation.",
      },
      {
        q: "Can I spray herbicide if rain is expected?",
        a: "Most post-emergence herbicides need a rain-free period of 4–6 hours after application to be absorbed by the plant. If rain falls before absorption is complete, the herbicide washes off and reapplication may be needed. Pre-emergence herbicides actually benefit from light rainfall after application, which activates the chemical in the soil. Always check the weather forecast and the product label's rain-fastness information before spraying.",
      },
    ],
  },
  {
    slug: "bio-stimulants",
    name: "Bio-Stimulants",
    heading: "Bio-Stimulants",
    intro:
      "Boost crop growth and improve yield quality with bio-stimulants from KrishiDukan. Bio-stimulants are products derived from natural materials — seaweed extracts, humic and fulvic acids, amino acids, plant-based hormones and beneficial microorganism consortia — that improve a plant's ability to absorb nutrients, tolerate abiotic stress, and reach its genetic yield potential without simply adding more chemical fertilizer. They are widely used in horticulture, protected cultivation, and high-value field crops where optimising quality alongside yield is as important as maximising total production.\n\nUnlike fertilizers, bio-stimulants do not supply plant-available nutrients directly. Instead, they act on the plant's own physiology and on soil biology. Seaweed extracts containing natural cytokinins, betaines and mannitol improve root branching and elongation — a larger root system absorbs more water and nutrients from a given volume of soil. Humic and fulvic acids chelate micronutrients like zinc and iron into plant-available forms, increase cation exchange capacity of the soil, and stimulate beneficial soil bacteria and mycorrhizal fungi. Amino acid hydrolysates provide organic nitrogen and carbon that support root zone microflora and serve as precursors for plant hormone biosynthesis. Gibberellin and cytokinin plant growth regulators regulate cell elongation, tillering and fruit set at precisely the growth stages where applied hormones are most effective.\n\nKrishiDukan stocks bio-stimulants based on Ascophyllum nodosum and Sargassum seaweed extracts; leonardite-derived humic acid (12–15% humic acid content); fulvic acid concentrates (6–8%); enzymatic and acid-hydrolysed amino acid products; gibberellin (GA₃) in WG and liquid formulations; cytokinin (zeatin or kinetin-based) sprays; and polyamine products for fruit set and retention. Products are available as water-soluble powders (WSP), soluble concentrates (SL), and granules for soil incorporation or fertigation.\n\nField trial data from Indian agricultural universities shows 8–18% yield improvement in soybean, grape, pomegranate and vegetable crops from well-timed bio-stimulant programmes, with the strongest response at flowering and early fruit development stages. The key is application timing: seaweed or cytokinin products at flower bud initiation, amino acid or humic acid at early vegetative stage, and fulvic acid as a carrier during micronutrient foliar sprays.\n\nBio-stimulants work best as a complement to — not a replacement for — adequate macro and micronutrient supply, proper irrigation management and sound crop protection. Think of them as yield optimisers: they help crops perform closer to their genetic ceiling, particularly under conditions of mild stress, sub-optimal nutrition, or during critical windows like flowering and fruit development where marginal improvements in plant physiology have outsized effects on final yield and quality. Browse KrishiDukan's listings, compare products by active ingredient, dosage and crop stage, and order from verified sellers with doorstep delivery.",
    metaDescription:
      "Buy bio-stimulants online at KrishiDukan — humic acid, seaweed extract & amino-acid based growth promoters with benefits, dosage & crop details. Verified sellers, doorstep delivery.",
    faqs: [
      {
        q: "What does a seaweed extract bio-stimulant do for crops?",
        a: "Seaweed extracts (typically from Ascophyllum nodosum or Sargassum) contain natural cytokinins, betaines, mannitol and polysaccharides that stimulate root growth, improve flower and fruit set, and help plants recover from cold, drought and transplant stress. Field trials show 8–15% yield increases in vegetables, grapes and soybean when seaweed extract is applied at 2–3 ml/litre as a foliar spray at flowering and fruit development stages.",
      },
      {
        q: "What is the difference between humic acid and fulvic acid?",
        a: "Both are organic acids derived from decomposed organic matter (leonardite, compost). Humic acid has a larger molecular weight and works primarily in the soil — it improves soil structure, water-holding capacity and cation exchange capacity, making nutrients more available to roots. Fulvic acid is smaller and penetrates plant tissue more easily, making it better suited for foliar application and direct nutrient transport into leaves. Most commercial bio-stimulant products contain both, but the ratio determines whether they are best used as soil amendments or foliar sprays.",
      },
      {
        q: "Can bio-stimulants be mixed with fertilizers or pesticides?",
        a: "Most liquid bio-stimulants are compatible with water-soluble fertilizers and many pesticides, but always do a jar test first: mix small amounts in a clear container and check for precipitation, separation or gel formation within 15 minutes. Avoid mixing humic acid with calcium-containing fertilizers (e.g. calcium nitrate) as calcium humate precipitates. Check individual product labels for specific incompatibilities and always add components to the spray tank in the correct order (water first, then each product with stirring).",
      },
      {
        q: "At what crop stage should I apply bio-stimulants for best results?",
        a: "Key application windows are: (1) seed soaking or seed treatment before sowing to improve germination and early root development; (2) early vegetative stage (15–25 days) to promote root establishment; (3) pre-flowering to improve flower retention and pollination; (4) fruit development stage to increase fruit size and quality. For humic acid as a soil amendment, apply before sowing or with the first irrigation. Foliar amino acid or seaweed products work best applied in the evening when stomata are open and evaporation is low.",
      },
    ],
  },
  {
    slug: "sprayers",
    name: "Sprayers",
    heading: "Sprayers",
    intro:
      "Find the right sprayer for your farm at KrishiDukan. Choosing the correct spraying equipment is as important as choosing the right chemical — poor application equipment leads to uneven canopy coverage, inconsistent chemical distribution, over-application in some zones with phytotoxicity risk, under-application in others with poor pest or disease control, unnecessary chemical waste and higher operator exposure.\n\nKrishiDukan stocks manual knapsack sprayers, battery-operated (electric) knapsack sprayers and petrol-powered knapsack sprayers across tank capacities from 10 litres to 20 litres. Each listing specifies the tank capacity and material (HDPE or stainless steel), pump type (piston or diaphragm), working pressure range, flow rate per minute, spray range (horizontal and vertical), nozzle type included (flat fan, hollow cone, adjustable), battery voltage and Ah rating plus charging time (for electric models), engine displacement and fuel consumption per hour (for petrol models), weight empty, and the types of chemicals compatible with the tank material — important since some formulations are corrosive to standard HDPE tanks.\n\nFor small plots up to 1 acre in row crops and vegetables, a 16-litre manual knapsack sprayer in the ₹800–₹1,500 range is usually adequate. The limiting factor is operator fatigue — continuous pumping over a full tank refill cycle is tiring, and variable pump pressure leads to inconsistent spray quality. For farms above 1 acre sprayed two or more times per season, a battery-operated knapsack sprayer with a 12V or 16V pump (8–12 Ah battery, 45–90 minutes run-time per charge) delivers constant pressure automatically and significantly reduces fatigue. These typically cost ₹2,500–₹6,000. Petrol-powered knapsack sprayers (2T or 4T engine, 1.5–3 HP) are the right choice for large areas, tall crops like sugarcane, banana or mango orchards, and locations where electricity for battery recharging is unavailable or unreliable.\n\nNozzle selection matters more than most farmers realise. Flat fan nozzles (110° or 80° angle, TeeJet or equivalent) produce a uniform flat spray pattern ideal for herbicide application and good canopy penetration for insecticide and fungicide work. Hollow cone nozzles produce a ring-shaped pattern that deposits spray on the underside of leaves — critical for fungicide programmes where downy mildew, powdery mildew or rust infections start from the abaxial leaf surface. Adjustable twist nozzles offer flexibility but sacrifice calibration accuracy, so they are better suited to irrigation-type uses than precise pesticide delivery.\n\nAlways triple-rinse the tank, pump barrel and hose with clean water immediately after each use, especially after herbicide applications — residues of 2,4-D or glyphosate left in the tank can damage sensitive crops at the next use even in very small quantities. Store the sprayer with the pump piston lightly lubricated and in an area protected from UV light and temperature extremes, which degrade HDPE tanks over time.",
    metaDescription:
      "Buy agricultural sprayers online at KrishiDukan — manual, battery & petrol knapsack sprayers with tank capacity, power source & nozzle details. Best prices, doorstep delivery.",
    faqs: [
      {
        q: "What is the difference between a manual and battery-operated sprayer?",
        a: "A manual (hand-pump) knapsack sprayer requires the operator to continuously pump a lever to build and maintain pressure. This causes fatigue over large areas and results in variable spray pressure, affecting coverage uniformity. A battery-operated sprayer has an electric pump that maintains constant pressure automatically, reducing operator fatigue significantly. Battery models cost more upfront but improve spray uniformity and allow the operator to focus on walking speed and nozzle direction rather than pumping. They are ideal for farms larger than 1 acre sprayed frequently.",
      },
      {
        q: "How many litres of spray solution does one acre of crop require?",
        a: "Water volume per acre depends on crop type, growth stage and nozzle type. General guidelines: field crops (paddy, wheat, soybean) at vegetative stage — 100–150 litres/acre; same crops at advanced growth with dense canopy — 150–200 litres/acre; vegetables and horticultural crops — 200–300 litres/acre; orchards (mango, pomegranate) — 400–600 litres/acre depending on tree size. Always refer to the pesticide or fungicide label for the specific volume recommendation as under-application reduces efficacy and over-application increases residue risk.",
      },
      {
        q: "How do I clean my sprayer after use?",
        a: "Rinse the tank, pump and hose three times with clean water immediately after use — do not let spray solution dry inside the equipment. For herbicide sprayers, add 1 litre of household ammonia or 2% washing soda solution to the final rinse, pump through the hose and nozzle, then rinse again with clean water. This neutralises herbicide residues that can damage the next crop if traces remain. Store the sprayer with the pump partially pressurised to maintain seal integrity.",
      },
      {
        q: "What is a diaphragm pump and why is it better for pesticide spraying?",
        a: "A diaphragm pump uses a flexible membrane (diaphragm) that moves back and forth to create suction and pressure, without the liquid contacting any metal parts. This makes it far more resistant to corrosion from acidic or alkaline chemicals and abrasive wettable powder formulations than a piston pump, where the metal piston directly contacts the liquid. Diaphragm pumps last longer with chemical spraying and require less maintenance. They are recommended for anyone using WP, WG or SC formulations regularly.",
      },
    ],
  },
  {
    slug: "tools",
    name: "Tools",
    heading: "Farming Tools & Equipment",
    intro:
      "Equip your farm with durable, well-made farming tools from KrishiDukan. The right tool reduces the time and labour needed for field operations, improves the quality of work, and lowers the overall cost of cultivation per acre. In an era of rising farm labour costs and labour shortages during critical sowing and harvest windows, well-designed hand tools and small equipment are not optional — they are the practical solution that keeps farming economically viable at the one to ten-acre scale.\n\nKrishiDukan stocks a comprehensive range of hand tools and small farm equipment for all operations: khurpi (hand hoes) and wheel hoes for inter-row weeding and earthing up in vegetables, pulses and row crops; sickles with serrated and smooth blades for harvesting wheat, paddy, sorghum and grass; spades, forks and shovels in both round-point and square-point profiles for soil turning, composting and irrigation channel maintenance; pruning shears (secateurs), loppers and grafting knives for horticulture, orchard management and nursery work; soil testing mini-kits for field-level pH, EC and NPK status checking without sending samples to a lab; seed treatment drums and mixing equipment for fungicide and insecticide seed coating before sowing; and personal protective equipment including nitrile gloves, splash-proof goggles and respiratory masks for safe pesticide handling.\n\nEvery tool listing on KrishiDukan specifies the material — high-carbon steel (harder edge, sharper cut), stainless steel (rust resistance for wet conditions), or forged steel (maximum strength for heavy digging) — the handle type and length, overall weight, intended operations, compatible crops or soil types, and the warranty period offered by the manufacturer. Some tools list the specific steel grade or hardness (HRC rating) so buyers can compare quality across brands at different price points.\n\nFor inter-row weeding — the most labour-intensive regular operation in vegetable and pulse farming — the single most effective efficiency gain is a wheel hoe. A wheel hoe with a stirrup hoe attachment covers 4–6 times more area per hour than a hand khurpi and does so with dramatically less back strain. It is most effective in row-spaced crops (30+ cm row spacing) at the 15–30 day stage when weeds are small and the soil is not yet hard. On compact or stony ground, a push-pull cultivator or oscillating hoe attachment works better than a standard stirrup blade.\n\nAll tools are sourced from verified manufacturers and suppliers. Compare prices, specifications and warranty terms across sellers and order online with delivery to your doorstep.",
    metaDescription:
      "Buy farming tools & equipment online at KrishiDukan — weeding, digging & harvesting tools with material, dimensions & warranty details. Best prices, doorstep delivery.",
    faqs: [
      {
        q: "What tools do I need for vegetable farming?",
        a: "Essential tools for vegetable cultivation include: a spade or fork for bed preparation; a khurpi (hand hoe) for transplanting, weeding and earthing up; a hand trowel for small seedling work; a sickle or harvesting knife for cut-and-carry or crop removal; a watering can or micro-irrigation accessories for seedling establishment; pruning shears for training climbers and removing suckers from tomato and brinjal; and protective gloves for chemical and thorny-crop handling. A wheel hoe adds significant efficiency for inter-row weeding in row-spaced crops.",
      },
      {
        q: "How do I maintain my farming tools to make them last longer?",
        a: "Clean soil and plant material from tools after every use. For metal tools, wipe blades with a lightly oiled cloth to prevent rust, especially during the monsoon. Sharpen cutting tools (sickles, pruning shears, khurpi blades) with a whetstone or metal file when they lose their edge — sharp tools require less force and cause less crop damage. Store tools under cover in a dry location. Replace cracked wooden handles before they break during use. Disinfect harvesting and pruning tools with a 1% bleach or 70% alcohol solution between plants when working in an area with known disease incidence.",
      },
      {
        q: "What is a wheel hoe and when should I use it?",
        a: "A wheel hoe is a manual weeding tool with one or two wheels, a long handle and interchangeable working attachments — flat hoe blade, stirrup hoe, furrowing plough or cultivator tines. The wheel supports the weight of the tool so the operator only needs to push it along the row, making it much less tiring than a hand hoe. It is ideal for weeding between rows in transplanted vegetables, pulses and maize at 20–40 days after sowing when weeds are small. Row spacing must be at least 30 cm to accommodate the wheel hoe without damaging the crop.",
      },
      {
        q: "What safety equipment should a farmer use when handling pesticides?",
        a: "The minimum personal protective equipment (PPE) for pesticide mixing and spraying is: chemical-resistant gloves (nitrile or neoprene — not cotton); safety goggles to protect against splash; a face mask or respirator (at minimum an N95 dust mask, and for concentrated organophosphate spraying, a half-face respirator with organic vapour cartridge); full-length clothing with long sleeves; and rubber boots. Wash hands, face and all exposed skin with soap and water immediately after use. Never eat, drink or smoke during pesticide work.",
      },
    ],
  },
  {
    slug: "other",
    name: "Other",
    heading: "Other Agriculture Products",
    intro:
      "Discover agriculture products at KrishiDukan that support every stage of farming — from soil health management and nursery establishment to pest monitoring, protected cultivation and post-harvest care. This category brings together the agri-inputs and farm supplies that sit outside the standard seed, fertilizer, crop-protection and equipment ranges but are just as important for running a productive and profitable farm.\n\nSoil health and pH management: Soils across central and southern India are increasingly acidic due to long-term use of ammoniacal fertilizers. Agricultural lime (calcium carbonate) at 200–500 kg/acre corrects soil pH, and dolomite (calcium and magnesium carbonate) simultaneously addresses magnesium deficiency common in acidic soils. Gypsum (calcium sulphate) is used for sodic soil reclamation in Maharashtra and Karnataka's black soils — it replaces sodium on exchange sites with calcium, improving soil structure and drainage. Coco peat and perlite are the standard nursery media for plug tray and polyhouse seedling production, providing excellent aeration and water retention without the weed seed risks of soil-based media.\n\nPest monitoring and biological management: Pheromone traps are an essential tool for threshold-based pest management — monitoring trap catches weekly tells you exactly when pest populations cross the economic threshold and a spray is warranted, allowing you to avoid calendar-based spraying and reduce the total number of chemical applications per season. Sticky yellow and blue traps capture adult whiteflies, thrips, fungus gnats and leaf miners in polyhouses and nurseries. Beauveria bassiana, Metarhizium anisopliae, Trichoderma viride, Bacillus thuringiensis (Bt) and Pseudomonas fluorescens are bio-pesticides and bio-control agents compatible with organic and Integrated Pest Management (IPM) programmes.\n\nGrowth regulators: Ethephon (ethylene-releasing compound) is registered for crop management in several fruits and cotton. Mepiquat chloride controls excessive vegetative growth in cotton, improving light interception and boll retention. Gibberellin (GA₃) increases fruit size and stem elongation in grapes when applied at the correct berry development stage. These require careful dose and timing management — browse individual product pages for crop-specific label directions.\n\nProtected cultivation accessories: Shade nets (25%, 50% or 75% shading), insect-proof netting (50 or 40 mesh), anti-hail nets, mulching films, drip tape laterals, inline drip emitters, micro-sprinklers, pressure gauges, sand filters and fertigation venturi injectors are all stocked by KrishiDukan suppliers. Every listing in this category includes detailed specifications, usage guidance and compatibility information. Browse by application type, crop system or problem to find exactly what your farm needs, and order from verified manufacturers and suppliers across India with competitive prices and doorstep delivery.",
    metaDescription:
      "Browse more agriculture products online at KrishiDukan — verified sellers, detailed specifications and best prices with doorstep delivery for farmers across India.",
    faqs: [
      {
        q: "What is a pheromone trap and how does it help in farming?",
        a: "A pheromone trap uses a synthetic copy of the sex pheromone secreted by female insects to attract and trap male insects of that specific species. They are used for two purposes: monitoring (checking trap counts tells you when pest populations are reaching threshold and a spray is warranted) and mass trapping (deploying many traps per acre can reduce pest populations in some crops). Pheromone traps are species-specific — a fall armyworm trap catches only fall armyworm, not bollworm or other pests — so correct identification of the target pest is essential before purchasing.",
      },
      {
        q: "What is Trichoderma and how is it used?",
        a: "Trichoderma is a naturally occurring soil fungus that is beneficial to plants and antagonistic to many soil-borne plant pathogens such as Fusarium, Rhizoctonia, Sclerotinia and Pythium, which cause damping-off, wilt and root rot diseases. It is available as a talc-based powder or granular formulation. Common uses: seed treatment (coat seeds with Trichoderma powder before sowing), soil application (mix with FYM or compost and apply to soil before planting), or drenching (dissolve in water and drench around plant base for established crops). It is compatible with chemical fertilizers but should not be applied at the same time as fungicide soil drenches.",
      },
      {
        q: "How do I use a soil testing kit at home?",
        a: "Field soil testing kits measure soil pH, available nitrogen, phosphorus and potassium using simple chemical reagent tests. Collect soil samples from 6–8 spots across the field, at a depth of 0–15 cm. Mix the samples together and take a 500g subsample. Air-dry for 24 hours before testing. Follow the kit instructions: mix a weighed soil sample with the supplied reagent solution, shake or stir as directed, and compare the resulting colour against the printed colour chart. Results guide fertilizer recommendations for the season. For more accurate results, send a composite sample to a government soil testing laboratory.",
      },
    ],
  },
];

/** Look up category metadata by URL slug (case-insensitive). */
export function getCategoryBySlug(slug: string): CategoryMeta | null {
  const s = slug.trim().toLowerCase();
  return SEO_CATEGORIES.find((c) => c.slug === s) ?? null;
}

/** Map an arbitrary stored category name to its SEO slug, or null if unknown. */
export function categoryNameToSlug(name: string): string | null {
  const n = name.trim().toLowerCase();
  return SEO_CATEGORIES.find((c) => c.name.toLowerCase() === n)?.slug ?? null;
}
