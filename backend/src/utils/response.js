const successResponse = (res, message, data = null, statusCode = 200, meta = null) => {
  const payload = {
    success: true,
    message,
    ...(data !== null && { data }),
    ...(meta !== null && { meta })
  };
  return res.status(statusCode).json(payload);
};

const errorResponse = (res, message, statusCode = 500, errors = null) => {
  const payload = {
    success: false,
    message,
    ...(errors !== null && { errors })
  };
  return res.status(statusCode).json(payload);
};

module.exports = {
  successResponse,
  errorResponse
};
