import { about } from './about';
import { profile } from './profile';
import { projects } from './projects';
import type { SiteContent } from './types';

export const content: SiteContent = { profile, projects, about };
export type * from './types';
