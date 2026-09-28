const AppError = require('../utils/appError');

const handlePostgresError = (err) => {
  if (err.code === '23505') {
    const detail = err.detail || 'Duplicate field value entered.';
    return new AppError(`Duplicate value error: ${detail}`, 409);
  }
  if (err.code === '23503') {
    const detail = err.detail || 'Referenced record does not exist.';
    return new AppError(`Resource relationship error: ${detail}`, 400);
  }
  if (err.code === '22P02') {
    return new AppError('Invalid input syntax / format.', 400);
  }
  return err;
};

const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Your token has expired. Please log in again.', 401);

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = err.status || 'error';

  if (err.code && err.code.length === 5) {
    error = handlePostgresError(err);
  }
  if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }
  if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  if (process.env.NODE_ENV === 'development') {
    return res.status(error.statusCode || 500).json({
      success: false,
      status: error.status,
      message: error.message,
      ...(error.errors && { errors: error.errors }),
      stack: err.stack
    });
  }

  if (error.isOperational) {
    return res.status(error.statusCode).json({
      success: false,
      status: error.status,
      message: error.message,
      ...(error.errors && { errors: error.errors })
    });
  }

  console.error('[Unhandled Server Error]:', err);
  return res.status(500).json({
    success: false,
    status: 'error',
    message: 'Something went wrong on the server.'
  });
};

const notFound = (req, res, next) => {
  next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404));
};

module.exports = {
  errorHandler,
  notFound
};
