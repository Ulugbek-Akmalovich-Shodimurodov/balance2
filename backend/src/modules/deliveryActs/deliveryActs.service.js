import crypto from 'crypto';

const assetSnapshot = (asset) => ({
  id: asset.id,
  name: asset.name,
  model: asset.model || null,
  inventoryNumber: asset.inventoryNumber,
  manufactureYear: asset.manufactureYear || null,
  condition: asset.status === 'ACTIVE' ? 'Yaxshi' : asset.status,
});

const personSnapshot = (person, departmentPath = null) => person ? ({
  id: person.id,
  fullName: person.fullName,
  position: person.departmentPosition?.position?.name || null,
  department: departmentPath || person.department?.name || null,
}) : null;

const resolveDepartmentContext = async (db, departmentId) => {
  if (!departmentId) return { path: null, organizationId: null };
  const names = [];
  let currentId = Number(departmentId);
  let organizationId = null;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const item = await db.department.findUnique({
      where: { id: currentId },
      select: { name: true, parentId: true, organizationId: true },
    });
    if (!item) break;
    names.unshift(item.name);
    organizationId ||= item.organizationId;
    currentId = item.parentId;
  }
  return { path: names.join(' — ') || null, organizationId };
};

const snapshotFor = async (db, { asset, assets, recipient, creator, engineer, department }) => {
  const [recipientContext, creatorContext, engineerContext] = await Promise.all([
    resolveDepartmentContext(db, department?.id || recipient.departmentId),
    resolveDepartmentContext(db, creator.departmentId),
    resolveDepartmentContext(db, engineer?.departmentId),
  ]);
  const organizationId = recipientContext.organizationId || creatorContext.organizationId;
  const organization = organizationId
    ? await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } })
    : null;
  return ({
  organization,
  recipient: {
    id: recipient.id,
    fullName: recipient.fullName,
    passportSeries: recipient.passportSeries || null,
    pinfl: recipient.pinfl || null,
    position: recipient.departmentPosition?.position?.name || null,
    department: recipientContext.path || department?.name || recipient.department?.name || null,
  },
  asset: assetSnapshot(asset),
  assets: (assets?.length ? assets : [asset]).map(assetSnapshot),
  creator: {
    id: creator.id,
    fullName: creator.fullName,
    position: creator.departmentPosition?.position?.name || null,
    department: creatorContext.path || creator.department?.name || null,
  },
  engineer: personSnapshot(engineer, engineerContext.path),
  templateVersion: 19,
  });
};

const value = (input) => input || '________________';

const assetsText = (snapshot) => (snapshot.assets?.length ? snapshot.assets : [snapshot.asset])
  .map((asset, index) => `${index + 1}. ${value(asset.name)} | ${value(asset.model)} | ${value(asset.inventoryNumber)} | ${value(asset.manufactureYear)} | ${value(asset.condition || 'Yaxshi')}`)
  .join('\n');

export const buildDeliveryActText = ({ number, snapshot, createdAt = new Date() }) => (
`№: ${number}

D A L O L A T N O M A
Moddiy qimmatliklarni topshirish va qabul qilish to‘g‘risida

Tuzilgan sana: ${new Date(createdAt).toLocaleDateString('uz-UZ')}

${value(snapshot.organization?.name)}ning ${value(snapshot.creator?.department)} ${value(snapshot.creator?.position)} ${value(snapshot.creator?.fullName)} hamda ${value(snapshot.engineer?.position || 'TB va XK muhandisi')} ${value(snapshot.engineer?.fullName)} tomonidan ${value(snapshot.recipient?.department)} ${value(snapshot.recipient?.position)} ${value(snapshot.recipient?.fullName)}ga quyidagi qurilma va moddiy qimmatliklar xizmatda foydalanish uchun topshirdi.

Eslatma: Qurilma va moddiy qimmatliklarni qabul qilib olgan foydalanuvchi mol-mulklarning butligini saqlashi, tejamkor munosabatda bo‘lishi, qabul qilib olingan qurilmalarni mas’ul xodimning ruxsatisiz boshqa xodimlarga yoki uchinchi shaxslarga foydalanish uchun topshirmasligi, qurilmalardan foydalanishda xavfsizlik va texnik foydalanish qoidalariga rioya qilishi lozim.

Moddiy qimmatliklar yo‘qolgan, kam chiqqan yoki qasddan shikast yetkazilganligi aniqlangan hollarda yetkazilgan zararni qonunchilikda belgilangan tartibda qoplashi bo‘yicha to‘liq moddiy javobgarlikni o‘z zimmasiga oladi.

Moddiy qimmatliklar ro‘yxati:

№ | Qurilma | Model | Inventar raqami | Yili | Holati
${assetsText(snapshot)}

3. TOMONLARNING TASDIG‘I

Qabul qiluvchi qurilmani ko‘zdan kechirganini, yuqorida ko‘rsatilgan ma’lumotlar to‘g‘riligini hamda qurilmani but holatda qabul qilganini tasdiqlaydi. Qabul qiluvchi qurilmadan belgilangan maqsadda foydalanish va uning saqlanishi uchun javobgarlikni o‘z zimmasiga oladi.

Topshiruvchi: ${value(snapshot.creator.fullName)}
Imzo: ______________________

Yetkazdi va o‘rnatdi: ${value(snapshot.engineer?.fullName)}
Lavozimi: ${value(snapshot.engineer?.position || 'TB va XK muhandisi')}
Imzo: ______________________

Qabul qiluvchi: ${value(snapshot.recipient.fullName)}
Imzo: ______________________`
);

