import React, { useEffect, useState } from 'react';
import { CheckCircleFilled, DeleteOutlined, EditOutlined, ExclamationCircleFilled, FileExcelOutlined, FileZipOutlined, InboxOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopFilled, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload, message } from 'antd';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api, downloadFile } from '../api/client.js';
import AssetInventoryLink from '../components/AssetInventoryLink.jsx';
import SafeImage from '../components/SafeImage.jsx';
import UserNameLink from '../components/UserNameLink.jsx';

const statusOptions = [
  { value: 'ACTIVE', label: 'Faol / foydalanishga tayyor' },
  { value: 'BROKEN', label: 'Nosoz' },
  { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' }
];

const statusMeta = {
  ACTIVE: { label: 'Faol', icon: CheckCircleFilled, className: 'asset-status-active' },
  BROKEN: { label: 'Nosoz', icon: ExclamationCircleFilled, className: 'asset-status-broken' },
  DISPOSED: { label: 'Foydalanishdan chiqarilgan', icon: StopFilled, className: 'asset-status-disposed' }
};

const AssetStatus = ({ status }) => {
  const item = statusMeta[status] || { label: status || 'Noma’lum', icon: ExclamationCircleFilled, className: 'asset-status-unknown' };
  const Icon = item.icon;
  return <span className={`asset-status-pill ${item.className}`}><Icon />{item.label}</span>;
};

export default function AssetsPage() {
  const currentUser = useSelector((state) => state.auth.user);
  const canManageAssets = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(currentUser?.role);
  const [data, setData] = useState({ items: [], total: 0 });
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState();
  const [importImages, setImportImages] = useState();
  const [importPreview, setImportPreview] = useState();
  const [importBusy, setImportBusy] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [filters, setFilters] = useState({ page: 1, limit: 10 });
  const [searchInput, setSearchInput] = useState('');
  const [baseInventory, setBaseInventory] = useState('');
  const createDepartmentId = Form.useWatch('departmentId', createForm);
  const editDepartmentId = Form.useWatch('departmentId', editForm);

  const load = () => api.get('/assets', { params: filters }).then((response) => setData(response.data));
  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    api.get('/users').then((response) => setUsers(response.data));
    api.get('/departments').then((response) => setDepartments(response.data));
    api.get('/assets/types').then((response) => setAssetTypes(response.data));
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput.trim() || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const departmentById = (id) => departments.find((department) => department.id === id);
  const isWarehouse = (id) => departmentById(id)?.name?.trim().toLocaleLowerCase() === 'omborxona';
  const availableUsers = (departmentId) => users
    .filter((user) => !departmentId || user.department?.id === departmentId)
    .map((user) => ({ value: user.id, label: user.fullName }));
  const departmentOptions = departments.map((department) => ({ value: department.id, label: department.name }));
  const assetTypeOptions = assetTypes.map((type) => ({ value: type.id, label: type.name }));
  const userOptions = users.map((user) => ({ value: user.id, label: user.fullName }));
  const hasFilters = Boolean(searchInput || filters.status || filters.departmentId || filters.assetTypeId || filters.assignedUserId || filters.assignment);
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const resetFilters = () => {
    setSearchInput('');
    setFilters((current) => ({ page: 1, limit: current.limit }));
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportFile(undefined);
    setImportImages(undefined);
    setImportPreview(undefined);
  };
  const uploadImport = async (commit = false) => {
    if (!importFile) return message.warning('Excel faylini tanlang');
    const body = new FormData();
    body.append('file', importFile);
    if (importImages) body.append('images', importImages);
    setImportBusy(true);
    try {
      const response = await api.post(`/assets/import${commit ? '?commit=true' : ''}`, body);
      if (commit) {
        message.success(`${response.data.imported} ta qurilma va ${response.data.importedImages || 0} ta rasm import qilindi`);
        closeImport();
        load();
      } else {
        setImportPreview(response.data);
        if (response.data.summary.invalid === 0) message.success('Fayl tekshirildi, importga tayyor');
      }
    } catch (error) {
      const details = error.response?.data?.details;
      if (details) setImportPreview(details);
      message.error(error.response?.data?.message || 'Excel faylini qayta ishlab bo‘lmadi');
    } finally {
      setImportBusy(false);
    }
  };

  const uploadImage = (form) => async ({ file, onSuccess, onError }) => {
    const body = new FormData(); body.append('image', file);
    try {
      const response = await api.post('/assets/upload-image', body);
      form.setFieldValue('imageUrl', response.data.imageUrl);
      onSuccess?.(response.data); message.success('Rasm yuklandi');
    } catch (error) { onError?.(error); message.error(error.response?.data?.message || 'Rasmni yuklab bo‘lmadi'); }
  };

  const inventoryFor = (index) => baseInventory ? (index === 0 ? baseInventory : `${baseInventory}/${index + 1}`) : '';
  const closeCreate = () => { setCreateOpen(false); setBaseInventory(''); createForm.resetFields(); };
  const createAssets = async (values) => {
    if (!baseInventory.trim()) return message.error('Birinchi inventar raqamini kiriting');
    try {
      const response = await api.post('/assets', {
        name: values.name, model: values.model, departmentId: values.departmentId,
        assignedUserId: isWarehouse(values.departmentId) ? null : (values.assignedUserId || null),
        status: values.status || 'ACTIVE', imageUrl: values.imageUrl || null,
        items: values.items.map((item, index) => ({ inventoryNumber: inventoryFor(index), manufactureYear: item.manufactureYear }))
      });
      message.success(`${response.data.count} ta qurilma qo‘shildi`); closeCreate(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Qurilmalarni saqlab bo‘lmadi'); }
  };

  const openEdit = (asset) => {
    setEditingAsset(asset);
    editForm.setFieldsValue({ name: asset.name, model: asset.model, inventoryNumber: asset.inventoryNumber, manufactureYear: asset.manufactureYear, departmentId: asset.departmentId, assignedUserId: asset.assignedUserId, status: asset.status, imageUrl: asset.imageUrl });
  };
  const updateAsset = async (values) => {
    try {
      await api.put(`/assets/${editingAsset.id}`, { ...values, assignedUserId: isWarehouse(values.departmentId) ? null : (values.assignedUserId || null), imageUrl: values.imageUrl || null });
      message.success('Qurilma yangilandi'); setEditingAsset(null); editForm.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Qurilmani yangilab bo‘lmadi'); }
  };
  const removeAsset = async (asset) => { try { await api.delete(`/assets/${asset.id}`); message.success('Qurilma o‘chirildi'); load(); } catch (error) { message.error(error.response?.data?.message || 'Qurilmani o‘chirib bo‘lmadi'); } };
  const imageButton = (form) => <Upload accept="image/*" maxCount={1} customRequest={uploadImage(form)} showUploadList={{ showRemoveIcon: false }}><Button icon={<UploadOutlined />}>Rasm tanlash</Button></Upload>;
  const userSelect = (departmentId) => <Select allowClear placeholder="Foydalanuvchini tanlang" options={availableUsers(departmentId)} />;
  const columns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 74, render: (url) => <SafeImage src={url} /> },
    { title: 'Nomi', dataIndex: 'name', render: (text, row) => <Link to={`/assets/${row.id}`}>{text}</Link> },
    { title: 'Model', dataIndex: 'model' }, { title: 'Inventar raqami', render: (asset) => <AssetInventoryLink asset={asset} /> }, { title: 'Yili', dataIndex: 'manufactureYear', render: (year) => year || '—' },
    { title: 'Bo‘lim', render: (row) => row.department?.name || '-' }, { title: 'Holat', dataIndex: 'status', width: 160, render: (status) => <AssetStatus status={status} /> },
    { title: 'Qurilma foydalanuvchisi', render: (row) => <UserNameLink user={row.assignedUser} fallback="-" /> },
    { title: 'Amallar', width: 130, render: (asset) => <Space size="small"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(asset)} aria-label="Tahrirlash" /><Popconfirm title="Qurilma o‘chirilsinmi?" description="Bu amalni qaytarib bo‘lmaydi." okText="O‘chirish" cancelText="Bekor qilish" okButtonProps={{ danger: true }} onConfirm={() => removeAsset(asset)}><Button type="text" danger icon={<DeleteOutlined />} aria-label="O‘chirish" /></Popconfirm></Space> }
  ];
  const visibleColumns = canManageAssets ? columns : columns.filter((column) => column.title !== 'Amallar');

  return <>
    <Space className="page-head">
      <Typography.Title level={2}>Aktivlar</Typography.Title>
      {canManageAssets && <Space>
        <Button icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>Excel import</Button>
        <Button type="primary" onClick={() => setCreateOpen(true)}>Qurilma qo‘shish</Button>
      </Space>}
    </Space>
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap style={{ width: '100%' }}>
          <Input
            allowClear
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Nomi, model, inventar raqami yoki yili bo‘yicha qidirish"
            style={{ width: 360, maxWidth: '100%' }}
          />
          <Select
            allowClear
            value={filters.status}
            onChange={(value) => updateFilter('status', value)}
            placeholder="Barcha holatlar"
            options={statusOptions}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.departmentId}
            onChange={(value) => updateFilter('departmentId', value)}
            placeholder="Barcha bo‘limlar"
            options={departmentOptions}
            style={{ width: 210 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.assetTypeId}
            onChange={(value) => updateFilter('assetTypeId', value)}
            placeholder="Barcha aktiv turlari"
            options={assetTypeOptions}
            style={{ width: 200 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.assignedUserId}
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                assignedUserId: value,
                assignment: value ? undefined : current.assignment,
                page: 1,
              }));
            }}
            placeholder="Barcha foydalanuvchilar"
            options={userOptions}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            value={filters.assignment}
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                assignment: value,
                assignedUserId: value ? undefined : current.assignedUserId,
                page: 1,
              }));
            }}
            placeholder="Biriktirish holati"
            options={[
              { value: 'assigned', label: 'Foydalanuvchiga biriktirilgan' },
              { value: 'unassigned', label: 'Biriktirilmagan' },
            ]}
            style={{ width: 230 }}
          />
          <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilters}>
            Filtrlarni tozalash
          </Button>
        </Space>
        <Typography.Text type="secondary">
          {hasFilters ? `${data.total} ta natija topildi` : `Jami ${data.total} ta aktiv`}
        </Typography.Text>
        <Table
          rowKey="id"
          dataSource={data.items}
          columns={visibleColumns}
          scroll={{ x: 1250 }}
          locale={{ emptyText: hasFilters ? 'Filtrlarga mos aktiv topilmadi' : 'Aktivlar mavjud emas' }}
          pagination={{
            total: data.total,
            current: filters.page,
            pageSize: filters.limit,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total, range) => `${range[0]}–${range[1]} / ${total}`,
            onChange: (page, limit) => setFilters({ ...filters, page, limit }),
          }}
        />
      </Space>
    </Card>
    <Modal
      className="asset-import-modal"
      title={<div><Typography.Title level={4}>Qurilmalarni Excel orqali import qilish</Typography.Title><Typography.Text type="secondary">20 000 tagacha qurilmani bir operatsiyada xavfsiz kiriting</Typography.Text></div>}
      open={importOpen}
      onCancel={closeImport}
      width={860}
      centered
      destroyOnClose
      footer={[
        <Button key="close" onClick={closeImport} disabled={importBusy}>Yopish</Button>,
        <Button key="check" onClick={() => uploadImport(false)} loading={importBusy} disabled={!importFile}>Tekshirish</Button>,
        <Button key="import" type="primary" icon={<FileExcelOutlined />} onClick={() => uploadImport(true)} loading={importBusy} disabled={!importPreview || importPreview.summary?.invalid > 0}>Import qilish</Button>
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Avval tayyor shablonni yuklab oling"
          description={<Space wrap><span>Excelda rasm fayli nomini yozing, masalan: 203020334.jpg. Rasmlarni alohida ZIP faylga joylang.</span><Button size="small" icon={<FileExcelOutlined />} onClick={() => downloadFile('/assets/import-template', 'qurilmalar-import-shabloni.xlsx')}>Shablonni yuklash</Button></Space>}
        />
        <Upload.Dragger
          accept=".xlsx"
          maxCount={1}
          beforeUpload={(file) => { setImportFile(file); setImportPreview(undefined); return false; }}
          onRemove={() => { setImportFile(undefined); setImportPreview(undefined); }}
          fileList={importFile ? [importFile] : []}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">Excel faylini shu yerga tashlang yoki tanlang</p>
          <p className="ant-upload-hint">Faqat .xlsx, maksimal 15 MB</p>
        </Upload.Dragger>
        <Upload.Dragger
          accept=".zip"
          maxCount={1}
          beforeUpload={(file) => { setImportImages(file); setImportPreview(undefined); return false; }}
          onRemove={() => { setImportImages(undefined); setImportPreview(undefined); }}
          fileList={importImages ? [importImages] : []}
          className="asset-import-images"
        >
          <p className="ant-upload-drag-icon"><FileZipOutlined /></p>
          <p className="ant-upload-text">Rasmlar ZIP fayli — ixtiyoriy</p>
          <p className="ant-upload-hint">JPG, PNG yoki WEBP rasmlar; ZIP maksimal 100 MB, har bir rasm maksimal 8 MB</p>
        </Upload.Dragger>
        {importPreview?.summary && <div className="import-summary-grid">
          <Card size="small"><span>Jami qator</span><strong>{importPreview.summary.total}</strong></Card>
          <Card size="small" className="import-summary-valid"><span>Importga tayyor</span><strong>{importPreview.summary.valid}</strong></Card>
          <Card size="small" className="import-summary-invalid"><span>Xatolik</span><strong>{importPreview.summary.invalid}</strong></Card>
          <Card size="small"><span>Mos kelgan rasmlar</span><strong>{importPreview.images?.matched || 0}</strong><small>{importPreview.images?.unused || 0} ta ishlatilmagan</small></Card>
        </div>}
        {importPreview?.errors?.length > 0 && <>
          <Alert type="error" showIcon message="Xatolarni tuzatib, faylni qayta yuklang" description={importPreview.errorsTruncated ? 'Dastlabki 500 ta xato ko‘rsatildi.' : undefined} />
          <Table
            size="small"
            rowKey={(row, index) => `${row.rowNumber}-${index}`}
            dataSource={importPreview.errors}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            columns={[
              { title: 'Qator', dataIndex: 'rowNumber', width: 80 },
              { title: 'Inventar raqami', dataIndex: 'inventoryNumber', width: 180, render: (value) => value || '—' },
              { title: 'Muammo', dataIndex: 'messages', render: (items) => <Space wrap>{items.map((item) => <Tag color="red" key={item}>{item}</Tag>)}</Space> }
            ]}
          />
        </>}
        {importPreview?.summary?.invalid === 0 && <Alert type="success" showIcon message={`${importPreview.summary.valid} ta qurilma importga tayyor`} description="Import qilish tugmasini bosganda barcha qatorlar yagona xavfsiz operatsiyada saqlanadi." />}
      </Space>
    </Modal>
    <Modal className="asset-create-modal" title={<div><Typography.Title level={4}>Qurilmalarni qo‘shish</Typography.Title><Typography.Text type="secondary">Qurilma ma’lumotlari va inventar birliklarini kiriting</Typography.Text></div>} open={createOpen} onCancel={closeCreate} onOk={() => createForm.submit()} width={920} centered okText="Qurilmalarni saqlash" cancelText="Yopish" styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}>
      <Form form={createForm} layout="vertical" onFinish={createAssets} initialValues={{ items: [{ manufactureYear: new Date().getFullYear() }], status: 'ACTIVE' }}>
        <section className="asset-form-section">
          <div className="asset-form-section-head"><span>1</span><div><strong>Asosiy ma’lumotlar</strong><small>Qurilmaning nomi va modeli</small></div></div>
          <div className="asset-form-grid asset-form-grid-2">
            <Form.Item name="name" label="Nomi" rules={[{ required: true, message: 'Qurilma nomini kiriting' }]}><Input placeholder="Masalan: Printer" /></Form.Item>
            <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Modelni kiriting' }]}><Input placeholder="Masalan: Canon MF443dw" /></Form.Item>
          </div>
        </section>
        <section className="asset-form-section">
          <div className="asset-form-section-head"><span>2</span><div><strong>Joylashuv va holat</strong><small>Qurilma qayerda va kim foydalanishini belgilang</small></div></div>
          <div className="asset-form-grid asset-form-grid-3">
            <Form.Item name="departmentId" label="Bo‘lim" rules={[{ required: true, message: 'Bo‘limni tanlang' }]}><Select placeholder="Bo‘limni tanlang" options={departmentOptions} onChange={() => createForm.setFieldValue('assignedUserId', null)} /></Form.Item>
            {!isWarehouse(createDepartmentId) && <Form.Item name="assignedUserId" label="Qurilma foydalanuvchisi">{userSelect(createDepartmentId)}</Form.Item>}
            <Form.Item name="status" label="Holat"><Select options={statusOptions} /></Form.Item>
          </div>
        </section>
        <section className="asset-form-section">
          <div className="asset-form-section-head"><span>3</span><div><strong>Inventar va tasvir</strong><small>Birinchi inventar raqami qolgan qurilmalar uchun avtomatik davom ettiriladi</small></div></div>
          <div className="asset-form-grid asset-form-grid-2">
            <Form.Item label="Birinchi inventar raqami" required><Input value={baseInventory} onChange={(event) => setBaseInventory(event.target.value)} placeholder="Masalan: 203020334" /></Form.Item>
            <><Form.Item name="imageUrl" hidden><Input /></Form.Item><Form.Item label="Qurilma rasmi">{imageButton(createForm)}</Form.Item></>
          </div>
        </section>
        <section className="asset-form-section">
          <Form.List name="items">{(fields, { add, remove }) => <><div className="asset-form-section-head"><span>4</span><div><strong>Qurilma birliklari</strong><small>Har bir qurilmaning inventar raqami va ishlab chiqarilgan yili</small></div><Button className="asset-units-add" type="primary" shape="circle" size="large" icon={<PlusOutlined />} onClick={() => add({ manufactureYear: new Date().getFullYear() })} aria-label="Yana qurilma qo‘shish" title="Yana qurilma qo‘shish" /></div><div className="asset-unit-list">{fields.map((field, index) => <div className="asset-unit-card" key={field.key}><span className="asset-unit-index">{index + 1}</span><Form.Item label="Inventar raqami"><Input disabled value={inventoryFor(index)} placeholder="Birinchi raqamni kiriting" /></Form.Item><Form.Item {...field} name={[field.name, 'manufactureYear']} label="Yili" rules={[{ required: true, message: 'Qurilma yilini kiriting' }, { type: 'number', min: 1900, max: 2100, message: '1900–2100 oralig‘idagi yilni kiriting' }]}><InputNumber min={1900} max={2100} placeholder="Masalan: 2025" /></Form.Item><div className="asset-unit-actions">{fields.length > 1 && <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} aria-label="Qatorni o‘chirish" />}</div></div>)}</div></>}</Form.List>
        </section>
      </Form>
    </Modal>
    <Modal title="Qurilmani tahrirlash" open={Boolean(editingAsset)} onCancel={() => { setEditingAsset(null); editForm.resetFields(); }} onOk={() => editForm.submit()} okText="Saqlash">
      <Form form={editForm} layout="vertical" onFinish={updateAsset}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="model" label="Model" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="inventoryNumber" label="Inventar raqami" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="manufactureYear" label="Yili" rules={[{ type: 'number', min: 1900, max: 2100, message: '1900–2100 oralig‘idagi yilni kiriting' }]}><InputNumber min={1900} max={2100} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="departmentId" label="Bo‘lim" rules={[{ required: true }]}><Select options={departmentOptions} onChange={() => editForm.setFieldValue('assignedUserId', null)} /></Form.Item>
        {!isWarehouse(editDepartmentId) && <Form.Item name="assignedUserId" label="Qurilma foydalanuvchisi">{userSelect(editDepartmentId)}</Form.Item>}
        <Form.Item name="status" label="Holat" rules={[{ required: true }]}><Select options={statusOptions} /></Form.Item>
        <Form.Item name="imageUrl" hidden><Input /></Form.Item><Form.Item label="Rasm">{imageButton(editForm)}</Form.Item>
      </Form>
    </Modal>
  </>;
}
