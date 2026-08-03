import React, { useEffect, useState } from 'react';
import {
  EditOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  HistoryOutlined,
  LaptopOutlined,
  LockOutlined,
  PhoneOutlined,
  PlusOutlined,
  RollbackOutlined,
  SaveOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api, downloadFile } from '../api/client.js';
import AssetInventoryLink from '../components/AssetInventoryLink.jsx';
import OnlyOfficeEditor from '../components/OnlyOfficeEditor.jsx';
import SafeImage from '../components/SafeImage.jsx';
import UserNameLink from '../components/UserNameLink.jsx';
import { updateCurrentUser } from '../store/store.js';

const actStatus = {
  DRAFT: { label: 'Qoralama', color: 'default' },
  AWAITING_ENGINEER: { label: 'Muhandis tasdig‘i kutilmoqda', color: 'cyan' },
  PENDING: { label: 'Imzolash kutilmoqda', color: 'gold' },
  AWAITING_ACCEPTANCE: { label: 'Admin qabuli kutilmoqda', color: 'orange' },
  REVISION_REQUESTED: { label: 'Tuzatish talab qilindi', color: 'red' },
  SIGNED: { label: 'Imzolangan', color: 'green' },
  CANCELLED: { label: 'Bekor qilingan', color: 'red' },
};

