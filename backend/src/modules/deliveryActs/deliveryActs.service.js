import crypto from 'crypto';

const assetSnapshot = (asset) => ({
  id: asset.id,
  name: asset.name,
  model: asset.model || null,
  inventoryNumber: asset.inventoryNumber,
  serialNumber: asset.serialNumber || null,
  condition: asset.status === 'ACTIVE' ? 'Yaxshi' : asset.status,
});

const snapshotFor = ({ asset, assets, recipient, creator, department }) => ({
  recipient: {
    id: recipient.id,
    fullName: recipient.fullName,
    passportSeries: recipient.passportSeries || null,
    pinfl: recipient.pinfl || null,
    department: department?.name || recipient.department?.name || null,
  },
  asset: assetSnapshot(asset),
  assets: (assets?.length ? assets : [asset]).map(assetSnapshot),
  creator: {
    id: creator.id,
    fullName: creator.fullName,
  },
});

const value = (input) => input || '________________';

const assetsText = (snapshot) => (snapshot.assets?.length ? snapshot.assets : [snapshot.asset])
  .map((asset, index) => `${index + 1}. ${value(asset.name)} | ${value(asset.model)} | ${value(asset.inventoryNumber)} | ${value(asset.serialNumber)} | ${value(asset.condition || 'Yaxshi')}`)
  .join('\n');

export const buildDeliveryActText = ({ number, snapshot, createdAt = new Date() }) => (
`QURILMANI TOPSHIRISH-QABUL QILISH
DALOLATNOMASI

Dalolatnoma raqami: ${number}
Tuzilgan sana: ${new Date(createdAt).toLocaleDateString('uz-UZ')}

Biz, quyida imzo qo‘yuvchilar, topshiruvchi ${value(snapshot.creator.fullName)} va qabul qiluvchi ${value(snapshot.recipient.fullName)}, ushbu dalolatnomani quyidagilar haqida tuzdik:

1. QABUL QILUVCHI XODIM TO‘G‘RISIDA MA’LUMOT

F.I.Sh.: ${value(snapshot.recipient.fullName)}
Pasport seria raqami: ${value(snapshot.recipient.passportSeries)}
JShShIR: ${value(snapshot.recipient.pinfl)}
Bo‘lim: ${value(snapshot.recipient.department)}

2. TOPSHIRILAYOTGAN QURILMALAR

№ | Qurilma | Model | Inventar raqami | Seriya raqami | Holati
${assetsText(snapshot)}

3. TOMONLARNING TASDIG‘I

Qabul qiluvchi qurilmani ko‘zdan kechirganini, yuqorida ko‘rsatilgan ma’lumotlar to‘g‘riligini hamda qurilmani but holatda qabul qilganini tasdiqlaydi. Qabul qiluvchi qurilmadan belgilangan maqsadda foydalanish va uning saqlanishi uchun javobgarlikni o‘z zimmasiga oladi.

Topshiruvchi: ${value(snapshot.creator.fullName)}
Imzo: ______________________

Qabul qiluvchi: ${value(snapshot.recipient.fullName)}
Imzo: ______________________

Izoh: ____________________________________________________________
__________________________________________________________________`
);

export const createDeliveryAct = async (db, {
  transactionId = null,
  asset,
  assets = null,
  recipient,
  creator,
  department = null,
}) => {
  const snapshot = snapshotFor({ asset, assets, recipient, creator, department });
  const act = await db.deliveryAct.create({
    data: {
      number: `TEMP-${crypto.randomUUID()}`,
      transactionId,
      assetId: asset.id,
      recipientId: recipient.id,
      createdById: creator.id,
      documentText: 'Dalolatnoma shakllantirilmoqda...',
      snapshot,
    },
  });
  const number = `DT-${new Date().getFullYear()}-${String(act.id).padStart(6, '0')}`;
  return db.deliveryAct.update({
    where: { id: act.id },
    data: {
      number,
      documentText: buildDeliveryActText({ number, snapshot, createdAt: act.createdAt }),
    },
  });
};

export const deliveryActInclude = {
  asset: { select: { id: true, name: true, model: true, inventoryNumber: true, serialNumber: true } },
  recipient: { select: { id: true, fullName: true, passportSeries: true, pinfl: true } },
  createdBy: { select: { id: true, fullName: true } },
};
