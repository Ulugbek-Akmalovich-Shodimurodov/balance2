import { prisma } from '../../config/db.js';
export const auditService = {
  log: (actorId, action, entity, entityId, metadata = {}, ipAddress = null) =>
    prisma.auditLog.create({ data: { actorId, action, entity, entityId, metadata, ipAddress } })
};
