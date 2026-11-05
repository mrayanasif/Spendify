const ApiError = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong on our side.';
  let details = err.details || null;

  // Turn the noisier mongoose/mongo errors into something a student can read.
  if (err.name === 'ValidationError') {
    status = 400;
    details = Object.values(err.errors).map((e) => e.message);
    message = details[0] || 'Please check the values you entered.';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'That record id is not valid.';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {}).join(', ');
    message = field.includes('email')
      ? 'An account with that email already exists.'
      : `A record with the same ${field || 'value'} already exists.`;
  }

  if (status >= 500) console.error(err);

  res.status(status).json({ error: message, details });
}

module.exports = { notFound, errorHandler };
