import QRCode from 'qrcode';
import { ApiError } from '../../utils/apiError.js';
import { assetRepository } from './assets.repository.js';
import { auditService } from '../audit/audit.service.js';
import { prisma } from '../../config/db.js';

const prepareAssignment = async (data) => {
  if (!Object.prototype.hasOwnProperty.call(data, 'departmentId')) return {};
  const departmentId = data.departmentId ? Number(data.departmentId) : null;
  const department = departmentId ? await prisma.department.findUnique({ where: { id: departmentId } }) : null;
  const isWarehouse = department?.name?.trim().toLocaleLowerCase() === 'omborxona';
  return {
    departmentId,
    assignedUserId: isWarehouse ? null : (data.assignedUserId ? Number(data.assignedUserId) : null)
  };
};
export const assetService = {
  list: assetRepository.list,
  async get(id) { const asset = await assetRepository.get(id); if (!asset) throw new ApiError(404, 'Aktiv topilmadi'); return asset; },
  types: assetRepository.types,
  async create(data, actorId, ipAddress) {
    if (!Array.isArray(data.items) || data.items.length === 0) {
      const assignment = await prepareAssignment(data);
      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.asset.create({ data: { ...data, ...assignment } });
        await auditService.log(actorId, 'ASSET_CREATE', 'Asset', created.id, created, ipAddress, tx);
        return created;
      });
      return { items: [item], count: 1 };
    }

    const name = data.name?.trim();
    const model = data.model?.trim();
    if (!name || !model) throw new ApiError(400, 'Qurilma nomi va modeli majburiy');
    const inventoryNumbers = data.items.map((item) => item.inventoryNumber?.trim());
    if (inventoryNumbers.some((value) => !value) || new Set(inventoryNumbers).size !== inventoryNumbers.length) {
      throw new ApiError(400, 'Inventar raqamlari bo‘sh yoki takrorlangan');
    }

    const existingAssets = await prisma.asset.findMany({
      where: { inventoryNumber: { in: inventoryNumbers } },
      select: { inventoryNumber: true }
    });
    if (existingAssets.length) {
      throw new ApiError(409, `Inventar raqami allaqachon mavjud: ${existingAssets.map((item) => item.inventoryNumber).join(', ')}`);
    }

    const assignment = await prepareAssignment(data);
    const createData = data.items.map((item) => ({
      name,
      model,
      inventoryNumber: item.inventoryNumber.trim(),
      serialNumber: item.serialNumber?.trim() || null,
      ...assignment,
      imageUrl: data.imageUrl?.trim() || null,
    }));
    const items = await prisma.$transaction(async (tx) => {
      const created = await Promise.all(createData.map((item) => tx.asset.create({ data: item })));
      await Promise.all(created.map((item) =>
        auditService.log(actorId, 'ASSET_CREATE', 'Asset', item.id, item, ipAddress, tx)
      ));
      return created;
    });
    return { items, count: items.length };
  },
  async update(id, data, actorId, ipAddress) {
    const assignment = await prepareAssignment(data);
    let item;
    if (data.status === 'DISPOSED') {
      const [current, warehouse] = await Promise.all([
        this.get(id),
        prisma.department.findFirst({ where: { name: { equals: 'Omborxona', mode: 'insensitive' } } })
      ]);
      if (!warehouse) throw new ApiError(400, 'Omborxona bo‘limi topilmadi');
      item = await prisma.$transaction(async (tx) => {
        const updated = await tx.asset.update({
          where: { id: Number(id) },
          data: { ...data, ...assignment, departmentId: warehouse.id, assignedUserId: null }
        });
        await tx.transaction.create({
          data: {
            assetId: updated.id,
            fromUserId: current.assignedUserId,
            actorId,
            fromDepartmentId: current.departmentId,
            toDepartmentId: warehouse.id,
            type: 'RETURN',
            note: 'Foydalanishdan chiqarilib, Omborxonaga o‘tkazildi'
          }
        });
        await auditService.log(actorId, 'ASSET_UPDATE', 'Asset', updated.id, data, ipAddress, tx);
        return updated;
      });
    } else {
      item = await prisma.$transaction(async (tx) => {
        const updated = await tx.asset.update({
          where: { id: Number(id) },
          data: { ...data, ...assignment }
        });
        await auditService.log(actorId, 'ASSET_UPDATE', 'Asset', updated.id, data, ipAddress, tx);
        return updated;
      });
    }
    return item;
  },
  async remove(id, actorId, ipAddress) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.asset.findUnique({ where: { id: Number(id) } });
      if (!item) throw new ApiError(404, 'Aktiv topilmadi');
      await auditService.log(actorId, 'ASSET_DELETE', 'Asset', item.id, { objectName: item.model || item.name }, ipAddress, tx);
      return tx.asset.delete({ where: { id: item.id } });
    });
  },
  async qr(id) { await this.get(id); return QRCode.toDataURL(`${process.env.CLIENT_URL || 'http://localhost:5173'}/assets/${id}`); }
};
