import bcrypt from 'bcryptjs';
import { ApiError } from '../../utils/apiError.js';
import { userRepository } from './users.repository.js';

export const userService = {
  list: userRepository.list,
  get: userRepository.get,
  async create(data) {
    const login = data.login?.trim();
    if (!login || !data.password) throw new ApiError(400, 'Login va parol majburiy');
    return userRepository.create({ ...data, login, email: data.email || `${login}@local.invalid`, departmentId: data.departmentId ? Number(data.departmentId) : null, password: await bcrypt.hash(data.password, 10) });
  },
  async update(id, data) {
    if (data.password) data.password = await bcrypt.hash(data.password, 10); else delete data.password;
    if (data.login) data.login = data.login.trim();
    data.departmentId = data.departmentId ? Number(data.departmentId) : null;
    return userRepository.update(id, data);
  },
  remove: userRepository.remove,
};
