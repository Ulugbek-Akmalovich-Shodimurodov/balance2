import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircleFilled,
  DownloadOutlined,
  EditOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useSelector } from 'react-redux';
import { api, downloadFile } from '../api/client.js';
import AssetInventoryLink from '../components/AssetInventoryLink.jsx';
import OnlyOfficeEditor from '../components/OnlyOfficeEditor.jsx';
import UserNameLink from '../components/UserNameLink.jsx';

const { RangePicker } = DatePicker;
const statusMeta = {
  DRAFT: { label: 'Qoralama', color: 'default' },
  PENDING: { label: 'Imzolash kutilmoqda', color: 'gold' },
  AWAITING_ACCEPTANCE: { label: 'Admin qabuli kutilmoqda', color: 'orange' },
  AWAITING_ENGINEER: { label: 'Muhandis tasdig‘i kutilmoqda', color: 'cyan' },
  REVISION_REQUESTED: { label: 'Tuzatish talab qilindi', color: 'red' },
  SIGNED: { label: 'Imzolangan', color: 'green' },
  CANCELLED: { label: 'Bekor qilingan', color: 'red' },
};
const statusGroups = {
  ALL: null,
  SIGNED: ['SIGNED'],
  IN_PROGRESS: ['PENDING', 'AWAITING_ENGINEER', 'AWAITING_ACCEPTANCE', 'REVISION_REQUESTED'],
  DRAFT: ['DRAFT'],
  CANCELLED: ['CANCELLED'],
};
const statusTabLabels = {
  ALL: 'Barchasi',
  SIGNED: 'Imzolangan',
  IN_PROGRESS: 'Imzolash jarayonida',
  DRAFT: 'Qoralama',
  CANCELLED: 'Bekor qilingan',
};
const tabForStatus = (value) => Object.entries(statusGroups)
  .find(([key, statuses]) => key !== 'ALL' && statuses.includes(value))?.[0] || 'ALL';

const actAssets = (act) => act.snapshot?.assets?.length
  ? act.snapshot.assets
  : [act.snapshot?.asset || act.asset].filter(Boolean);

