import type { FC } from 'hono/jsx';
import { Layout } from '../../layout.js';

export interface LegalProps {
  title: string;
  lastUpdated: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
}

export const LegalView: FC<LegalProps> = ({ title, lastUpdated, sections }) => {
  return (
    <Layout title={`${title} - OrbitPing`} activePath="/legal">

      <div style="padding-top: 3.5rem; padding-bottom: 5rem; max-width: 800px;">
        <h1 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 0.5rem;">
          {title}
        </h1>
        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 2.5rem;">
          Last updated: {lastUpdated}
        </div>

        <div style="display: flex; flex-direction: column; gap: 2rem;">
          {sections.map((section) => (
            <section>
              <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.75rem;">
                {section.heading}
              </h2>
              <p style="color: var(--text-secondary); font-size: 0.9375rem; line-height: 1.7; margin: 0; white-space: pre-line;">
                {section.content}
              </p>
            </section>
          ))}
        </div>
      </div>
    </Layout>
  );
};
