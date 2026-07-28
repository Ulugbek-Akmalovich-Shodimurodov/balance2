import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const baseUrl = process.env.SELF_PROFILE_TEST_URL || 'http://127.0.0.1:5000/api';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const login = `profile-test-${suffix}`;
let user;

const request = async (path, token, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

try {
  user = await prisma.user.create({
    data: {
      fullName: 'Profil Test Foydalanuvchi',
      login,
      email: `${login}@local.invalid`,
      password: await bcrypt.hash('CurrentPass123!', 10),
      role: 'VIEWER',
    },
  });
  const token = jwt.sign(
    { id: user.id, login: user.login, email: user.email, fullName: user.fullName, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '10m' },
  );

  const profileResult = await request('/users/me', token, {
    method: 'PATCH',
    body: JSON.stringify({
      fullName: 'Yangilangan Profil',
      phone: '+998901234567',
      passportSeries: 'AA1234567',
      pinfl: '12345678901234',
      imageUrl: null,
    }),
  });
  if (!profileResult.response.ok) throw new Error(`Profile update failed: ${JSON.stringify(profileResult.body)}`);
  if (profileResult.body.login !== login || profileResult.body.role !== 'VIEWER') {
    throw new Error('Self-profile response changed protected fields');
  }

  const passwordResult = await request('/users/me/password', token, {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword: 'CurrentPass123!', newPassword: 'NewPass123!' }),
  });
  if (!passwordResult.response.ok) throw new Error(`Password update failed: ${JSON.stringify(passwordResult.body)}`);
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!(await bcrypt.compare('NewPass123!', updatedUser.password))) throw new Error('New password was not persisted');

  const protectedResult = await request('/users/me', token, {
    method: 'PATCH',
    body: JSON.stringify({
      fullName: 'Ruxsatsiz Urinish',
      phone: null,
      passportSeries: null,
      pinfl: null,
      imageUrl: null,
      role: 'ADMIN',
    }),
  });
  if (protectedResult.response.status !== 400) throw new Error('Protected field was not rejected');

  const uploadResult = await fetch(`${baseUrl}/users/me/upload-image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (uploadResult.status !== 400) throw new Error('Empty image upload was not rejected');

  console.log('OK: self-profile update, password change, protected-field rejection and upload validation passed.');
} finally {
  if (user) {
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  await prisma.$disconnect();
}
