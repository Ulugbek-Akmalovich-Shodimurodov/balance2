import { prisma } from '../../config/db.js';
export const assetRepository = {
  async list({ search, status, departmentId, assetTypeId, assignedUserId, assignment, organizationId, page = 1, limit = 10 }) {
    const assignmentFilter = assignedUserId
      ? { assignedUserId: Number(assignedUserId) }
      : assignment === 'assigned'
        ? { assignedUserId: { not: null } }
        : assignment === 'unassigned'
          ? { assignedUserId: null }
          : {};
    const yearSearch = /^\d{4}$/.test(String(search || '')) ? Number(search) : null;
    const where = { AND: [search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { model: { contains: search, mode: 'insensitive' } }, { inventoryNumber: { contains: search, mode: 'insensitive' } }, ...(yearSearch ? [{ manufactureYear: yearSearch }] : [])] } : {}, status ? { status } : {}, departmentId ? { departmentId: Number(departmentId) } : {}, organizationId ? { department: { organizationId: Number(organizationId) } } : {}, assetTypeId ? { assetTypeId: Number(assetTypeId) } : {}, assignmentFilter] };
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([prisma.asset.findMany({ where, skip, take: Number(limit), include: { assetType:true, department:true, assignedUser:{ select:{ id:true, fullName:true } } }, orderBy:{ createdAt:'desc' } }), prisma.asset.count({ where })]);
    return { items, total, page: Number(page), limit: Number(limit) };
  },
  get: (id) => prisma.asset.findUnique({ where:{ id:Number(id) }, include:{ assetType:true, department:true, assignedUser:true, transactions:true, maintenanceLogs:true } }),
  types: () => prisma.assetType.findMany({ orderBy: { name: 'asc' } }),
  create: (data) => prisma.asset.create({ data }),
  createBatch: (items) => prisma.$transaction((tx) => Promise.all(items.map((data) => tx.asset.create({ data })))),
  update: (id, data) => prisma.asset.update({ where:{ id:Number(id) }, data }),
  remove: (id) => prisma.asset.delete({ where:{ id:Number(id) } })
};