export const buildReturnActText = ({ number, snapshot, createdAt = new Date() }) => (
`QURILMALARNI QAYTARISH
DALOLATNOMASI

№: ${number}
Tuzilgan sana: ${new Date(createdAt).toLocaleDateString('uz-UZ')}

Biz, quyida imzo qo‘yuvchilar, qurilmalarni qaytaruvchi ${value(snapshot.recipient.fullName)}, ularni tekshirib omborxonaga yetkazuvchi ${value(snapshot.engineer?.fullName)} va qabul qiluvchi ${value(snapshot.creator.fullName)}, ushbu dalolatnomani quyidagilar haqida tuzdik:

1. QURILMALARNI QAYTARUVCHI XODIM

F.I.Sh.: ${value(snapshot.recipient.fullName)}
Pasport seria raqami: ${value(snapshot.recipient.passportSeries)}
JShShIR: ${value(snapshot.recipient.pinfl)}
Lavozimi: ${value(snapshot.recipient.position)}
Bo‘lim: ${value(snapshot.recipient.department)}

2. QAYTARILAYOTGAN QURILMALAR

№ | Qurilma | Model | Inventar raqami | Yili | Holati
${assetsText(snapshot)}

${snapshot.assets?.some((asset) => asset.damageNote)
    ? `Aniqlangan shikastlar:\n${snapshot.assets.filter((asset) => asset.damageNote).map((asset) => `- ${asset.inventoryNumber}: ${asset.damageNote}`).join('\n')}`
    : 'Tekshiruv izohi: shikast qayd etilmagan.'}

3. QABUL QILISH JOYI

Qurilmalar ${value(snapshot.destination?.name)}ga qaytariladi.

4. TOMONLARNING TASDIG‘I

Xodim yuqorida ko‘rsatilgan qurilmalarni topshirganini, qabul qiluvchi esa ularni ko‘zdan kechirib qabul qilganini tasdiqlaydi. Dalolatnoma imzolangach qurilmalar xodim hisobidan chiqarilib, qabul qilish joyiga o‘tkaziladi.

Qaytaruvchi xodim: ${value(snapshot.recipient.fullName)}
Imzo: ______________________

Tekshirdi va omborxonaga yetkazdi: ${value(snapshot.engineer?.fullName)}
Lavozimi: ${value(snapshot.engineer?.position || 'TB va XK muhandisi')}
Imzo: ______________________

Qabul qiluvchi: ${value(snapshot.creator.fullName)}
Imzo: ______________________

Qabulni tasdiqlagan mas’ul: ${value(snapshot.acceptor?.fullName)}
Imzo: ______________________`
);

