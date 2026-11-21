import type { CollectionSchema } from 'deepspace/schema'

export const questionsSchema: CollectionSchema = {
  name: 'questions',
  columns: [
    { name: 'body', storage: 'text', interpretation: 'plain', required: true, maxLength: 280 },
    {
      name: 'status',
      storage: 'text',
      interpretation: { kind: 'select', options: ['pending', 'approved', 'hidden'] },
      default: 'pending',
    },
    { name: 'answered', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'pinned', storage: 'number', interpretation: 'plain', default: 0 },
    // Why the host hid the question: duplicate, abusive, off-topic, or other.
    // Only admins can write it (members' writableFields is just `body`).
    { name: 'hideReason', storage: 'text', interpretation: 'plain', maxLength: 20 },
  ],
  visibilityField: { field: 'status', value: 'approved' },
  permissions: {
    '*': { read: 'published', create: false, update: false, delete: false },
    viewer: { read: 'published', create: false, update: false, delete: false },
    member: {
      read: 'published',
      create: true,
      update: false,
      delete: 'own',
      writableFields: ['body'],
    },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
