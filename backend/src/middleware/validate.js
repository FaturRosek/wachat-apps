const { ZodError } = require('zod');

const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const validatedData = await schema.parseAsync(req[source]);
      req[source] = validatedData;
      next();
    } catch (error) {
      if (error instanceof ZodError || error.name === 'ZodError') {
        const issues = error.issues || error.errors || [];
        const formattedErrors = issues.map((err) => ({
          field: Array.isArray(err.path) ? err.path.join('.') : String(err.path || ''),
          message: err.message
        }));

        return res.status(400).json({
          success: false,
          message: formattedErrors[0]?.message || 'Data yang dikirim tidak valid',
          errors: formattedErrors
        });
      }
      next(error);
    }
  };
};

module.exports = validate;
