import { z } from 'zod';

export const AnnouncementSchema = z.object({
  version: z.number().int().nonnegative(),
  date: z.string().min(1),
  title: z.string().min(1),
  body_md: z.string().default(''),
  dismissible: z.boolean().default(true),
});

export const AnnouncementListSchema = z.union([
  AnnouncementSchema,
  z.array(AnnouncementSchema),
  z.object({
    announcements: z.array(AnnouncementSchema),
  }),
]);

export type Announcement = z.infer<typeof AnnouncementSchema>;

export function normalizeAnnouncementList(input: unknown): Announcement[] {
  const parsed = AnnouncementListSchema.safeParse(input);
  if (!parsed.success) return [];

  if (Array.isArray(parsed.data)) return parsed.data;
  if ('announcements' in parsed.data) return parsed.data.announcements;
  return [parsed.data];
}
