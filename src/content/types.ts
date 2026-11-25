export type Category = 'backend' | 'data' | 'ai';

export type Media = {
  span: 'full' | 'half';
  aspect: number;
  src: string;
  alt: string;
};

export type Project = {
  slug: string;
  title: string;
  subtitle: string;
  year: number;
  categories: Category[];
  palette: { bg: string; fg: string; accent: string };
  headline: { dim: string; strong: string };
  about: string;
  facts: { context: string; work: string; role: string; stack: string[] };
  links: { live?: string; github?: string };
  cover: string;
  media: Media[];
  how: { heading: string; body: string }[];
  architecture?: { src: string; caption: string };
  metrics: { value: string; label: string }[];
  code: { label: string; href: string }[];
};

export type Profile = {
  name: string;
  shortName: string;
  heroLead: [string, string];
  heroRole: [string, string];
  email: string;
  linkedin: string;
  github: string;
  instagram: string;
  location: string;
  timezone: string;
};

export type AboutContent = {
  title: [string, string];
  lead: string;
  numbers: { value: string; label: string }[];
  doing: { num: string; name: string; body: string }[];
  experience: { role: string; org: string; dates: string; body: string }[];
  awards: { title: string; issuer: string; year: number; kind: 'award' | 'certification' }[];
  stack: string[];
  motto: { dim: string; strong: string };
  cta: string;
};

export type SiteContent = { profile: Profile; projects: Project[]; about: AboutContent };
