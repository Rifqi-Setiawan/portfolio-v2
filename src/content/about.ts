import type { AboutContent } from './types';

export const about: AboutContent = {
  title: ['Building software', 'that works.'],
  lead:
    "I'm Rifqi, a software engineer focused on backend systems and AI-powered applications. I build APIs, data workflows, and web applications with Python, FastAPI, PostgreSQL, and Next.js, connecting AI capabilities with the software people actually use.",
  numbers: [
    { value: '8', label: 'projects shipped' },
    { value: '3×', label: '1st place in 2025' },
    { value: '100+', label: 'API test scenarios run' },
    { value: '3.80', label: 'GPA' },
  ],
  doing: [
    { num: '01', name: 'Backend & APIs', body: 'Clear data models, input validation and tests behind every endpoint, in Go, Python and Node.js.' },
    { num: '02', name: 'Data engineering', body: 'Lakehouse pipelines with DuckDB and dbt, with quality gates before anything is published.' },
    { num: '03', name: 'Applied & agentic AI', body: 'AI that fits a working product, with human review where automated decisions need oversight.' },
    { num: '04', name: 'QA automation', body: 'API and microservice test suites in Katalon Studio and Groovy, covering auth, status codes and negative cases.' },
  ],
  experience: [
    {
      role: 'Quality Assurance Intern',
      org: 'PT XLSMART Telecom Sejahtera Tbk',
      dates: 'Jun 2026 – Present',
      body: 'System integration testing for REST services across 10+ core production services. Automate and maintain 80+ API test scenarios across 15+ endpoints with Katalon Studio and Groovy.',
    },
    {
      role: 'Mobile Developer Intern',
      org: 'Humic Engineering',
      dates: 'Aug 2025 – Dec 2025',
      body: 'Built TumbuhKita, a Flutter app that helps community health centers and mothers monitor child growth, with REST API sync and GetX state management.',
    },
  ],
  awards: [
    { title: '1st Place, Innovillage 2025 (Social Tech Innovation)', issuer: 'Innovillage / Telkom Indonesia', year: 2025, kind: 'award' },
    { title: '1st Place, ADIKARA Innovation Division', issuer: 'ADIKARA National Competition', year: 2025, kind: 'award' },
    { title: '1st Place, Digiwar #1 Computer Vision', issuer: 'Digiwar Hackathon', year: 2025, kind: 'award' },
    { title: 'Associate Data Scientist', issuer: 'BNSP', year: 2026, kind: 'certification' },
    { title: 'Associate Data Engineer in SQL', issuer: 'DataCamp', year: 2026, kind: 'certification' },
    { title: 'Data Analyst Associate', issuer: 'DataCamp', year: 2026, kind: 'certification' },
    { title: 'Data Science', issuer: 'Digital Skola', year: 2026, kind: 'certification' },
  ],
  stack: [
    'Python', 'Go', 'TypeScript', 'JavaScript', 'Java', 'PHP', 'FastAPI', 'Flask', 'Node JS', 'Laravel',
    'Next JS', 'React JS', 'Flutter', 'PostgreSQL', 'MySQL', 'Supabase', 'Prisma', 'DuckDB', 'dbt', 'Docker',
    'Tailwind CSS', 'Shadcn UI', 'Katalon Studio', 'Groovy', 'k6', 'Postman', 'Git', 'GitHub', 'Vercel', 'Cloudflare', 'Figma',
  ],
  motto: { dim: "Open to software and AI engineering roles.", strong: "Let's build useful software." },
  cta: "Something to build? Let's make it work.",
};
