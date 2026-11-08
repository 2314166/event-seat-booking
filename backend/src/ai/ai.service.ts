import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AiService {
  private log = new Logger('AiService');

  /** Drafts an event description with Claude when ANTHROPIC_API_KEY is set; otherwise a deterministic template. */
  async draftDescription(i: { name: string; venue: string; date?: string; keywords?: string }): Promise<{ description: string; source: 'ai' | 'template' }> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
            max_tokens: 300,
            messages: [{ role: 'user', content:
              `Write a friendly, engaging 2-3 sentence description for an event listing. No markdown, no title.\n` +
              `Event: ${i.name}\nVenue: ${i.venue}\nDate: ${i.date ?? 'TBA'}\nKeywords: ${i.keywords ?? 'none'}` }],
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          const text = data?.content?.[0]?.text?.trim();
          if (text) return { description: text, source: 'ai' };
        } else this.log.warn(`AI call failed: ${res.status}`);
      } catch (e: any) { this.log.warn(`AI call error: ${e.message}`); }
    }
    const when = i.date ? ` on ${new Date(i.date).toDateString()}` : '';
    const extra = i.keywords ? ` Expect ${i.keywords}.` : '';
    return {
      description: `Join us for ${i.name} at ${i.venue}${when}. Grab your seats early — availability is limited and seats are held for a few minutes while you confirm.${extra}`,
      source: 'template',
    };
  }
}
