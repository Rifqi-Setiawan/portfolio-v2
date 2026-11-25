import type { SiteContent } from '../content/types';
import { pathFromState, titleFor, type State } from './routes';

export function pageMetadata(state: State, c: SiteContent, origin: string): { title: string; description: string; url: string } {
  let description: string;
  switch (state.kind) {
    case 'hero': description = `${c.profile.name} builds backend systems, data pipelines and AI-powered applications.`; break;
    case 'portfolio': description = `Explore ${c.projects.length} software, data and applied AI projects by ${c.profile.name}, with architecture, results and implementation notes.`; break;
    case 'about': description = `Meet ${c.profile.name}, a software engineer building APIs, data workflows and AI applications. Read about his experience, awards and technical work.`; break;
    case 'contacts': description = `Contact ${c.profile.name} about software and AI engineering roles or projects by email, LinkedIn or Instagram.`; break;
    case 'case': {
      const project = c.projects.find(p => p.slug === state.slug);
      if (!project) return pageMetadata({ kind: 'portfolio' }, c, origin);
      description = `${project.title}. ${project.headline.dim}${project.headline.strong} ${project.subtitle}.`;
      break;
    }
  }
  return { title: titleFor(state, c), description, url: origin + pathFromState(state) };
}
