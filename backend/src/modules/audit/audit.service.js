import { prisma } from '../../config/db.js';
export const auditService = {
  log: (actorId, action, entity, entityId, metadata = {}, ipAddress = null, db = prisma) =>
    db.auditLog.create({ data: { actorId, action, entity, entityId, metadata, ipAddress } })
};