export default function DeliveryActsPage() {
  const currentUser = useSelector((state) => state.auth.user);
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState();
  const [activeStatusTab, setActiveStatusTab] = useState('ALL');
  const [recipientId, setRecipientId] = useState();
  const [dateRange, setDateRange] = useState();
  const [selectedAct, setSelectedAct] = useState();
  const [editorData, setEditorData] = useState();
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorInstanceId, setEditorInstanceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfPreview, setPdfPreview] = useState();
  const [signOpen, setSignOpen] = useState(false);
  const [signForm] = Form.useForm();
  const [acceptForm] = Form.useForm();
  const [engineerForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/delivery-acts');
      setItems(data);
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomalarni yuklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview?.url]);

  const openAct = (act) => {
    setEditorInstanceId(`delivery-acts-page-editor-${act.id}-${Date.now()}`);
    setSelectedAct(act);
    if (act.status === 'AWAITING_ACCEPTANCE' && act.snapshot?.type === 'RETURN') {
      acceptForm.setFieldsValue({
        password: '',
        reviews: (act.snapshot.assets || []).map((asset) => ({
          assetId: asset.id,
          condition: asset.condition === 'Shikastlangan' ? 'DAMAGED' : 'GOOD',
          damageNote: asset.damageNote || '',
        })),
      });
    }
    if (act.status === 'AWAITING_ENGINEER' && act.engineerId === currentUser?.id) {
      engineerForm.setFieldsValue({
        accepted: false,
        password: '',
        note: '',
        reviews: (act.snapshot?.assets || []).map((asset) => ({
          assetId: asset.id,
          condition: 'GOOD',
          damageNote: '',
        })),
      });
    }
  };

  const closeAct = () => {
    setSignOpen(false);
    setSelectedAct(undefined);
    setEditorData(undefined);
    signForm.resetFields();
    acceptForm.resetFields();
    engineerForm.resetFields();
  };

  useEffect(() => {
    if (!selectedAct) return undefined;
    let active = true;
    setEditorLoading(true);
    api.get(`/delivery-acts/${selectedAct.id}/editor-config`)
      .then(({ data }) => { if (active) setEditorData(data); })
      .catch((error) => message.error(error.response?.data?.message || 'ONLYOFFICE muharririni ochib bo‘lmadi'))
      .finally(() => { if (active) setEditorLoading(false); });
    return () => { active = false; };
  }, [selectedAct?.id]);

  useEffect(() => {
    if (selectedAct?.status !== 'AWAITING_ACCEPTANCE' || selectedAct?.snapshot?.type !== 'RETURN') return;
    acceptForm.setFieldsValue({
      password: '',
      reviews: (selectedAct.snapshot.assets || []).map((asset) => ({
        assetId: asset.id,
        condition: asset.condition === 'Shikastlangan' ? 'DAMAGED' : 'GOOD',
        damageNote: asset.damageNote || '',
      })),
    });
  }, [selectedAct?.id, selectedAct?.status, acceptForm]);

  const sendAct = () => {
    let password = '';
    Modal.confirm({
      title: 'Topshiruvchi sifatida elektron imzolash',
      content: <Space direction="vertical" style={{ width: '100%' }}><Typography.Text>Parolingiz tasdiqlangach dalolatnomaga QR-imzo joylanadi.</Typography.Text><Input.Password autoComplete="current-password" placeholder="Joriy parolingiz" onChange={(event) => { password = event.target.value; }} /></Space>,
      okText: 'Imzolash va yuborish',
      cancelText: 'Bekor qilish',
      onOk: async () => {
        if (!password) { message.warning('Parolingizni kiriting'); return Promise.reject(); }
        setBusy(true);
        try {
          await api.post(`/delivery-acts/${selectedAct.id}/send`, { documentKey: editorData?.config?.document?.key, password });
          message.success('Topshiruvchi QR-imzosi qo‘yildi va keyingi bosqichga yuborildi');
          closeAct();
          await load();
        } catch (error) {
          message.error(error.response?.data?.message || 'Dalolatnomani imzolab yuborib bo‘lmadi');
          throw error;
        } finally { setBusy(false); }
      },
    });
  };

  const signAct = async (values) => {
    setBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/sign`, values);
      message.success('Dalolatnoma muvaffaqiyatli imzolandi');
      setSignOpen(false);
      closeAct();
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomani imzolab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const acceptReturnAct = async (values) => {
    setBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/accept-return`, values);
      message.success('Qurilmalar tekshirildi va omborxonaga qabul qilindi');
      acceptForm.resetFields();
      closeAct();
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Qurilmalarni qabul qilib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const confirmEngineer = async (values) => {
    setBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/engineer-confirm`, values);
      message.success(selectedAct.snapshot?.type === 'RETURN'
        ? 'Qurilmalar tekshirildi va ombor qabuliga yuborildi'
        : 'Qurilmalar o‘rnatildi va xodim imzosiga yuborildi');
      closeAct();
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Muhandis tasdig‘ini saqlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const requestRevision = () => {
    let reason = '';
    Modal.confirm({
      title: 'Dalolatnomani tuzatishga qaytarish',
      content: <Input.TextArea rows={4} placeholder="Aniqlangan xato yoki kamchilikni aniq yozing" onChange={(event) => { reason = event.target.value; }} />,
      okText: 'Tuzatishga qaytarish',
      cancelText: 'Bekor qilish',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!reason.trim()) {
          message.warning('Tuzatish sababini kiriting');
          return Promise.reject();
        }
        await api.post(`/delivery-acts/${selectedAct.id}/request-revision`, { reason: reason.trim() });
        message.success('Dalolatnoma tuzatishga qaytarildi');
        closeAct();
        await load();
      },
    });
  };

  const resubmitAct = async () => {
    setBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/resubmit`, {
        documentKey: editorData?.config?.document?.key,
      });
      message.success('Tuzatilgan dalolatnoma qayta yuborildi');
      closeAct();
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomani qayta yuborib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const getDoc = (act) => downloadFile(`/delivery-acts/${act.id}/doc`, `${act.number}.docx`);
  const closePdfPreview = () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview();
  };

  const openPdf = async (act) => {
    setPdfLoading(true);
    try {
      const response = await api.get(`/delivery-acts/${act.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      setPdfPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { url, act };
      });
    } catch (error) {
      message.error(error.response?.data?.message || 'PDF faylini ko‘rsatib bo‘lmadi');
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadPreviewPdf = () => {
    if (!pdfPreview) return;
    const link = document.createElement('a');
    link.href = pdfPreview.url;
    link.download = `${pdfPreview.act.number}.pdf`;
    link.click();
  };
  const recipientOptions = useMemo(() => {
    const recipients = new Map();
    items.forEach((act) => recipients.set(act.recipientId, act.recipient?.fullName || act.snapshot?.recipient?.fullName));
    return [...recipients].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const baseFilteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    return items.filter((act) => {
      const assets = actAssets(act);
      const matchesSearch = !needle || [
        act.number,
        act.recipient?.fullName,
        act.snapshot?.recipient?.fullName,
        ...assets.flatMap((asset) => [asset.name, asset.model, asset.inventoryNumber, asset.manufactureYear]),
      ].some((value) => String(value || '').toLocaleLowerCase('uz').includes(needle));
      const createdAt = new Date(act.createdAt);
      const matchesDate = !dateRange?.length
        || (createdAt >= dateRange[0].startOf('day').toDate() && createdAt <= dateRange[1].endOf('day').toDate());
      return matchesSearch
        && (!recipientId || act.recipientId === recipientId)
        && matchesDate;
    });
  }, [items, search, recipientId, dateRange]);

  const statusCounts = useMemo(() => Object.fromEntries(
    Object.entries(statusGroups).map(([key, statuses]) => [
      key,
      statuses
        ? baseFilteredItems.filter((act) => statuses.includes(act.status)).length
        : baseFilteredItems.length,
    ]),
  ), [baseFilteredItems]);

  const filteredItems = useMemo(() => {
    const tabStatuses = statusGroups[activeStatusTab];
    return baseFilteredItems.filter((act) => (
      (!tabStatuses || tabStatuses.includes(act.status))
      && (!status || act.status === status)
    ));
  }, [baseFilteredItems, activeStatusTab, status]);

  const hasFilters = Boolean(search || status || recipientId || dateRange?.length);
  const hasActiveView = hasFilters || activeStatusTab !== 'ALL';
  const actionButtons = (act) => (
    <Space size="small">
      {act.status !== 'SIGNED' && (
        <>
          <Tooltip title={act.status === 'PENDING' && currentUser?.id === act.recipientId ? 'Ko‘rish va imzolash' : 'Tahrirlash'}>
            <Button
              size="small"
              shape="circle"
              icon={<EditOutlined />}
              onClick={() => openAct(act)}
              style={{ color: '#1677ff', borderColor: '#91caff', background: '#e6f4ff' }}
            />
          </Tooltip>
          <Tooltip title="DOC yuklab olish">
            <Button
              size="small"
              shape="circle"
              icon={<FileWordOutlined />}
              onClick={() => getDoc(act)}
              style={{ color: '#2b579a', borderColor: '#9bb7dc', background: '#edf4fc' }}
            />
          </Tooltip>
        </>
      )}
      {act.status === 'SIGNED' && (
        <>
        <Tooltip title="PDF ko‘rish">
          <Button
            size="small"
            shape="circle"
            icon={<FilePdfOutlined />}
            loading={pdfLoading}
            onClick={() => openPdf(act)}
            style={{ color: '#d93025', borderColor: '#ffaaa5', background: '#fff1f0' }}
          />
        </Tooltip>
          <Tooltip title="Elektron imzolangan">
            <CheckCircleFilled style={{ color: '#52c41a', fontSize: 21 }} />
          </Tooltip>
        </>
      )}
    </Space>
  );

  const columns = [
    { title: 'Dalolatnoma', dataIndex: 'number', width: 175 },
    {
      title: 'Xodim',
      width: 190,
      render: (act) => (
        <UserNameLink
          user={act.recipient}
          id={act.recipientId}
          fullName={act.recipient?.fullName || act.snapshot?.recipient?.fullName}
        />
      ),
    },
    {
      title: 'Qurilmalar',
      render: (act) => (
        <Space wrap>
          {actAssets(act).map((asset) => (
            <Tag key={`${act.id}-${asset.id || asset.inventoryNumber}`}>
              {asset.model || asset.name} · <AssetInventoryLink asset={asset} />
            </Tag>
          ))}
        </Space>
      ),
    },
    { title: 'Soni', width: 70, align: 'center', render: (act) => actAssets(act).length },
    {
      title: 'Holati',
      width: 150,
      render: (act) => <Tag color={statusMeta[act.status]?.color}>{statusMeta[act.status]?.label || act.status}</Tag>,
    },
    { title: 'Yaratilgan', width: 170, render: (act) => new Date(act.createdAt).toLocaleString('uz-UZ') },
    { title: 'Amallar', width: 135, fixed: 'right', render: actionButtons },
  ];

  const canSign = selectedAct?.status === 'PENDING' && currentUser?.id === selectedAct?.recipientId;
  const canEngineer = selectedAct?.status === 'AWAITING_ENGINEER' && currentUser?.id === selectedAct?.engineerId;
  const canAccept = isAdmin
    && selectedAct?.status === 'AWAITING_ACCEPTANCE'
    && selectedAct?.snapshot?.type === 'RETURN';
  const canRequestRevision = (isAdmin
    && selectedAct?.snapshot?.type === 'RETURN'
    && selectedAct?.status === 'AWAITING_ACCEPTANCE')
    || (selectedAct?.snapshot?.type !== 'RETURN'
      && selectedAct?.status === 'PENDING'
      && selectedAct?.recipientId === currentUser?.id);
  const canResubmit = selectedAct?.snapshot?.type === 'RETURN'
    && selectedAct?.status === 'REVISION_REQUESTED'
    && selectedAct?.recipientId === currentUser?.id;

  return (
    <>
      <Typography.Title level={2}>Dalolatnomalar</Typography.Title>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Raqam, xodim, qurilma yoki inventar raqami"
              style={{ width: 350, maxWidth: '100%' }}
            />
            {isAdmin && (
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                value={recipientId}
                onChange={setRecipientId}
                options={recipientOptions}
                placeholder="Barcha xodimlar"
                style={{ width: 220 }}
              />
            )}
            <Select
              allowClear
              value={status}
              onChange={(value) => {
                setStatus(value);
                if (value) setActiveStatusTab(tabForStatus(value));
              }}
              placeholder="Barcha holatlar"
              style={{ width: 190 }}
              options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
            />
            <RangePicker value={dateRange} onChange={setDateRange} format="DD.MM.YYYY" />
            <Button
              icon={<ReloadOutlined />}
              disabled={!hasFilters}
              onClick={() => {
                setSearch('');
                setStatus(undefined);
                setRecipientId(undefined);
                setDateRange(undefined);
              }}
            >
              Filtrlarni tozalash
            </Button>
          </Space>
          <Tabs
            activeKey={activeStatusTab}
            onChange={(key) => {
              setActiveStatusTab(key);
              setStatus(undefined);
            }}
            items={Object.keys(statusGroups).map((key) => ({
              key,
              label: `${statusTabLabels[key]} (${statusCounts[key] || 0})`,
            }))}
          />
          <Typography.Text type="secondary">
            {hasActiveView ? `${filteredItems.length} ta natija (jami ${items.length})` : `Jami ${items.length} ta dalolatnoma`}
          </Typography.Text>
          {items.length || loading
            ? (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={filteredItems}
                columns={columns}
                scroll={{ x: 1200 }}
                pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [15, 30, 50] }}
                locale={{ emptyText: 'Filtrlarga mos dalolatnoma topilmadi' }}
              />
            )
            : <Empty description="Dalolatnomalar mavjud emas" />}
        </Space>
      </Card>

      <Modal
        width={1000}
        title={selectedAct ? `Dalolatnoma ${selectedAct.number}` : 'Dalolatnoma'}
        open={Boolean(selectedAct)}
        onCancel={closeAct}
        footer={selectedAct?.status === 'DRAFT' && isAdmin
          ? [
            <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
            <Button key="send" type="primary" loading={busy} disabled={!editorData} onClick={sendAct}>Imzolash uchun yuborish</Button>,
          ]
          : canSign
            ? [
              <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
              ...(canRequestRevision ? [<Button key="revision" danger onClick={requestRevision}>Tuzatishga qaytarish</Button>] : []),
              <Button key="sign" type="primary" onClick={() => setSignOpen(true)}>Imzolash</Button>,
            ]
            : canEngineer
              ? [
                <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
                <Button
                  key="engineer"
                  type="primary"
                  loading={busy}
                  onClick={() => engineerForm.validateFields()
                    .then(confirmEngineer)
                    .catch(() => message.warning('Tekshiruv ma’lumotlari va parolni to‘liq kiriting'))}
                >
                  Tekshirish va imzolash
                </Button>,
              ]
            : canAccept
              ? [
                <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
                <Button key="revision" danger onClick={requestRevision}>Tuzatishga qaytarish</Button>,
                <Button
                  key="accept"
                  type="primary"
                  loading={busy}
                  onClick={() => acceptForm.validateFields()
                    .then(acceptReturnAct)
                    .catch(() => message.warning('Barcha qurilmalar holati va admin parolini kiriting'))}
                >
                  Qabul qilish va imzolash
                </Button>,
              ]
              : canResubmit
                ? [
                  <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
                  <Button key="resubmit" type="primary" loading={busy} disabled={!editorData} onClick={resubmitAct}>
                    Tuzatib qayta yuborish
                  </Button>,
                ]
            : [
              <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
              ...(selectedAct?.status === 'SIGNED'
                ? [<Button key="pdf" icon={<FilePdfOutlined />} loading={pdfLoading} onClick={() => openPdf(selectedAct)}>PDF ko‘rish</Button>]
                : []),
              <Button key="close" type="primary" onClick={closeAct}>Yopish</Button>,
            ]}
      >
        {selectedAct && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Tag color={statusMeta[selectedAct.status]?.color}>{statusMeta[selectedAct.status]?.label}</Tag>
            {selectedAct.snapshot?.revisions?.length > 0 && (
              <Card size="small" title="Tuzatish sababi">
                {selectedAct.snapshot.revisions.at(-1).reason}
              </Card>
            )}
            <div className="act-editor-shell">
              {editorLoading && <div className="onlyoffice-loading">ONLYOFFICE muharriri yuklanmoqda...</div>}
              {editorData && (
                <OnlyOfficeEditor
                  id={editorInstanceId}
                  documentServerUrl={editorData.documentServerUrl}
                  config={editorData.config}
                  onDocumentReady={() => setEditorLoading(false)}
                  onError={(code, description) => message.error(`ONLYOFFICE xatosi: ${description || code}`)}
                />
              )}
            </div>
            {canAccept && (
              <Form form={acceptForm} layout="vertical" onFinish={acceptReturnAct}>
                <Typography.Title level={5}>Qurilmalarni qabul qilishdan oldin tekshirish</Typography.Title>
                {(selectedAct.snapshot?.assets || []).map((asset, index) => (
                  <Card key={asset.id} size="small" style={{ marginBottom: 12 }}>
                    <Typography.Text strong>{asset.name} — {asset.inventoryNumber}</Typography.Text>
                    <Form.Item name={['reviews', index, 'assetId']} hidden><Input /></Form.Item>
                    <Form.Item name={['reviews', index, 'condition']} label="Qurilma holati" rules={[{ required: true }]}>
                      <Select options={[
                        { value: 'GOOD', label: 'Soz, shikastsiz' },
                        { value: 'DAMAGED', label: 'Shikastlangan / nosoz' },
                      ]} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(previous, current) => previous.reviews?.[index]?.condition !== current.reviews?.[index]?.condition}>
                      {({ getFieldValue }) => getFieldValue(['reviews', index, 'condition']) === 'DAMAGED' && (
                        <Form.Item
                          name={['reviews', index, 'damageNote']}
                          label="Shikast yoki nosozlik tavsifi"
                          rules={[{ required: true, message: 'Shikastni batafsil yozing' }]}
                        >
                          <Input.TextArea rows={2} />
                        </Form.Item>
                      )}
                    </Form.Item>
                  </Card>
                ))}
                <Form.Item name="password" label="Admin paroli" rules={[{ required: true, message: 'Parolingizni kiriting' }]}>
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
              </Form>
            )}
            {canEngineer && (
              <Form form={engineerForm} layout="vertical" onFinish={confirmEngineer}>
                <Typography.Title level={5}>
                  {selectedAct.snapshot?.type === 'RETURN'
                    ? 'Qurilmalarni tekshirish va omborxonaga yetkazish'
                    : 'Qurilmalarni yetkazish, o‘rnatish va tekshirish'}
                </Typography.Title>
                {selectedAct.snapshot?.type === 'RETURN' && (selectedAct.snapshot?.assets || []).map((asset, index) => (
                  <Card key={asset.id} size="small" style={{ marginBottom: 12 }}>
                    <Typography.Text strong>{asset.name} — {asset.inventoryNumber}</Typography.Text>
                    <Form.Item name={['reviews', index, 'assetId']} hidden><Input /></Form.Item>
                    <Form.Item name={['reviews', index, 'condition']} label="Muhandis tekshiruvi" rules={[{ required: true }]}>
                      <Select options={[
                        { value: 'GOOD', label: 'Soz, shikastsiz' },
                        { value: 'DAMAGED', label: 'Shikastlangan / nosoz' },
                      ]} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) => getFieldValue(['reviews', index, 'condition']) === 'DAMAGED' && (
                        <Form.Item name={['reviews', index, 'damageNote']} label="Shikast yoki nosozlik" rules={[{ required: true, message: 'Kamchilikni yozing' }]}>
                          <Input.TextArea rows={2} />
                        </Form.Item>
                      )}
                    </Form.Item>
                  </Card>
                ))}
                <Form.Item name="note" label={selectedAct.snapshot?.type === 'RETURN' ? 'Yetkazish izohi' : 'O‘rnatish va sinov izohi'}>
                  <Input.TextArea rows={2} placeholder="Bajarilgan ishlar haqida qisqa izoh" />
                </Form.Item>
                <Form.Item name="accepted" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Tasdiqlang')) }]}>
                  <Checkbox>{selectedAct.snapshot?.type === 'RETURN' ? 'Qurilmalarni tekshirdim va omborxonaga yetkazdim' : 'Qurilmalarni soz holda o‘rnatdim va tekshirdim'}</Checkbox>
                </Form.Item>
                <Form.Item name="password" label="Muhandis paroli" rules={[{ required: true, message: 'Parolingizni kiriting' }]}>
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
              </Form>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        open={Boolean(pdfPreview)}
        onCancel={closePdfPreview}
        footer={null}
        width="min(1200px, 96vw)"
        centered
        destroyOnClose
        title={(
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingRight: 28 }}>
            <span>{pdfPreview ? `${pdfPreview.act.number}.pdf` : 'Dalolatnoma PDF'}</span>
            <Button type="primary" icon={<DownloadOutlined />} onClick={downloadPreviewPdf}>
              Yuklab olish
            </Button>
          </div>
        )}
        styles={{ body: { padding: 0, height: 'calc(100vh - 150px)', minHeight: 520, background: '#525659' } }}
      >
        {pdfPreview && (
          <iframe
            title={`${pdfPreview.act.number} PDF`}
            src={pdfPreview.url}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
        )}
      </Modal>

      <Modal
        title="Dalolatnomani imzolash"
        open={signOpen}
        onCancel={() => { setSignOpen(false); signForm.resetFields(); }}
        onOk={() => signForm.submit()}
        okText="Tasdiqlash va imzolash"
        cancelText="Bekor qilish"
        confirmLoading={busy}
        width={520}
        centered
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="Elektron imzoni tasdiqlang"
            description="Imzolagandan keyin dalolatnomani tahrirlash yoki Word shaklida yuklab olish mumkin bo‘lmaydi. Faqat yakuniy PDF saqlanadi."
          />
          <Form form={signForm} layout="vertical" onFinish={signAct}>
            <Form.Item
              name="accepted"
              valuePropName="checked"
              rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Tasdiqlash belgisini qo‘ying')) }]}
            >
              <Checkbox>Dalolatnoma va undagi barcha qurilmalarni qabul qilaman</Checkbox>
            </Form.Item>
            <Form.Item
              name="password"
              label="Joriy parolingiz"
              rules={[{ required: true, message: 'Parolingizni kiriting' }]}
            >
              <Input.Password autoComplete="current-password" placeholder="Parolingizni kiriting" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </>
  );
}
