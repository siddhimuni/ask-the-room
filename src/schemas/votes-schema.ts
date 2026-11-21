import type { CollectionSchema } from 'deepspace/schema'

export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    { name: 'questionId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'voterId', storage: 'text', interpretation: 'plain', userBound: true },
  ],
  uniqueOn: ['questionId', 'voterId'],
  ownerField: 'voterId',
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: {
      read: true,
      create: true,
      update: false,
      delete: 'own',
      writableFields: ['questionId'],
    },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