export default function UserDetailsPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.user);
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const isOwnProfile = currentUser?.id === Number(id);
  const [user, setUser] = useState();
  const [acts, setActs] = useState([]);
  const [warehouseAssets, setWarehouseAssets] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [returningAll, setReturningAll] = useState(false);
  const [selectedAct, setSelectedAct] = useState();
  const [actBusy, setActBusy] = useState(false);
  const [editorData, setEditorData] = useState();
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorInstanceId, setEditorInstanceId] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [assignForm] = Form.useForm();
  const [signForm] = Form.useForm();
  const [acceptForm] = Form.useForm();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const load = async () => {
    const [userResponse, actsResponse] = await Promise.all([
      api.get(`/users/${id}`),
      api.get(`/delivery-acts/user/${id}`),
    ]);
    setUser(userResponse.data);
    setActs(actsResponse.data);
  };

  useEffect(() => {
    load().catch((error) => message.error(error.response?.data?.message || 'Ma’lumotlarni yuklab bo‘lmadi'));
  }, [id]);

  useEffect(() => {
    if (!user || !isOwnProfile) return;
    profileForm.setFieldsValue({
      fullName: user.fullName,
      phone: user.phone,
      servicePhone: user.servicePhone,
      extensionNumber: user.extensionNumber,
      passportSeries: user.passportSeries,
      pinfl: user.pinfl,
      imageUrl: user.imageUrl,
    });
  }, [user, isOwnProfile, profileForm]);

  const saveProfile = async (values) => {
    setProfileSaving(true);
    try {
      const payload = {
        fullName: values.fullName.trim(),
        phone: values.phone?.trim() || null,
        servicePhone: values.servicePhone?.trim() || null,
        extensionNumber: values.extensionNumber?.trim() || null,
        passportSeries: values.passportSeries?.replace(/[\s-]/g, '').toUpperCase() || null,
        pinfl: values.pinfl?.replace(/\s/g, '') || null,
        imageUrl: values.imageUrl || null,
      };
      const { data } = await api.patch('/users/me', payload);
      setUser((previous) => ({ ...previous, ...data }));
      dispatch(updateCurrentUser(data));
      message.success('Profil ma’lumotlari yangilandi');
    } catch (error) {
      message.error(error.response?.data?.message || 'Profilni yangilab bo‘lmadi');
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (values) => {
    setPasswordSaving(true);
    try {
      await api.patch('/users/me/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.resetFields();
      message.success('Parol muvaffaqiyatli yangilandi');
    } catch (error) {
      message.error(error.response?.data?.message || 'Parolni yangilab bo‘lmadi');
    } finally {
      setPasswordSaving(false);
    }
  };

  const uploadProfileImage = async ({ file, onSuccess, onError }) => {
    const body = new FormData();
    body.append('image', file);
    setImageUploading(true);
    try {
      const { data } = await api.post('/users/me/upload-image', body);
      profileForm.setFieldValue('imageUrl', data.imageUrl);
      onSuccess?.(data);
      message.success('Profil rasmi tayyorlandi. Saqlash tugmasini bosing');
    } catch (error) {
      onError?.(error);
      message.error(error.response?.data?.message || 'Rasmni yuklab bo‘lmadi');
    } finally {
      setImageUploading(false);
    }
  };

  const openAssign = async () => {
    try {
      const [assetsResponse, engineersResponse] = await Promise.all([
        api.get('/maintenance/warehouse-assets'),
        api.get('/delivery-acts/engineers/available', { params: { organizationId: user.department?.organizationId } }),
      ]);
      setWarehouseAssets(assetsResponse.data.filter((asset) => asset.status === 'ACTIVE' && !asset.assignedUserId));
      setEngineers(engineersResponse.data);
      setAssignOpen(true);
    } catch (error) {
      message.error(error.response?.data?.message || 'Omborxonadagi qurilmalarni yuklab bo‘lmadi');
    }
  };

  const assignAsset = async ({ assetIds, engineerId }) => {
    setAssigning(true);
    try {
      await api.post('/transactions/assign-batch', {
        assetIds,
        engineerId,
        userId: Number(id),
        note: 'Xodim kartasi orqali biriktirildi',
      });
      message.success(`${assetIds.length} ta qurilma biriktirildi va bitta dalolatnoma yaratildi`);
      setAssignOpen(false);
      assignForm.resetFields();
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Qurilmani biriktirib bo‘lmadi');
    } finally {
      setAssigning(false);
    }
  };

  const returnAllAssets = () => {
    Modal.confirm({
      title: 'Barcha qurilmalarni topshirish',
      content: `${user.assets?.length || 0} ta qurilma uchun yagona qaytarish dalolatnomasi yaratiladi. Qurilmalar faqat dalolatnoma imzolangach omborxonaga o‘tkaziladi.`,
      okText: 'Dalolatnoma yaratish',
      cancelText: 'Bekor qilish',
      okButtonProps: { danger: true },
      onOk: async () => {
        setReturningAll(true);
        try {
          const { data } = await api.post('/delivery-acts/returns', { recipientId: Number(id) });
          message.success('Barcha qurilmalar uchun qaytarish dalolatnomasi yaratildi');
          await load();
          setEditorInstanceId(`return-act-editor-${data.id}-${Date.now()}`);
          setSelectedAct(data);
        } catch (error) {
          message.error(error.response?.data?.message || 'Qaytarish dalolatnomasini yaratib bo‘lmadi');
          throw error;
        } finally {
          setReturningAll(false);
        }
      },
    });
  };

  const openAct = async (act) => {
    try {
      setEditorInstanceId(`delivery-act-editor-${act.id}-${Date.now()}`);
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
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomani ochib bo‘lmadi');
    }
  };

  const sendAct = () => {
    let password = '';
    Modal.confirm({
      title: 'Topshiruvchi sifatida elektron imzolash',
      content: <Space direction="vertical" style={{ width: '100%' }}><Typography.Text>Parolingiz tasdiqlangach dalolatnomaga QR-imzo joylanadi.</Typography.Text><Input.Password autoComplete="current-password" placeholder="Joriy parolingiz" onChange={(event) => { password = event.target.value; }} /></Space>,
      okText: 'Imzolash va yuborish',
      cancelText: 'Bekor qilish',
      onOk: async () => {
        if (!password) { message.warning('Parolingizni kiriting'); return Promise.reject(); }
        setActBusy(true);
        try {
          await api.post(`/delivery-acts/${selectedAct.id}/send`, { documentKey: editorData?.config?.document?.key, password });
          message.success('Topshiruvchi QR-imzosi qo‘yildi va keyingi bosqichga yuborildi');
          setSelectedAct(undefined);
          await load();
        } catch (error) {
          message.error(error.response?.data?.message || 'Dalolatnomani imzolab yuborib bo‘lmadi');
          throw error;
        } finally { setActBusy(false); }
      },
    });
  };

  const signAct = async (values) => {
    setActBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/sign`, values);
      message.success('Dalolatnoma muvaffaqiyatli imzolandi');
      signForm.resetFields();
      setSelectedAct(undefined);
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomani imzolashda xatolik');
    } finally {
      setActBusy(false);
    }
  };

  const acceptReturnAct = async (values) => {
    setActBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/accept-return`, values);
      message.success('Qurilmalar tekshirildi va omborxonaga qabul qilindi');
      acceptForm.resetFields();
      setSelectedAct(undefined);
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Qurilmalarni qabul qilib bo‘lmadi');
    } finally {
      setActBusy(false);
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
        setSelectedAct(undefined);
        await load();
      },
    });
  };

  const resubmitAct = async () => {
    setActBusy(true);
    try {
      await api.post(`/delivery-acts/${selectedAct.id}/resubmit`, {
        documentKey: editorData?.config?.document?.key,
      });
      message.success('Tuzatilgan dalolatnoma qayta yuborildi');
      setSelectedAct(undefined);
      await load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Dalolatnomani qayta yuborib bo‘lmadi');
    } finally {
      setActBusy(false);
    }
  };

  const getPdf = (act) => downloadFile(`/delivery-acts/${act.id}/pdf`, `${act.number}.pdf`);
  const getDoc = (act) => downloadFile(`/delivery-acts/${act.id}/doc`, `${act.number}.docx`);

  useEffect(() => {
    if (!selectedAct) {
      setEditorData(undefined);
      return;
    }
    let active = true;
    setEditorLoading(true);
    api.get(`/delivery-acts/${selectedAct.id}/editor-config`)
      .then((response) => { if (active) setEditorData(response.data); })
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
        condition: 'GOOD',
        damageNote: '',
      })),
    });
  }, [selectedAct?.id, selectedAct?.status, acceptForm]);

  if (!user) return null;
  const assets = user.assets || [];

  const actAction = (act) => {
    const status = actStatus[act.status];
    return (
      <Space direction="vertical" size={4} align="start">
        <Tag color={status.color}>{status.label}</Tag>
        <Space size="small">
          <Tooltip
            title={act.status === 'PENDING' && currentUser?.id === act.recipientId
              ? 'Ko‘rish va imzolash'
              : 'Ko‘rish'}
          >
            <Button
              size="small"
              shape="circle"
              icon={<EyeOutlined />}
              onClick={() => openAct(act)}
              aria-label="Dalolatnomani ko‘rish"
              style={{ color: '#1677ff', borderColor: '#91caff', background: '#e6f4ff' }}
            />
          </Tooltip>
          {act.status === 'SIGNED' && (
            <>
              <Tooltip title="DOC yuklab olish">
                <Button
                  size="small"
                  shape="circle"
                  icon={<FileWordOutlined />}
                  onClick={() => getDoc(act)}
                  aria-label="DOC yuklab olish"
                  style={{ color: '#2b579a', borderColor: '#9bb7dc', background: '#edf4fc' }}
                />
              </Tooltip>
              <Tooltip title="PDF yuklab olish">
                <Button
                  size="small"
                  shape="circle"
                  icon={<FilePdfOutlined />}
                  onClick={() => getPdf(act)}
                  aria-label="PDF yuklab olish"
                  style={{ color: '#d93025', borderColor: '#ffaaa5', background: '#fff1f0' }}
                />
              </Tooltip>
            </>
          )}
        </Space>
      </Space>
    );
  };

  const assetColumns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 72, render: (url) => <SafeImage src={url} width={42} height={42} /> },
    { title: 'Qurilma', dataIndex: 'name' },
    { title: 'Model', dataIndex: 'model' },
    { title: 'Inventar raqami', render: (asset) => <AssetInventoryLink asset={asset} /> },
    { title: 'Yili', dataIndex: 'manufactureYear', render: (year) => year || '—' },
    { title: 'Bo‘lim', render: (asset) => asset.department?.name || '—' },
  ];

  const actAssets = (act) => act.snapshot?.assets?.length
    ? act.snapshot.assets
    : [act.snapshot?.asset || act.asset].filter(Boolean);

  const actColumns = [
    { title: 'Dalolatnoma', dataIndex: 'number', width: 180 },
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
    { title: 'Soni', width: 80, align: 'center', render: (act) => actAssets(act).length },
    { title: 'Yaratilgan', width: 170, render: (act) => new Date(act.createdAt).toLocaleString('uz-UZ') },
    { title: 'Holati va amallar', width: 210, render: actAction },
  ];

  const historyColumns = [
    {
      title: 'Amal',
      dataIndex: 'type',
      render: (type) => (
        <Tag color={type === 'ASSIGN' ? 'green' : 'blue'}>
          {type === 'ASSIGN' ? 'QABUL QILDI' : 'TOPSHIRDI'}
        </Tag>
      ),
    },
    { title: 'Qurilma', render: (row) => row.asset?.name || '—' },
    { title: 'Model', render: (row) => row.asset?.model || '—' },
    { title: 'Inventar raqami', render: (row) => <AssetInventoryLink asset={row.asset} /> },
    {
      title: 'Bo‘lim yo‘nalishi',
      render: (row) => <span>{row.fromDepartment?.name || '—'} <span className="history-arrow">→</span> {row.toDepartment?.name || '—'}</span>,
    },
    {
      title: 'Xodim yo‘nalishi',
      render: (row) => <span><UserNameLink user={row.fromUser} fallback="Biriktirilmagan" /> <span className="history-arrow">→</span> <UserNameLink user={row.user} fallback="Biriktirilmagan" /></span>,
    },
    { title: 'Sana', dataIndex: 'createdAt', render: (date) => new Date(date).toLocaleString('uz-UZ') },
  ];

  const canSign = selectedAct?.status === 'PENDING' && currentUser?.id === selectedAct?.recipientId;
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
    <div className="user-detail">
      <Card className="user-hero" variant="borderless">
        <div className="user-avatar"><SafeImage src={user.imageUrl} width={96} height={96} rounded user preview /></div>
        <div>
          <Typography.Text className="asset-kicker">FOYDALANUVCHI KARTASI</Typography.Text>
          <Typography.Title level={2}>{user.fullName}</Typography.Title>
          <div className="user-meta">
            <span><UserOutlined /> Lavozimi: {user.departmentPosition?.position?.name || 'Kiritilmagan'}</span>
            <span><UserOutlined /> Login: {user.login || '—'}</span>
            <span><PhoneOutlined /> Shaxsiy: {user.phone || 'Kiritilmagan'}</span>
            <span><PhoneOutlined /> Xizmat: {user.servicePhone ? `${user.servicePhone}${user.extensionNumber ? ` (${user.extensionNumber})` : ''}` : 'Kiritilmagan'}</span>
            <Tag color="blue">{user.role}</Tag>
          </div>
        </div>
        {!isAdmin && isOwnProfile && (
          <Button
            className="profile-settings-trigger"
            ghost
            icon={<EditOutlined />}
            onClick={() => setProfileSettingsOpen(true)}
          >
            Profil sozlamalari
          </Button>
        )}
        <div className="user-stat"><LaptopOutlined /><span><strong>{assets.length}</strong>Hozirgi qurilmalar</span></div>
      </Card>

      {!isAdmin && isOwnProfile && (
        <Modal
          open={profileSettingsOpen}
          onCancel={() => setProfileSettingsOpen(false)}
          footer={null}
          width={1120}
          title={<Space><EditOutlined /> Profil sozlamalari</Space>}
          className="profile-settings-modal"
        >
          <Row gutter={[32, 24]}>
            <Col xs={24} lg={15}>
              <Form form={profileForm} layout="vertical" onFinish={saveProfile}>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="fullName"
                      label="Ism-familiya"
                      rules={[
                        { required: true, message: 'Ism-familiyangizni kiriting' },
                        { min: 3, max: 120, message: '3 dan 120 tagacha belgi kiriting' },
                      ]}
                    >
                      <Input prefix={<UserOutlined />} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="phone" label="Shaxsiy telefon raqami">
                      <Input prefix={<PhoneOutlined />} placeholder="+998 90 123 45 67" maxLength={40} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="servicePhone" label="Xizmat telefoni">
                      <Input prefix={<PhoneOutlined />} placeholder="+998 71 123 45 67" maxLength={40} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="extensionNumber" label="Ichki raqam" rules={[{ pattern: /^\d{1,12}$/, message: 'Faqat raqam kiriting' }]}>
                      <Input placeholder="Masalan: 01401" maxLength={12} inputMode="numeric" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="passportSeries"
                      label="Pasport seria raqami"
                      rules={[{ pattern: /^[A-Za-z]{2}\d{7}$/, message: 'Masalan: AA1234567' }]}
                    >
                      <Input placeholder="AA1234567" maxLength={9} style={{ textTransform: 'uppercase' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="pinfl"
                      label="JShShIR"
                      rules={[{ pattern: /^\d{14}$/, message: 'JShShIR 14 ta raqamdan iborat bo‘lishi kerak' }]}
                    >
                      <Input placeholder="14 ta raqam" maxLength={14} inputMode="numeric" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="imageUrl" hidden><Input /></Form.Item>
                <Form.Item label="Profil rasmi">
                  <Space wrap>
                    <Upload
                      accept="image/*"
                      maxCount={1}
                      customRequest={uploadProfileImage}
                      showUploadList={{ showRemoveIcon: false }}
                    >
                      <Button icon={<UploadOutlined />} loading={imageUploading}>Rasm tanlash</Button>
                    </Upload>
                    <Typography.Text type="secondary">JPG yoki PNG, maksimal 5 MB</Typography.Text>
                  </Space>
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={profileSaving}>
                  O‘zgarishlarni saqlash
                </Button>
              </Form>
            </Col>
            <Col xs={24} lg={9}>
              <div className="profile-password-panel">
                <Typography.Title level={5}><LockOutlined /> Parolni almashtirish</Typography.Title>
                <Typography.Paragraph type="secondary">
                  Xavfsizlik uchun avval joriy parolingizni kiriting.
                </Typography.Paragraph>
                <Divider />
                <Form form={passwordForm} layout="vertical" onFinish={changePassword}>
                  <Form.Item
                    name="currentPassword"
                    label="Joriy parol"
                    rules={[{ required: true, message: 'Joriy parolingizni kiriting' }]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Form.Item
                    name="newPassword"
                    label="Yangi parol"
                    rules={[
                      { required: true, message: 'Yangi parolni kiriting' },
                      { min: 8, message: 'Yangi parol kamida 8 belgidan iborat bo‘lsin' },
                    ]}
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item
                    name="confirmPassword"
                    label="Yangi parolni takrorlang"
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: 'Yangi parolni takrorlang' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          return !value || getFieldValue('newPassword') === value
                            ? Promise.resolve()
                            : Promise.reject(new Error('Parollar bir xil emas'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Button htmlType="submit" icon={<LockOutlined />} loading={passwordSaving}>
                    Parolni yangilash
                  </Button>
                </Form>
              </div>
            </Col>
          </Row>
        </Modal>
      )}

      <Card
        title="Hozir foydalanayotgan qurilmalar"
        className="user-section"
        extra={(
          <Space>
            {assets.length > 0 && (isOwnProfile || isAdmin) && (
              <Button danger icon={<RollbackOutlined />} loading={returningAll} onClick={returnAllAssets}>
                Barchasini topshirish
              </Button>
            )}
            {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={openAssign}>Yangi qurilma</Button>}
            <Tag icon={<LaptopOutlined />}>{assets.length} ta qurilma</Tag>
          </Space>
        )}
      >
        {assets.length
          ? <Table rowKey="id" dataSource={assets} columns={assetColumns} scroll={{ x: 1120 }} pagination={{ pageSize: 8, showSizeChanger: false }} />
          : <Empty description="Hozircha biriktirilgan qurilma yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </Card>

      <Card title="Oldingi qurilmalardan foydalanish tarixi" className="user-section" extra={<HistoryOutlined />}>
        {user.history?.length
          ? <Table rowKey="id" dataSource={user.history} columns={historyColumns} scroll={{ x: 1180 }} pagination={{ pageSize: 8, showSizeChanger: false }} />
          : <Empty description="Qurilmalar tarixi hali yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </Card>

      <Modal
        title={`${user.fullName}ga yangi qurilma biriktirish`}
        open={assignOpen}
        onCancel={() => { setAssignOpen(false); assignForm.resetFields(); }}
        onOk={() => assignForm.submit()}
        okText="Biriktirish"
        cancelText="Bekor qilish"
        confirmLoading={assigning}
      >
        <Form form={assignForm} layout="vertical" onFinish={assignAsset}>
          <Form.Item name="assetIds" label="Omborxonadagi qurilmalar" rules={[{ required: true, message: 'Kamida bitta qurilmani tanlang' }]}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder="Bir yoki bir nechta qurilmani tanlang"
              maxTagCount="responsive"
              notFoundContent="Omborxonada bo‘sh qurilma mavjud emas"
              options={warehouseAssets.map((asset) => ({
                value: asset.id,
                label: `${asset.name} — ${asset.model || 'Model ko‘rsatilmagan'} — ${asset.inventoryNumber}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="engineerId" label="Yetkazib o‘rnatuvchi muhandis" rules={[{ required: true, message: 'TB va XK muhandisini tanlang' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="TB va XK muhandisini tanlang"
              options={engineers.map((engineer) => ({ value: engineer.id, label: `${engineer.fullName} — ${engineer.department?.name || ''}` }))}
              notFoundContent="TB va XK muhandisi tayinlanmagan"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        width={1000}
        title={selectedAct ? `Dalolatnoma ${selectedAct.number}` : 'Dalolatnoma'}
        open={Boolean(selectedAct)}
        onCancel={() => setSelectedAct(undefined)}
        footer={selectedAct?.status === 'DRAFT' && isAdmin
          ? [
            <Button key="cancel" onClick={() => setSelectedAct(undefined)}>Bekor qilish</Button>,
            <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
            <Button
              key="send"
              type="primary"
              loading={actBusy}
              disabled={!editorData}
              onClick={sendAct}
            >
              Imzolash uchun yuborish
            </Button>,
          ]
          : canSign
            ? [
              <Button key="cancel" onClick={() => setSelectedAct(undefined)}>Bekor qilish</Button>,
              <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
              ...(canRequestRevision ? [<Button key="revision" danger onClick={requestRevision}>Tuzatishga qaytarish</Button>] : []),
              <Button key="sign" type="primary" loading={actBusy} onClick={() => signForm.submit()}>Imzolash</Button>,
            ]
            : canAccept
              ? [
                <Button key="cancel" onClick={() => setSelectedAct(undefined)}>Bekor qilish</Button>,
                <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
                <Button key="revision" danger onClick={requestRevision}>Tuzatishga qaytarish</Button>,
                <Button
                  key="accept"
                  type="primary"
                  loading={actBusy}
                  onClick={() => acceptForm.validateFields()
                    .then(acceptReturnAct)
                    .catch(() => message.warning('Barcha qurilmalar holati va admin parolini kiriting'))}
                >
                  Qabul qilish va imzolash
                </Button>,
              ]
              : canResubmit
                ? [
                  <Button key="cancel" onClick={() => setSelectedAct(undefined)}>Bekor qilish</Button>,
                  <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
                  <Button key="resubmit" type="primary" loading={actBusy} disabled={!editorData} onClick={resubmitAct}>
                    Tuzatib qayta yuborish
                  </Button>,
                ]
            : [
              <Button key="doc" icon={<FileWordOutlined />} onClick={() => getDoc(selectedAct)}>DOC yuklab olish</Button>,
              <Button key="pdf" icon={<FilePdfOutlined />} onClick={() => getPdf(selectedAct)}>PDF yuklab olish</Button>,
              <Button key="close" type="primary" onClick={() => setSelectedAct(undefined)}>Yopish</Button>,
            ]}
      >
        {selectedAct && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Tag color={actStatus[selectedAct.status].color}>{actStatus[selectedAct.status].label}</Tag>
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
                  onError={(errorCode, errorDescription) => {
                    message.error(`ONLYOFFICE xatosi: ${errorDescription || errorCode}`);
                  }}
                />
              )}
            </div>

            {canSign && (
              <Form form={signForm} layout="vertical" onFinish={signAct}>
                <Form.Item
                  name="accepted"
                  valuePropName="checked"
                  rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Tasdiqlash belgisini qo‘ying')) }]}
                >
                  <Checkbox>Qurilmani va dalolatnomadagi ma’lumotlarni qabul qilaman</Checkbox>
                </Form.Item>
                <Form.Item name="password" label="Joriy parolingiz" rules={[{ required: true, message: 'Parolingizni kiriting' }]}>
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
              </Form>
            )}
            {canAccept && (
              <Form form={acceptForm} layout="vertical" onFinish={acceptReturnAct}>
                <Typography.Title level={5}>Qurilmalarni qabul qilishdan oldin tekshirish</Typography.Title>
                {(selectedAct.snapshot?.assets || []).map((asset, index) => (
                  <Card key={asset.id} size="small" style={{ marginBottom: 12 }}>
                    <Typography.Text strong>{asset.name} — {asset.inventoryNumber}</Typography.Text>
                    <Form.Item name={['reviews', index, 'assetId']} hidden><Input /></Form.Item>
                    <Form.Item
                      name={['reviews', index, 'condition']}
                      label="Qurilma holati"
                      rules={[{ required: true, message: 'Holatni belgilang' }]}
                    >
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
                          <Input.TextArea rows={2} placeholder="Aniqlangan shikast, yetishmayotgan qism yoki nosozlik" />
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
          </Space>
        )}
      </Modal>
    </div>
  );
}
