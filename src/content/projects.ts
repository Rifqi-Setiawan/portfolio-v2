import type { Media, Project } from './types';

const full = (src: string, alt: string, aspect = 16 / 9): Media => ({ span: 'full', aspect, src, alt });

const TRIBUN = 'https://github.com/Rifqi-Setiawan/platform-ticketing';

const entries: Project[] = [
  {
    slug: 'tribunpass',
    title: 'TribunPass',
    subtitle: 'Go ticketing platform',
    year: 2026,
    categories: ['backend'],
    palette: { bg: '#d8dccb', fg: '#16201a', accent: '#2f6b3a' },
    headline: { dim: 'Sell every seat once, ', strong: 'even when everyone clicks at once.' },
    about:
      'A match-day ticketing backend in Go and PostgreSQL. Groups of tickets are held atomically, paid before a deadline, and never oversold, even across multiple servers.',
    facts: {
      context: 'Live product, open source',
      work: 'Backend, concurrency tests, organizer dashboard',
      role: 'Backend Software Engineer',
      stack: ['Go', 'PostgreSQL', 'Next.js', 'REST API', 'k6', 'Docker'],
    },
    links: { live: 'https://tribunpass.rifqisetiawan.my.id/', github: TRIBUN },
    cover: '/media/tribunpass/cover-1200.webp',
    media: [
      full('/media/tribunpass/01.webp', 'TribunPass match-day page listing ticket categories and remaining stock', 3 / 2),
      full('/media/tribunpass/02.webp', 'TribunPass checkout with a five-minute payment countdown for two tickets', 16 / 10),
      full('/media/tribunpass/03.webp', 'TribunPass organizer dashboard showing sales and capacity', 16 / 10),
    ],
    how: [
      {
        heading: 'A two-ticket checkout',
        body: 'A fan books 2 Reguler tickets at Rp75,000 each. Stock drops from 10 to 8, and the fan has 5 minutes to pay Rp150,000. Paying issues two tickets, each with its own QR code.',
      },
      {
        heading: 'Reserving a group atomically',
        body: 'The Go handler accepts the whole group or declines it. A conditional PostgreSQL update protects the stock, and one transaction records the stock change, the hold, the unit price and the response under an idempotency key. A retry on another instance returns the same reservation.',
      },
      {
        heading: 'Payment at the deadline',
        body: 'The signed payment callback and the expiry worker lock the same hold before reading the database clock. An on-time payment issues one ticket per place. Expiry returns the group exactly once. A unique constraint on order ID and ticket number stops duplicates.',
      },
      {
        heading: 'How the organizer counts sales',
        body: 'Counts come from one PostgreSQL snapshot, and only confirmed orders count. A capacity change is rejected if the new limit is below what is held plus sold.',
      },
      {
        heading: 'What the concurrency tests prove',
        body: 'Four simultaneous requests for 4 tickets each against 10 places: two groups got 8 tickets and 2 remained. Replaying a payment for 3 tickets on two servers gave one paid order, 3 ticket IDs and Rp225,000 revenue.',
      },
    ],
    metrics: [
      { value: '8 / 2', label: 'sold / left, 4 x 4 requests vs 10 places' },
      { value: '5 min', label: 'hold before the group is released' },
      { value: '1', label: 'paid order after a two-server payment replay' },
    ],
    code: [
      { label: 'Case study', href: `${TRIBUN}/blob/main/docs/case-study.md` },
      { label: 'System tests: orders', href: `${TRIBUN}/blob/main/tests/system/orders_test.go` },
      { label: 'Design notes', href: `${TRIBUN}/blob/main/docs/design.md` },
      { label: 'Group holds', href: `${TRIBUN}/blob/main/internal/postgres/holds.go` },
      { label: 'Group hold tests', href: `${TRIBUN}/blob/main/internal/postgres/group_test.go` },
      { label: 'Organizer queries', href: `${TRIBUN}/blob/main/internal/postgres/admin.go` },
    ],
  },
  {
    slug: 'techhiring',
    title: 'TechHiring.id',
    subtitle: 'Tech job lakehouse',
    year: 2026,
    categories: ['data'],
    palette: { bg: '#d9d4c7', fg: '#1b1a17', accent: '#2d4fa3' },
    headline: { dim: 'Indonesian tech jobs, ', strong: 'cleaned before they are published.' },
    about:
      'A lakehouse that collects tech job postings from five Indonesian portals, checks them in five quality layers, and serves salary and skill insights through a fast read-only API.',
    facts: {
      context: 'Live product',
      work: 'Pipeline design, dbt marts, API, dashboard',
      role: 'Lead Data Engineer & Architect',
      stack: ['DuckDB', 'dbt', 'Python', 'FastAPI', 'Next.js 15', 'Docker'],
    },
    links: { live: 'https://jobs.rifqisetiawan.my.id' },
    cover: '/media/techhiring/cover-1200.webp',
    media: [
      full('/media/techhiring/01.webp', 'TechHiring.id dashboard mockup', 16 / 10),
      full('/media/techhiring/02.webp', 'Salary benchmark boxplots by role', 16 / 10),
      full('/media/techhiring/03.webp', 'Tech stack trends chart', 16 / 10),
    ],
    how: [
      {
        heading: 'Medallion lakehouse',
        body: 'Raw observations from five Indonesian job portals land in Bronze, then become conformed postings in Silver. More than 15,400 raw observations became more than 14,600 conformed postings.',
      },
      {
        heading: 'dbt marts on DuckDB',
        body: 'dbt-duckdb builds the Gold marts. Queries on them answer at a P99 under 25 ms.',
      },
      {
        heading: 'Five-layer data quality',
        body: 'A five-layer framework runs 55 assertions before anything is published.',
      },
      {
        heading: 'Zero-downtime publishing',
        body: 'Each release is read-only and goes live through an atomic symlink swap (Blue/Green). A read-only FastAPI OLAP service with token-bucket rate limiters sits in front, and a Next.js 15 dashboard shows salary boxplots and the skill taxonomy.',
      },
    ],
    architecture: {
      src: '/media/techhiring/architecture.png',
      caption: 'End-to-end lakehouse pipeline: Bronze, Silver, dbt Gold, 5-layer QA, Blue/Green publish.',
    },
    metrics: [
      { value: '14,600+', label: 'conformed postings' },
      { value: '55', label: 'pre-publication assertions' },
      { value: '<25 ms', label: 'P99 query time' },
      { value: '5', label: 'job portals' },
    ],
    code: [],
  },
  {
    slug: 'national-food-lakehouse',
    title: 'National Food Lakehouse',
    subtitle: 'Food price analytics',
    year: 2026,
    categories: ['data'],
    palette: { bg: '#e0d2bb', fg: '#1e1712', accent: '#b23a1d' },
    headline: { dim: 'See food prices move ', strong: 'weeks before the official numbers.' },
    about:
      'A lakehouse of daily commodity prices across 38 provinces. It estimates inflation about three weeks ahead of the monthly figure and flags supply bottlenecks.',
    facts: {
      context: 'Live product',
      work: 'Pipeline design, star schema, API, analytics',
      role: 'Lead Data Engineer & Architect',
      stack: ['DuckDB', 'dbt', 'Python', 'FastAPI', 'Snowflake', 'Docker'],
    },
    links: { live: 'https://food.rifqisetiawan.my.id' },
    cover: '/media/national-food-lakehouse/cover-1200.webp',
    media: [
      full('/media/national-food-lakehouse/01.webp', 'National Food Lakehouse dashboard mockup', 16 / 10),
      full('/media/national-food-lakehouse/02.webp', 'Food price analytics by province', 16 / 10),
      full('/media/national-food-lakehouse/03.webp', 'Inflation simulation view', 16 / 10),
    ],
    how: [
      {
        heading: 'Bronze to Gold',
        body: 'Bronze keeps raw data as ZSTD Parquet. Silver tracks history with SCD Type 2. Gold is a Kimball star schema built with dbt.',
      },
      {
        heading: 'Daily prices, 38 provinces',
        body: '418 daily commodity series from PIHPS Bank Indonesia feed a nowcast of inflation about three weeks ahead of the BPS monthly figure. A Regional Price Disparity Index and a UMR purchasing-power analysis sit on top.',
      },
      {
        heading: 'A quality gate that quarantines',
        body: 'A five-layer gate sends any spike above 30% to a dead-letter queue instead of the marts. FastAPI with DuckDB connection pooling answers at a P99 under 28 ms, and data is staged to Snowflake.',
      },
      {
        heading: 'What users see',
        body: 'A 38-province SVG choropleth, 40 supply-bottleneck alerts, and a Power BI report with 7 DAX measures.',
      },
    ],
    architecture: {
      src: '/media/national-food-lakehouse/architecture.png',
      caption: 'End-to-end lakehouse pipeline: Bronze ZSTD, Silver SCD2, dbt Gold star schema, 5-layer QA, Snowflake and FastAPI.',
    },
    metrics: [
      { value: '38', label: 'provinces' },
      { value: '418', label: 'daily commodity series' },
      { value: '~3 wks', label: 'nowcast ahead of monthly inflation' },
      { value: '<28 ms', label: 'P99 API latency' },
    ],
    code: [],
  },
  {
    slug: 'wellmom',
    title: 'WellMom',
    subtitle: 'Maternal health app',
    year: 2026,
    categories: ['backend', 'ai'],
    palette: { bg: '#e6d6cf', fg: '#22191a', accent: '#b24a6b' },
    headline: { dim: 'Care for mothers, ', strong: 'even when the clinic is far away.' },
    about:
      'A maternal health platform. Mothers in Kerinci, Jambi check their vital signs at home on a mobile app, and a Puskesmas dashboard receives the alerts.',
    facts: {
      context: 'Innovillage 2025, 1st place',
      work: 'Mobile app, backend, AI chatbot',
      role: 'Full-Stack Developer & AI Chatbot',
      stack: ['Flutter', 'FastAPI', 'Next.js', 'PostgreSQL', 'Docker', 'Gemini AI'],
    },
    links: {},
    cover: '/media/wellmom/cover-1200.webp',
    media: [
      full('/media/wellmom/01.webp', 'WellMom mobile app and Puskesmas dashboard mockup', 16 / 10),
      full('/media/wellmom/02.webp', 'WellMom used in the field at a village health center', 1917 / 1078),
    ],
    how: [
      {
        heading: 'The problem',
        body: 'Mothers in Kerinci, Jambi face long trips to reach a Puskesmas, such as Puskesmas Semurup. WellMom lets them screen and self-monitor between visits.',
      },
      {
        heading: 'Screening and triage',
        body: 'The mobile app validates vital signs in real time and applies rule-based triage. Alerts sync to the Puskesmas dashboard so health workers can follow up.',
      },
      {
        heading: 'A Gemini assistant',
        body: 'A chatbot built on Gemini helps with consultation, gives triage guidance and routes emergencies.',
      },
    ],
    architecture: {
      src: '/media/wellmom/architecture.png',
      caption: 'High-level multi-tier cloud architecture.',
    },
    metrics: [{ value: '1st', label: 'place, Innovillage 2025' }],
    code: [],
  },
  {
    slug: 'smokeguard',
    title: 'SmokeGuard',
    subtitle: 'Fire hazard detection',
    year: 2025,
    categories: ['ai'],
    palette: { bg: '#ddd0c8', fg: '#1d1716', accent: '#c0351f' },
    headline: { dim: 'Spot the spark ', strong: 'before it becomes a fire.' },
    about:
      'A computer-vision system that watches camera streams at petrol stations and raises an alert in under a second when it sees cigarettes, smoke or open flames.',
    facts: {
      context: 'Digiwar #1 Computer Vision, 1st place',
      work: 'Custom YOLOv8 model, inference service, Flutter client',
      role: 'Software & Computer Vision Developer',
      stack: ['Flutter', 'Python', 'YOLOv8', 'Flask', 'OpenCV', 'REST API'],
    },
    links: {},
    cover: '/media/smokeguard/cover-1200.webp',
    media: [full('/media/smokeguard/01.webp', 'SmokeGuard mobile app showing detected hazards with bounding boxes', 4 / 3)],
    how: [
      { heading: 'A custom detector', body: 'A YOLOv8 model trained for cigarettes, smoke and open flames.' },
      { heading: 'Streaming inference', body: 'OpenCV and Flask stream video at low latency and run inference on every frame.' },
      { heading: 'Live alerts', body: 'The Flutter client shows real-time alerts with bounding boxes and confidence scores. Hazards at a petrol pump are detected in under a second.' },
    ],
    architecture: {
      src: '/media/smokeguard/architecture.png',
      caption: 'OpenCV and YOLOv8 mark cigarettes in camera frames. Flask sends the annotated video and smoking alerts to the Flutter app.',
    },
    metrics: [
      { value: '<1 s', label: 'hazard detection' },
      { value: '1st', label: 'place, Digiwar #1' },
    ],
    code: [],
  },
  {
    slug: 'tel-u-cup',
    title: 'Tel-U Cup',
    subtitle: 'Tournament operations',
    year: 2025,
    categories: ['backend', 'ai'],
    palette: { bg: '#d6d9cf', fg: '#171a16', accent: '#c1561b' },
    headline: { dim: 'Run a tournament ', strong: 'without the spreadsheets.' },
    about:
      'Teams follow fixtures and knockout brackets, ask the tournament assistant about results, and find their match photos in a personal gallery.',
    facts: {
      context: 'University tournament',
      work: 'Tournament services, RAG chatbot, face-based photo search',
      role: 'Backend Developer & AI Engineer',
      stack: ['Laravel', 'FastAPI', 'LangGraph', 'Gemini', 'InsightFace', 'AdaFace'],
    },
    links: {},
    cover: '/media/tel-u-cup/cover-1200.webp',
    media: [
      full('/media/tel-u-cup/tournament.webp', 'Tournament schedule and results with demo fixtures and scores', 1440 / 1000),
      full('/media/tel-u-cup/rag-chatbot.webp', 'Tel-U Cup AI Assistant with suggested questions about matches, scores, venues and brackets', 1440 / 1000),
      full('/media/tel-u-cup/face-enrollment.webp', 'Player onboarding showing the Enroll Face upload used to find event photos', 1440 / 1000),
      full('/media/tel-u-cup/01.webp', 'Tel-U Cup tournament homepage on a laptop', 4 / 3),
    ],
    how: [
      { heading: 'Whole tournament flow', body: 'Registration, bracket elimination and field verification run in one system.' },
      { heading: 'Match results', body: 'Participants can filter the schedule by date and see opponents, scores and venues for each match. The schedule shown here uses the app’s demo fixtures.' },
      { heading: 'Tournament chatbot', body: 'The chatbot uses retrieval-augmented generation (RAG). It looks up schedules, results or brackets through the tournament API, then uses Gemini to answer with those records.' },
      { heading: 'Find my match photos', body: 'A player enrolls a reference photo. When organizers upload event photos, the system compares the faces with enrolled players. In Foto Saya, the player can confirm or reject each suggested match.' },
    ],
    architecture: {
      src: '/media/tel-u-cup/face-search-flow.png',
      caption: 'How a player’s reference photo and the event photo library come together in Foto Saya, from face matching to player review.',
    },
    metrics: [],
    code: [],
  },
  {
    slug: 'agentic-ai-kms',
    title: 'Agentic AI KMS',
    subtitle: 'Chili farming knowledge system',
    year: 2025,
    categories: ['ai', 'data'],
    palette: { bg: '#dcd8c4', fg: '#1a1b14', accent: '#5d7a1f' },
    headline: { dim: 'Messy farm spreadsheets, ', strong: 'turned into usable knowledge.' },
    about:
      'An agentic pipeline that reads messy agricultural Excel files, aligns them to one schema, and loads clean data into DuckDB and PostgreSQL for a chili farming knowledge system.',
    facts: {
      context: 'Agentic AI for Adaptive Knowledge Acquisition',
      work: 'Agent workflow, data pipeline',
      role: 'Agentic AI & Data Pipeline Engineer',
      stack: ['Python', 'FastAPI', 'DuckDB', 'PostgreSQL', 'Agentic AI', 'Excel engine'],
    },
    links: {},
    cover: '/media/agentic-ai-kms/cover-1200.webp',
    media: [full('/media/agentic-ai-kms/01.webp', 'Chili farming knowledge system dashboard mockup', 4 / 3)],
    how: [
      { heading: 'Agentic workflow', body: 'Agents parse spreadsheet structure, align columns to a shared schema, and run automated quality assertions.' },
      { heading: 'One clean store', body: 'Messy Excel files end up in unified DuckDB and PostgreSQL tables. Anomalies are quarantined instead of loaded.' },
      { heading: 'Traceable', body: 'Audit trails and temporal provenance show where each value came from. Manual cleaning dropped by more than 90%.' },
    ],
    metrics: [{ value: '>90%', label: 'less manual cleaning' }],
    code: [],
  },
  {
    slug: 'partpilot',
    title: 'PartPilot',
    subtitle: 'Spare-part sourcing agent',
    year: 2026,
    categories: ['backend', 'ai'],
    palette: { bg: '#d3d3cd', fg: '#18191a', accent: '#d06a12' },
    headline: { dim: 'Find the right part, ', strong: 'at the right price.' },
    about:
      'An agentic assistant that matches spare parts by description, checks five warehouses, compares vendors, and drafts purchase orders. All demo data is synthetic.',
    facts: {
      context: 'ITB Agentic AI Hackathon 2026',
      work: 'Database, matching logic, sourcing backend',
      role: 'Backend & Data Layer Contributor',
      stack: ['Python', 'FastAPI', 'PostgreSQL', 'Next.js', 'WhatsApp'],
    },
    links: { github: 'https://github.com/Rifqi-Setiawan/partpilot' },
    cover: '/media/partpilot/cover-1200.webp',
    media: [
      full('/media/partpilot/02.png', 'PartPilot flow legend (Indonesian)'),
    ],
    how: [
      {
        heading: 'Data layer',
        body: 'A PostgreSQL schema, a bearing knowledge bundle and warehouse naming rules support description-based spare-part matching.',
      },
      {
        heading: 'Inventory and vendors',
        body: 'The agent checks inventory across five warehouses, compares vendors live and runs one round of negotiation.',
      },
      {
        heading: 'Optional WhatsApp sourcing',
        body: 'Sourcing can run over WhatsApp, and a QR code restores the session.',
      },
      {
        heading: 'Costs and documents',
        body: 'A deterministic Decimal calculation gives the recovery cost. Demo purchase-order PDFs are generated with ReportLab. Data is synthetic, with no real transactions. The web UI is by Hilmi Musyafa.',
      },
    ],
    architecture: {
      src: '/media/partpilot/architecture.png',
      caption: 'PartPilot flow, from part description to purchase order.',
    },
    metrics: [
      { value: '5', label: 'warehouses checked' },
      { value: '1', label: 'round of vendor negotiation' },
    ],
    code: [{ label: 'Repository', href: 'https://github.com/Rifqi-Setiawan/partpilot' }],
  },
];

// The case starts on the same framing as the carousel plane. The remaining
// media keep their native aspect ratios so diagrams and screenshots stay legible.
export const projects: Project[] = entries.map((project) => ({
  ...project,
  media: [full(`/media/${project.slug}/cover-2000.webp`, `${project.title} project cover`), ...project.media],
}));
