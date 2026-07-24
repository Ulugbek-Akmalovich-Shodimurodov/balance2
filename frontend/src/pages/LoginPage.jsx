import React, { useState } from 'react';
import {
  AppstoreOutlined,
  DatabaseOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { setCredentials } from '../store/store.js';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', values);
      dispatch(setCredentials(data));
      message.success(`Xush kelibsiz, ${data.user.fullName}`);
      navigate('/');
    } catch (error) {
      if (!error.response) {
        message.error('Server bilan aloqa o‘rnatilmadi. Internet aloqasini tekshiring.');
      } else {
        message.error(error.response?.data?.message || 'Login yoki parol noto‘g‘ri');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login">
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-brand">
            <span className="login-brand-icon"><AppstoreOutlined /></span>
            <span>Aktivlar</span>
          </div>
          <div className="login-brand-content">
            <Typography.Text className="login-eyebrow">KORPORATIV BOSHQARUV TIZIMI</Typography.Text>
            <Typography.Title>Aktivlarni yagona platformada boshqaring</Typography.Title>
            <Typography.Paragraph>
              Tashkilot aktivlari, foydalanuvchilar, bo‘limlar va texnik xizmat
              jarayonlarini xavfsiz va markazlashgan tarzda nazorat qiling.
            </Typography.Paragraph>
            <div className="login-benefits">
              <div>
                <DatabaseOutlined />
                <span><strong>Markazlashgan hisob</strong>Barcha aktivlar bitta tizimda</span>
              </div>
              <div>
                <SafetyCertificateOutlined />
                <span><strong>Xavfsiz kirish</strong>Rol asosidagi boshqaruv</span>
              </div>
            </div>
          </div>
          <Typography.Text className="login-brand-footer">
            Aktivlarni boshqarish axborot tizimi
          </Typography.Text>
        </section>

        <section className="login-form-panel">
          <Card className="login-card" bordered={false}>
            <div className="login-mobile-brand">
              <span className="login-brand-icon"><AppstoreOutlined /></span>
              <span>Aktivlar</span>
            </div>
            <Typography.Text className="login-form-eyebrow">TIZIMGA KIRISH</Typography.Text>
            <Typography.Title level={2}>Xush kelibsiz</Typography.Title>
            <Typography.Paragraph className="login-form-description">
              Davom etish uchun hisob ma’lumotlaringizni kiriting.
            </Typography.Paragraph>

            <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
              <Form.Item
                name="login"
                label="Login"
                rules={[{ required: true, message: 'Loginni kiriting' }]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="Login nomingiz"
                  autoComplete="username"
                  autoFocus
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="Parol"
                rules={[{ required: true, message: 'Parolni kiriting' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Parolingiz"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={loading}
                className="login-submit"
              >
                Tizimga kirish
              </Button>
            </Form>

            <Typography.Text className="login-security-note">
              <SafetyCertificateOutlined /> Ma’lumotlaringiz himoyalangan kanal orqali uzatiladi
            </Typography.Text>
          </Card>
        </section>
      </div>
    </main>
  );
}
