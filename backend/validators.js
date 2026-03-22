import Joi from "joi";

export const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('analyst', 'admin').default('analyst'),
});

export const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

export const alertsQuerySchema = Joi.object({
  cursor: Joi.string().hex().length(24),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
});
