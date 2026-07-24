export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!parsed.success) return res.status(400).json({ message: 'Validatsiya xatosi', errors: parsed.error.flatten() });
  req.validated = parsed.data;
  next();
};
