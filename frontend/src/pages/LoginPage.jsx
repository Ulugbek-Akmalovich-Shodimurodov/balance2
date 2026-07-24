import React from 'react';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { setCredentials } from '../store/store.js';

export default function LoginPage() {
  const dispatch = useDispatch(); const navigate = useNavigate();
  const onFinish = async (values) => { try { const { data } = await api.post('/auth/login', values); dispatch(setCredentials(data)); navigate('/'); } catch { message.error('Login yoki parol noto‘g‘ri'); } };
  return <div className="login"><Card className="login-card"><Typography.Title level={3}>Aktivlarni boshqarish</Typography.Title><Typography.Paragraph>Korxona aktivlarini nazorat qilish tizimi</Typography.Paragraph><Form layout="vertical" onFinish={onFinish} initialValues={{ login:'admin', password:'Admin123!' }}><Form.Item name="login" label="Login" rules={[{required:true}]}><Input prefix={<MailOutlined />} /></Form.Item><Form.Item name="password" label="Parol" rules={[{required:true}]}><Input.Password prefix={<LockOutlined />} /></Form.Item><Button type="primary" htmlType="submit" block size="large">Kirish</Button></Form></Card></div>;
}
