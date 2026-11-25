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
    cover: '/media/tribunpass/cover-1200.webp?v=e599db053b63',
    media: [
      full('/media/tribunpass/ticket-office.webp', 'TribunPass ticket office showing Reguler and VIP availability for the Nusantara Cup Final', 1836 / 1180),
      full('/media/tribunpass/02.webp', 'TribunPass checkout with a five-minute payment countdown for two tickets', 16 / 10),
      full('/media/tribunpass/03.webp', 'TribunPass organizer dashboard showing sales and capacity', 16 / 10),
    ],
    how: [
      {
        heading: 'A two-ticket checkout',
        body: 'In the demo, a fan books 2 Reguler tickets at Rp75,000 each. Stock drops from 10 to 8, and the fan has 5 minutes to pay Rp150,000. A successful simulated payment issues two tickets, each with its own QR code.',
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
    architecture: {
      src: '/media/tribunpass/ticket-flow.png',
      caption: 'A two-ticket reservation from stock check to settlement. Payment issues both e-tickets, while expiry releases both places back into stock.',
    },
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
      'CABAI-KMS turns field spreadsheets into a standard workbook of chili traits by variety. Researchers can review uncertain matches and include plant photos from Google Drive.',
    facts: {
      context: 'Agentic AI for Adaptive Knowledge Acquisition',
      work: 'Agent workflow, data pipeline',
      role: 'Agentic AI & Data Pipeline Engineer',
      stack: ['Python', 'Streamlit', 'LangGraph', 'openpyxl', 'SQLite', 'PostgreSQL'],
    },
    links: {},
    cover: '/media/agentic-ai-kms/cover-1200.webp?v=c46bd9a767d8',
    media: [
      full('/media/agentic-ai-kms/result-inspector.webp', 'Inspektor Hasil showing 10 accepted attribute mappings and 3 awaiting human review in one evaluation run', 1600 / 1100),
    ],
    how: [
      { heading: 'Match field labels', body: 'LangGraph starts by reading the worksheet. Exact names and known aliases map directly. For other labels, the system retrieves candidate attributes and asks a language model to rank them.' },
      { heading: 'Review uncertain matches', body: 'The verifier checks each mapping before values are written. In Inspektor Hasil, a reviewer can accept a suggestion, choose a different attribute or mark it as unmatched.' },
      { heading: 'Add plant photos', body: 'If a Google Drive folder is supplied and images are found, the vision step identifies the variety and plant part. Eligible image links are added to the exported Excel workbook.' },
    ],
    architecture: {
      src: '/media/agentic-ai-kms/agent-workflow.png',
      caption: 'How LangGraph maps field labels to chili traits, routes uncertain matches for review, and optionally adds plant photos to the workbook.',
    },
    metrics: [{ value: '>90%', label: 'less manual cleaning' }],
    code: [{ label: 'LangGraph workflow', href: 'https://github.com/Rifqi-Setiawan/AgenticAI_CabaiKMS/blob/0975bdac67c74eabf042248e5eefbcbd4466a208/src/orchestrator/graph.py#L181' }],
  },
];

// The case starts on the same framing as the carousel plane. The remaining
// media keep their native aspect ratios so diagrams and screenshots stay legible.
export const projects: Project[] = entries.map((project) => ({
  ...project,
  media: [full(project.cover.replace('-1200.webp', '-2000.webp'), `${project.title} project cover`), ...project.media],
}));