export const createDeliveryAct = async (db, {
  transactionId = null,
  asset,
  assets = null,
  recipient,
  creator,
  engineer,
  department = null,
}) => {
  const snapshot = await snapshotFor(db, { asset, assets, recipient, creator, engineer, department });
  const act = await db.deliveryAct.create({
    data: {
      number: `TEMP-${crypto.randomUUID()}`,
      transactionId,
      assetId: asset.id,
      recipientId: recipient.id,
      createdById: creator.id,
      engineerId: engineer.id,
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

export const createCurrentInventoryDeliveryAct = async (db, {
  recipientId,
  creatorId,
}) => {
  const [recipient, creator, assets, previousActs] = await Promise.all([
    db.user.findUnique({
      where: { id: Number(recipientId) },
      include: { department: true, departmentPosition: { include: { position: true } } },
    }),
    db.user.findUnique({
      where: { id: Number(creatorId) },
      include: { department: true, departmentPosition: { include: { position: true } } },
    }),
    db.asset.findMany({
      where: { assignedUserId: Number(recipientId) },
      orderBy: { id: 'asc' },
    }),
    db.deliveryAct.findMany({
      where: {
        recipientId: Number(recipientId),
        status: { in: ['DRAFT', 'AWAITING_ENGINEER', 'PENDING', 'AWAITING_ACCEPTANCE', 'REVISION_REQUESTED'] },
      },
      select: { id: true, engineerId: true, snapshot: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const assignmentActs = previousActs.filter((act) => act.snapshot?.type !== 'RETURN');
  if (assignmentActs.length) {
    await db.deliveryAct.updateMany({
      where: { id: { in: assignmentActs.map((act) => act.id) } },
      data: { status: 'CANCELLED' },
    });
  }
  if (!recipient || !creator || !assets.length) return null;

  const preferredEngineerId = assignmentActs.find((act) => act.engineerId)?.engineerId;
  let engineer = preferredEngineerId
    ? await db.user.findUnique({
      where: { id: preferredEngineerId },
      include: { department: true, departmentPosition: { include: { position: true } } },
    })
    : null;
  if (!engineer || engineer.department?.organizationId !== recipient.department?.organizationId) {
    engineer = await db.user.findFirst({
      where: {
        department: { organizationId: recipient.department?.organizationId },
        departmentPosition: { position: { name: { equals: 'TB va XK muhandisi', mode: 'insensitive' } } },
      },
      include: { department: true, departmentPosition: { include: { position: true } } },
    });
  }
  if (!engineer) throw new Error('Tashkilotda TB va XK muhandisi tayinlanmagan');

  return createDeliveryAct(db, {
    asset: assets[0],
    assets,
    recipient,
    creator,
    engineer,
    department: recipient.department,
  });
};

export const createReturnDeliveryAct = async (db, {
  assets,
  recipient,
  creator,
  engineer,
  department,
  destination,
  pending = false,
}) => {
  const snapshot = {
    ...(await snapshotFor(db, {
      asset: assets[0],
      assets,
      recipient,
      creator,
      engineer,
      department,
    })),
    type: 'RETURN',
    templateVersion: 19,
    destination: {
      id: destination.id,
      name: destination.name,
    },
  };
  const act = await db.deliveryAct.create({
    data: {
      number: `TEMP-${crypto.randomUUID()}`,
      assetId: assets[0].id,
      recipientId: recipient.id,
      createdById: creator.id,
      engineerId: engineer.id,
      status: pending ? 'PENDING' : 'DRAFT',
      sentAt: pending ? new Date() : null,
      documentText: 'Dalolatnoma shakllantirilmoqda...',
      snapshot,
    },
  });
  const number = `DQ-${new Date().getFullYear()}-${String(act.id).padStart(6, '0')}`;
  return db.deliveryAct.update({
    where: { id: act.id },
    data: {
      number,
      documentText: buildReturnActText({ number, snapshot, createdAt: act.createdAt }),
    },
  });
};

export const rebuildDeliveryActSnapshot = async (db, act) => {
  const assetIds = [...new Set(
    (act.snapshot?.assets?.length ? act.snapshot.assets : [act.snapshot?.asset])
      .map((asset) => Number(asset?.id))
      .filter(Number.isInteger),
  )];
  const [recipient, creator, engineer, assets] = await Promise.all([
    db.user.findUnique({ where: { id: act.recipientId }, include: { department: true, departmentPosition: { include: { position: true } } } }),
    db.user.findUnique({ where: { id: act.createdById }, include: { department: true, departmentPosition: { include: { position: true } } } }),
    act.engineerId ? db.user.findUnique({ where: { id: act.engineerId }, include: { department: true, departmentPosition: { include: { position: true } } } }) : null,
    db.asset.findMany({ where: { id: { in: assetIds } }, orderBy: { id: 'asc' } }),
  ]);
  if (!recipient || !creator || !engineer || !assets.length) return act.snapshot;
  const base = await snapshotFor(db, {
    asset: assets[0],
    assets,
    recipient,
    creator,
    engineer,
    department: recipient.department,
  });
  const previousAssets = new Map((act.snapshot?.assets || []).map((asset) => [Number(asset.id), asset]));
  return {
    ...act.snapshot,
    ...base,
    assets: base.assets.map((asset) => ({
      ...asset,
      ...(previousAssets.get(Number(asset.id))?.damageNote ? { damageNote: previousAssets.get(Number(asset.id)).damageNote } : {}),
    })),
    type: act.snapshot?.type,
    destination: act.snapshot?.destination,
    revisions: act.snapshot?.revisions,
    acceptor: act.snapshot?.acceptor,
    templateVersion: 19,
  };
};

export const deliveryActInclude = {
  asset: { select: { id: true, name: true, model: true, inventoryNumber: true, manufactureYear: true } },
  recipient: { select: { id: true, fullName: true, passportSeries: true, pinfl: true } },
  createdBy: { select: { id: true, fullName: true } },
  acceptedBy: { select: { id: true, fullName: true } },
  engineer: { select: { id: true, fullName: true, departmentPosition: { include: { position: true } } } },
};
