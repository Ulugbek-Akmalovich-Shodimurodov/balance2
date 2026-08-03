import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { userRepository } from '../users/users.repository.js';
import { ApiError } from '../../utils/apiError.js';
import { captchaService } from './captcha.service.js';

export const authService = {
  async login({ login, password, captchaToken, captchaAnswer }) {
    captchaService.verify(captchaToken, captchaAnswer);
    const identifier = login.trim().toLowerCase();
    const user = await userRepository.findByLogin(identifier);
    if (!user || !(await bcrypt.compare(password, user.password))) throw new ApiError(401, 'Login yoki parol noto‘g‘ri');
    const payload = { id: user.id, login: user.login, email: user.email, fullName: user.fullName, role: user.role, managedOrganizationId: user.managedOrganizationId || null };
    return { token: jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn }), user: payload };
  },
};
