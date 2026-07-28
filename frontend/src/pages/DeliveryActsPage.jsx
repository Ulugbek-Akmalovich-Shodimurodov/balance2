import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircleFilled,
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
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useSelector } from 'react-redux';
import { api, downloadFile } from '../api/client.js';
import OnlyOfficeEditor from '../components/OnlyOfficeEditor.jsx';

const { RangePicker } = DatePicker;
const statusMeta = {
  DRAFT: { label: 'Qoralama', color: 'default' },
  PENDING: { label: 'Imzolash kutilmoqda', color: 'gold' },
  SIGNED: { label: 'Imzolangan', color: 'green' },
  CANCELLED: { label: 'Bekor qilingan', color: 'red' },
};

const actAssets = (act) => act.snapshot?.assets?.length
  ? act.snapshot.assets
  : [act.snapshot?.asset || act.asset].filter(Boolean);

export default function DeliveryActsPage() {
  const currentUser = useSelector((state) => state.auth.user);
  const isAdmin = currentUser?.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState();
  const [recipientId, setRecipientId] = useState();
  const [dateRange, setDateRange] = useState();
  const [selectedAct, setSelectedAct] = useState();
  const [editorData, setEditorData] = useState();
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorInstanceId, setEditorInstanceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signForm] = Form.useForm();

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

  const openAct = (act) => {
    setEditorInstanceId(`delivery-acts-page-editor-${act.id}-${Date.now()}`);
    setSelectedAct(act);
  };

  const closeAct = () => {
    setSignOpen(false);
    setSelectedAct(undefined);
    setEditorData(undefined);
    signForm.resetFields();
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

  const sendAct = async () => {
    setBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/send`, {
        documentKey: editorData?.config?.document?.key,
      });
      message.success('Dalolatnoma imzolash uchun yuborildi');
      closeAct();
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomani yuborib bo‘lmadi');
    } finally {
      setBusy(false);
    }
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

  const getDoc = (act) => downloadFile(`/delivery-acts/${act.id}/doc`, `${act.number}.docx`);
  const getPdf = (act) => downloadFile(`/delivery-acts/${act.id}/pdf`, `${act.number}.pdf`);
  const recipientOptions = useMemo(() => {
    const recipients = new Map();
    items.forEach((act) => recipients.set(act.recipientId, act.recipient?.fullName || act.snapshot?.recipient?.fullName));
    return [...recipients].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    return items.filter((act) => {
      const assets = actAssets(act);
      const matchesSearch = !needle || [
        act.number,
        act.recipient?.fullName,
        act.snapshot?.recipient?.fullName,
        ...assets.flatMap((asset) => [asset.name, asset.model, asset.inventoryNumber, asset.serialNumber]),
      ].some((value) => String(value || '').toLocaleLowerCase('uz').includes(needle));
      const createdAt = new Date(act.createdAt);
      const matchesDate = !dateRange?.length
        || (createdAt >= dateRange[0].startOf('day').toDate() && createdAt <= dateRange[1].endOf('day').toDate());
      return matchesSearch
        && (!status || act.status === status)
        && (!recipientId || act.recipientId === recipientId)
        && matchesDate;
    });
  }, [items, search, status, recipientId, dateRange]);

  const hasFilters = Boolean(search || status || recipientId || dateRange?.length);
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
        <Tooltip title="PDF yuklab olish">
          <Button
            size="small"
            shape="circle"
            icon={<FilePdfOutlined />}
            onClick={() => getPdf(act)}
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
      render: (act) => act.recipient?.fullName || act.snapshot?.recipient?.fullName || '—',
    },
    {
      title: 'Qurilmalar',
      render: (act) => (
        <Space wrap>
          {actAssets(act).map((asset) => (
            <Tag key={`${act.id}-${asset.id || asset.inventoryNumber}`}>
              {asset.model || asset.name} · {asset.inventoryNumber}
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
              onChange={setStatus}
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
          <Typography.Text type="secondary">
            {hasFilters ? `${filteredItems.length} ta natija (jami ${items.length})` : `Jami ${items.length} ta dalolatnoma`}
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
              <Button key="sign" type="primary" onClick={() => setSignOpen(true)}>Imzolash</Button>,
            ]
            : [
              <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
              ...(selectedAct?.status === 'SIGNED'
                ? [<Button key="pdf" icon={<FilePdfOutlined />} onClick={() => getPdf(selectedAct)}>PDF yuklab olish</Button>]
                : []),
              <Button key="close" type="primary" onClick={closeAct}>Yopish</Button>,
            ]}
      >
        {selectedAct && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Tag color={statusMeta[selectedAct.status]?.color}>{statusMeta[selectedAct.status]?.label}</Tag>
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
          </Space>
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
