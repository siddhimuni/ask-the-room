/**
 * Admin Feature - Schema
 *
 * Admin-only settings collection for key-value app configuration.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const settingsSchema: CollectionSchema = {
  name: 'settings',
  columns: [
    { name: 'key', storage: 'text', interpretation: 'plain' },
    { name: 'value', storage: 'text', interpretation: 'plain' },
  ],
  // Visitors and members can read settings (the session topic is shown on the
  // board). Only admins can create, change, or delete them.
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
