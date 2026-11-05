/** Error carrying an HTTP status, so controllers can `throw` instead of branching. */
class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Please sign in to continue.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to this.') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests. Please try again later.') {
    return new ApiError(429, message);
  }
}

module.exports = ApiError;
