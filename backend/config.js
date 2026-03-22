import Joi from "joi";

const envSchema = Joi.object({
  MONGO_URI: process.env.NODE_ENV === 'test'
    ? Joi.string().uri().optional()
    : Joi.string().uri().required(),
  JWT_SECRET: process.env.NODE_ENV === 'test'
    ? Joi.string().default('test-secret')
    : Joi.string().min(10).required(),
  JWT_EXPIRES: Joi.string().default("8h"),
  PORT: Joi.number().default(4000),
  ALLOWED_ORIGINS: Joi.string().default("*"),
}).unknown();

const { error, value: env } = envSchema.validate(process.env);
if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default {
  ...env,
};
